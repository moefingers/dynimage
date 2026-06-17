import { redis } from "./redis";

// ─────────────────────────────────────────────────────────────────────
// L2 data cache (spec §6). Caches the upstream (GitHub/nitrotype)
// RESPONSE — never the rendered image (that's L1, a follow-on lane). The
// L2 TTL is the SOLE upstream-rate governor (spec invariant §14.4): every
// consumer — embed, editor preview, ?v= refresh — reads through here, so
// nothing fetches faster than the per-metric floor.
//
// Behaviour:
//   - fresh (age < ttl)          → serve, no upstream touch
//   - stale (ttl ≤ age < maxStale)→ serve immediately, revalidate in the
//                                    background (single-flight) [SWR]
//   - cold (no serveable entry)  → single-flight blocking fetch; losers
//                                    wait briefly for the winner
//   - single-flight (spec §6 + scout): one Redis lock per cache key so
//     simultaneous misses across regions coalesce into ONE upstream call.
//     This is the biggest mitigation for GitHub's 100-concurrent
//     secondary limit.
//   - ETag revalidation (scout): store the upstream ETag; a fetcher that
//     supports conditional requests returns {notModified} on a 304 — which
//     does NOT count against GitHub's primary limit. We refresh freshness
//     without counting an upstream fetch.
//   - Retry-After backoff + stale-if-error (scout, spec §14.1): on an
//     upstream rate-limit/error we set a backoff marker and DEGRADE TO
//     SERVING CACHED BYTES — never throw if any cached value exists.
// ─────────────────────────────────────────────────────────────────────

export type L2Entry<T> = {
  data: T;
  /** upstream ETag for conditional revalidation, or null if none. */
  etag: string | null;
  /** ms epoch when the data was actually fetched from upstream. */
  storedAt: number;
  /** per-metric freshness window in ms (copied in so reads are self-describing). */
  ttlMs: number;
};

/** Returned by a fetcher: either fresh data (+optional etag) or a 304. */
export type FetchResult<T> =
  | { data: T; etag?: string | null }
  | { notModified: true };

export type Fetcher<T> = (ctx: {
  prevEtag: string | null;
}) => Promise<FetchResult<T>>;

/** Throw this from a fetcher on a rate-limit/secondary trip so the cache backs off. */
export class UpstreamRateLimitError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "UpstreamRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** No cached value AND upstream unavailable — the one case we cannot serve cached bytes. */
export class UpstreamUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamUnavailableError";
  }
}

export type L2Options = {
  /** per-metric freshness window. */
  ttlMs: number;
  /** how long past ttl we keep serving stale (and stale-if-error). Default 24h. */
  maxStaleMs?: number;
  /** single-flight lock duration. Default 10s. */
  lockMs?: number;
  /** background-task hook (e.g. Vercel `after`/`waitUntil`) for SWR revalidation. */
  waitUntil?: (p: Promise<unknown>) => void;
  /** called whenever an ACTUAL data-bearing upstream fetch happens (not a 304, not a hit). For metering. */
  onUpstreamFetch?: () => void | Promise<void>;
};

const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOCK_MS = 10_000;
const COLD_WAIT_TOTAL_MS = 1500; // max a loser waits for the winner on a cold miss
const COLD_WAIT_STEP_MS = 75;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const DACE = "dyn:l2:"; // entry
const DACL = "dyn:l2lock:"; // single-flight lock
const DACB = "dyn:l2backoff:"; // rate-limit backoff marker

/**
 * Read-through the L2 cache. `key` is the caller-built
 * `provider:subject:metric:SCOPE` (public=shared, private=owner-namespaced
 * — a SECURITY-CORRECTNESS invariant the caller owns; this layer is
 * key-agnostic).
 */
export async function l2ReadThrough<T>(
  key: string,
  fetcher: Fetcher<T>,
  opts: L2Options,
): Promise<T> {
  const r = redis();
  const entryKey = DACE + key;
  const maxStaleMs = opts.maxStaleMs ?? DEFAULT_MAX_STALE_MS;

  const entry = (await r.get<L2Entry<T>>(entryKey)) ?? null;
  const now = Date.now();
  const age = entry ? now - entry.storedAt : Infinity;

  // FRESH → serve as-is.
  if (entry && age < opts.ttlMs) {
    return entry.data;
  }

  // STALE but serveable → serve now, revalidate in background (SWR).
  if (entry && age < maxStaleMs) {
    const revalidate = async () => {
      try {
        await refreshUnderLock(key, fetcher, opts, entry);
      } catch {
        // background refresh failures are swallowed — we already served stale
      }
    };
    if (opts.waitUntil) opts.waitUntil(revalidate());
    // If no background hook, we still served stale; the next reader that
    // crosses into cold will block-refresh. Never make the user wait here.
    return entry.data;
  }

  // COLD (no entry, or past maxStale) → must fetch, single-flight.
  return coldFetch(key, fetcher, opts, entry);
}

