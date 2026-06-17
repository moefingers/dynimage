import { DedupeCache } from "./cache";
import { l2ReadThrough, type FetchResult, type L2Options } from "./l2cache";
import { selectToken, type OwnerContext, type SelectedToken } from "./token-select";
import { meterUpstreamCall } from "./usage";
import { touchLastUsed } from "./vault";

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
// This is a STANDALONE callable. It does NOT touch dispatch.ts / the card
// render flow — that wiring (owner-from-session/id, PAT→node routing) is
// Wave 2, sequenced after builder-1's scene/element model lands. Callers
// pass a RenderContext explicitly for now.
// ─────────────────────────────────────────────────────────────────────

export type Scope = "public" | "private";

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
  /** "public" (shared key) or "private" (owner-namespaced). Default "public". */
  scopeOf?: (p: TParams) => Scope;
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

async function runAtom<TParams, TData>(
  def: AtomDef<TParams, TData>,
  params: TParams,
  ctx: RenderContext,
): Promise<TData> {
  const scope = def.scopeOf?.(params) ?? "public";
  const subject = def.subjectOf(params);
  const base = `${def.provider}:${subject}:${def.metric}`;
  // public → shared; private → owner-namespaced (never crosses owners).
  const key =
    scope === "public"
      ? `${base}:public`
      : `${base}:private:${ctx.owner?.userId ?? "anon"}`;

  const run = async (): Promise<TData> => {
    // Only GitHub reads carry a user/app token + mercy ladder. nitrotype
    // goes through our proxy with no upstream auth.
    const token: SelectedToken =
      def.provider === "github"
        ? await selectToken(ctx.owner, {
            provider: "github",
            requirePat: scope === "private",
          })
        : { token: "", source: "app", ownerId: ctx.owner?.userId ?? null, patId: null };

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
