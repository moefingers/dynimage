import { DedupeCache } from "./cache";
import { l2ReadThrough, type FetchResult, type L2Options } from "./l2cache";
import { selectToken, type OwnerContext, type SelectedToken } from "./token-select";
import { meterUpstreamCall } from "./usage";
import { touchLastUsed } from "./vault";
import { deriveCacheKey, type Scope } from "./cache-key";

// Re-exported so existing importers (and the seam's own API) keep a single
// import surface; the pure impl lives in cache-key.ts for unit-testability.
export { deriveCacheKey, type Scope };

// ─────────────────────────────────────────────────────────────────────
// THE atom seam (spec §6/§7, deputy memo §6). One runtime-agnostic place
// every data read flows through, on whichever runtime renders:
//
//   identify (ctx.owner)
//     → select token (mercy ladder)
//     → build L2 key  provider:subject:metric:SCOPE
//         public  = globally shared (the multiplier)
//         private = owner-namespaced  ← SECURITY-CORRECTNESS INVARIANT
//                                       (private data never crosses owners)
//     → L1 dedupe (per-request)  → read-through L2 (SWR, single-flight,
//        per-metric TTL, ETag-revalidate, stale-if-error)
//     → on a real MISS: meter the upstream call (BYO-PAT misses hit THEIR
//        ledger, not our shared quota) + bump PAT last_used
//
// Wired into the scene render path (Wave 2 #4): the route resolves an
// owner (session for editor preview / published-id for embed) into a
// RenderContext, threaded down through bind → MetricDef.resolve → here.
//
// VANTAGE (spec §3, scout DoD finding): some atoms are "vantage-sensitive"
// — their value DEPENDS on which token fetched them. The whole GitHub
// contributionsCollection (commits-last-year, lifetime, streaks,
// total-contributions) includes the owner's PRIVATE contributions when
// fetched with their own token, but only PUBLIC counts on the app token.
// So such a result must NEVER be written under the shared public key.
// Leak-proof rule, token-source only (no identity match needed): a
// vantageSensitive atom fetched with a NON-app token is keyed PRIVATE
// (owner-namespaced); the app token is keyed PUBLIC (the public-only value).
// ─────────────────────────────────────────────────────────────────────

export type RenderContext = {
  /** who is rendering; null = anonymous front-line. */
  owner: OwnerContext;
  /** per-request L1 dedup cache (collapses identical reads before Redis). */
  l1?: DedupeCache;
  /** background-task hook (Vercel `after`/`waitUntil`) for SWR revalidation. */
  waitUntil?: (p: Promise<unknown>) => void;
};

/** An anonymous, no-dedup context — convenient default for callers that have none. */
export const ANON_CONTEXT: RenderContext = { owner: null };

export type AtomDef<TParams, TData> = {
  provider: "github" | "nitrotype";
  /** stable metric id; part of the cache key. */
  metric: string;
  /** per-metric freshness window (spec §6: lifetime→hours, streak→~15m, default ~30m). */
  ttlMs: number;
  /** the subject id — the cache multiplier (100 embeds of one subject = 1 fetch/TTL). */
  subjectOf: (p: TParams) => string;
  /** "public" (shared key) or "private" (owner-namespaced, requires PAT). Default "public". */
  scopeOf?: (p: TParams) => Scope;
  /**
   * True when the value DEPENDS on the token vantage (includes the owner's
   * private data on their own token). Such a result is keyed private when
   * fetched with a non-app token, so it never lands under the shared public
   * key. e.g. anything off GitHub's contributionsCollection.
   */
  vantageSensitive?: boolean;
  /** simple fetcher; receives the selected token (empty for tokenless providers). */
  fetch: (p: TParams, token: SelectedToken) => Promise<TData>;
  /** optional ETag-aware fetcher for REST atoms — a 304 doesn't count vs quota (scout). */
  conditionalFetch?: (
    p: TParams,
    token: SelectedToken,
    prevEtag: string | null,
  ) => Promise<FetchResult<TData>>;
};

/** Turn an AtomDef into a callable `(params, ctx) => Promise<TData>`. */
export function defineAtom<TParams, TData>(def: AtomDef<TParams, TData>) {
  return (params: TParams, ctx: RenderContext = ANON_CONTEXT): Promise<TData> =>
    runAtom(def, params, ctx);
}

// Resolve the upstream token ONCE per (provider, render) — mercy ladder.
// Memoized on the per-render L1 cache so a scene with many GitHub binds
// does one vault lookup + decrypt, not one per element.
function resolveToken(
  provider: AtomDef<unknown, unknown>["provider"],
  ctx: RenderContext,
): Promise<SelectedToken> {
  const select = (): Promise<SelectedToken> =>
    provider === "github"
      ? selectToken(ctx.owner, { provider: "github" })
      : Promise.resolve({
          token: "",
          source: "app",
          ownerId: ctx.owner?.userId ?? null,
          patId: null,
        });
  return ctx.l1 ? ctx.l1.get(`__token:${provider}`, select) : select();
}

async function runAtom<TParams, TData>(
  def: AtomDef<TParams, TData>,
  params: TParams,
  ctx: RenderContext,
): Promise<TData> {
  const subject = def.subjectOf(params);
  const staticScope = def.scopeOf?.(params) ?? "public";

  // Token first — the cache vantage of a vantageSensitive atom depends on it.
  const token = await resolveToken(def.provider, ctx);

  // Statically-private metrics require the owner's own token (never fall
  // back to the app token — it can't read private data anyway).
  if (staticScope === "private" && token.source !== "pat") {
    throw new Error(
      "This read requires the owner's own token (private data), but none is on file.",
    );
  }

  const { key } = deriveCacheKey({
    provider: def.provider,
    subject,
    metric: def.metric,
    staticScope,
    vantageSensitive: def.vantageSensitive,
    tokenSource: token.source,
    ownerId: token.ownerId ?? ctx.owner?.userId ?? null,
  });

  const run = async (): Promise<TData> => {
    const fetcher = async ({
      prevEtag,
    }: {
      prevEtag: string | null;
    }): Promise<FetchResult<TData>> =>
      def.conditionalFetch
        ? def.conditionalFetch(params, token, prevEtag)
        : { data: await def.fetch(params, token) };

    const opts: L2Options = {
      ttlMs: def.ttlMs,
      waitUntil: ctx.waitUntil,
      onUpstreamFetch: async () => {
        await meterUpstreamCall({
          provider: def.provider,
          ownerId: token.ownerId,
          source: token.source,
          patId: token.patId,
        });
        if (token.source === "pat" && token.patId) await touchLastUsed(token.patId);
      },
    };

    return l2ReadThrough<TData>(key, fetcher, opts);
  };

  // L1: collapse identical reads within one render before touching Redis.
  return ctx.l1 ? ctx.l1.get(key, run) : run();
}