// Acquire the lock and refresh. Used for both SWR background refresh and
// cold misses. Returns the fresh data, or throws if it had to fetch and
// upstream failed with nothing to fall back to.
async function refreshUnderLock<T>(
  key: string,
  fetcher: Fetcher<T>,
  opts: L2Options,
  prev: L2Entry<T> | null,
): Promise<T> {
  const r = redis();
  const entryKey = DACE + key;
  const lockKey = DACL + key;
  const backoffKey = DACB + key;
  const lockMs = opts.lockMs ?? DEFAULT_LOCK_MS;
  const maxStaleMs = opts.maxStaleMs ?? DEFAULT_MAX_STALE_MS;

  // Respect an active backoff window — do NOT hammer a rate-limited upstream.
  if (await r.get(backoffKey)) {
    if (prev) return prev.data;
    throw new UpstreamUnavailableError(
      `Upstream in backoff and no cached value for ${key}`,
    );
  }

  const token = `${now36()}.${Math.trunc(rand() * 1e9)}`;
  const got = await r.set(lockKey, token, { nx: true, px: lockMs });
  const acquired = got === "OK";
  if (!acquired) {
    // Someone else is refreshing. If we have stale, serve it; else wait.
    if (prev) return prev.data;
    const waited = await waitForWinner<T>(entryKey, COLD_WAIT_TOTAL_MS);
    if (waited) return waited.data;
    // Winner didn't populate in time → fall through and fetch ourselves
    // (degraded: better one extra call than hanging).
  }

  try {
    const result = await fetcher({ prevEtag: prev?.etag ?? null });

    if ("notModified" in result) {
      // 304 — data unchanged, freshness bumped, NO upstream-fetch metered.
      const refreshed: L2Entry<T> = {
        data: prev!.data,
        etag: prev!.etag,
        storedAt: Date.now(),
        ttlMs: opts.ttlMs,
      };
      await r.set(entryKey, refreshed, { px: maxStaleMs });
      return refreshed.data;
    }

    const fresh: L2Entry<T> = {
      data: result.data,
      etag: result.etag ?? null,
      storedAt: Date.now(),
      ttlMs: opts.ttlMs,
    };
    await r.set(entryKey, fresh, { px: maxStaleMs });
    // a real upstream fetch happened → meter it (cache MISS, spec §7)
    await opts.onUpstreamFetch?.();
    return fresh.data;
  } catch (e) {
    if (e instanceof UpstreamRateLimitError) {
      // Mark backoff so other workers/regions don't pile on (scout: honor
      // Retry-After; ≥60s if absent — caller sets retryAfterMs).
      await r.set(backoffKey, "1", { px: Math.max(e.retryAfterMs, 1000) });
    }
    // stale-if-error (spec §14.1): serve cached bytes if we have any.
    if (prev) return prev.data;
    throw new UpstreamUnavailableError(
      `Upstream failed and no cached value for ${key}: ${errMsg(e)}`,
    );
  } finally {
    // Release ONLY if we acquired the lock — never delete another worker's
    // lock (would defeat single-flight on the degraded cold-miss fallback).
    if (acquired) await r.del(lockKey).catch(() => {});
  }
}

async function coldFetch<T>(
  key: string,
  fetcher: Fetcher<T>,
  opts: L2Options,
  prev: L2Entry<T> | null,
): Promise<T> {
  return refreshUnderLock(key, fetcher, opts, prev);
}

async function waitForWinner<T>(
  entryKey: string,
  totalMs: number,
): Promise<L2Entry<T> | null> {
  const r = redis();
  let waited = 0;
  while (waited < totalMs) {
    await sleep(COLD_WAIT_STEP_MS);
    waited += COLD_WAIT_STEP_MS;
    const e = await r.get<L2Entry<T>>(entryKey);
    if (e) return e;
  }
  return null;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Date.now()/Math.random isolated here so the rest of the module reads clean.
function now36(): string {
  return Date.now().toString(36);
}
function rand(): number {
  return Math.random();
}
