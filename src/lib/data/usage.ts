import { redis } from "./redis";

// Hot usage counters (spec §7). Two SEPARATE ledgers, never conflated:
//
//   - "upstream"  = actual GitHub/nitrotype calls = cache MISSES only.
//                   The quota / mercy-ladder meter. BYO-PAT misses are
//                   counted against THEIR key, never our shared pool.
//   - "render"    = render/compute count. The abuse meter. Fires on every
//                   render INCLUDING L2 data-cache hits (L2 caches data,
//                   not the image).
//
// These live in Upstash for low-latency atomic INCR on the hot path; a
// periodic flush to Neon's usage_ledger table (lib/db/schema.ts) holds
// durable history. Counters are bucketed per hour and self-expire.
//
// IMPORTANT (spec §7): meter upstream on MISSES, not render requests — a
// popular public subject costs ~0 quota regardless of embed popularity.

const HOUR_MS = 60 * 60 * 1000;
const COUNTER_TTL_MS = 3 * HOUR_MS; // keep a little history past the live hour

function hourBucket(nowMs: number): string {
  // floor to the hour; stable, sortable bucket id
  return new Date(Math.floor(nowMs / HOUR_MS) * HOUR_MS)
    .toISOString()
    .slice(0, 13); // "YYYY-MM-DDTHH"
}

async function bump(key: string): Promise<number> {
  const r = redis();
  const n = await r.incr(key);
  if (n === 1) await r.pexpire(key, COUNTER_TTL_MS);
  return n;
}

export type TokenSource = "app" | "pat";
export type Provider = "github" | "nitrotype";

/**
 * Meter ONE upstream call (a cache miss), per provider. Records:
 *   - the global app-token bucket when source="app" (the shared per-
 *     provider ceiling guard — GitHub's is the 5k/hr global ceiling, §9)
 *   - the per-owner bucket (account attribution / mercy ladder)
 *   - the per-PAT bucket when source="pat" (their quota, informational)
 */
export async function meterUpstreamCall(args: {
  provider: Provider;
  ownerId: string | null;
  source: TokenSource;
  patId?: string | null;
  nowMs?: number;
}): Promise<void> {
  const bucket = hourBucket(args.nowMs ?? Date.now());
  const p = args.provider;
  const jobs: Promise<unknown>[] = [];
  if (args.source === "app") {
    jobs.push(bump(`dyn:use:upstream:${p}:app:shared:${bucket}`));
  }
  if (args.ownerId) {
    jobs.push(
      bump(`dyn:use:upstream:${p}:${args.source}:owner:${args.ownerId}:${bucket}`),
    );
  }
  if (args.source === "pat" && args.patId) {
    jobs.push(bump(`dyn:use:upstream:${p}:pat:${args.patId}:${bucket}`));
  }
  await Promise.all(jobs);
}

/**
 * Meter ONE render/compute (the abuse meter). `ownerId` when known;
 * anonymous embeds are limited per published-URL/owner+subject (Wave 2
 * wiring keys that), NOT per IP — camo hides viewers (spec §7).
 */
export async function meterRender(args: {
  ownerId: string | null;
  nowMs?: number;
}): Promise<void> {
  const bucket = hourBucket(args.nowMs ?? Date.now());
  const who = args.ownerId ? `owner:${args.ownerId}` : "anon:shared";
  await bump(`dyn:use:render:${who}:${bucket}`);
}

/** Read current-hour usage for an owner (for dashboards / limit checks). */
export async function getOwnerUsage(
  ownerId: string,
  provider: Provider = "github",
  nowMs = Date.now(),
): Promise<{ upstreamApp: number; upstreamPat: number; render: number }> {
  const r = redis();
  const bucket = hourBucket(nowMs);
  const [uApp, uPat, render] = await Promise.all([
    r.get<number>(`dyn:use:upstream:${provider}:app:owner:${ownerId}:${bucket}`),
    r.get<number>(`dyn:use:upstream:${provider}:pat:owner:${ownerId}:${bucket}`),
    r.get<number>(`dyn:use:render:owner:${ownerId}:${bucket}`),
  ]);
  return { upstreamApp: uApp ?? 0, upstreamPat: uPat ?? 0, render: render ?? 0 };
}

/** Current-hour usage of the shared app token for a provider — the ceiling guard (GitHub = 5k/hr). */
export async function getSharedAppUsage(
  provider: Provider = "github",
  nowMs = Date.now(),
): Promise<number> {
  const bucket = hourBucket(nowMs);
  const n = await redis().get<number>(
    `dyn:use:upstream:${provider}:app:shared:${bucket}`,
  );
  return n ?? 0;
}
