# Auth → Dispatch Wiring — Design (Wave-2 #4)

> Author: deputy, 2026-06-17. DESIGN-ONLY (no branch). Ready to build the
> instant provisioning lands. Grounded in the merged tree (shepherd@8972dc8):
> `scene/render.ts`, `scene/bind.ts`, `scene/types.ts`, `app/api/render/route.ts`,
> and the Wave-1 seam (`data/seam.ts`, `data/atoms-seam.ts`, `data/token-select.ts`,
> `data/usage.ts`, `data/vault.ts`).
>
> Cross-owner note: this lane touches BOTH deputy's seam AND builder-1's scene
> files (`bind.ts`/`types.ts`/`render.ts`). Flagging for the lead to sequence —
> the signature change below is the coordination point.

## 1. Where we are vs. where this lands

Today the render path is **token-blind**:
`route → renderScene(scene, fmt, baseUrl, overrides) → composeSvg → prepareElements(…, cache) → resolveBind(bind, cache) → MetricDef.resolve(subject, cache) → LEGACY atoms` (app token, public only, L1 DedupeCache + Next fetch cache).

The Wave-1 seam (`githubAtoms.*` / `nitrotypeAtoms.*`) is built and standalone but **nothing calls it yet**. Wave-2 #4 = thread an owner-aware **RenderContext** down the render path so bind resolution flows through the seam (mercy-ladder token selection + L2 cache + usage metering), and wire the two auth entry points (§5).

## 2. The one signature change (the coordination point)

Replace the bare `cache: DedupeCache` threaded through the render path with the seam's existing `RenderContext` (`data/seam.ts`):

```ts
type RenderContext = { owner: { userId: string } | null; l1?: DedupeCache; waitUntil?: (p: Promise<unknown>) => void };
```

Touch points (all currently pass `cache`):
- `MetricDef.resolve(subject, cache)` → `resolve(subject, ctx)` in `scene/types.ts`.
- `resolveBind(bind, cache)` → `resolveBind(bind, ctx)` in `scene/bind.ts`; each metric resolver swaps the legacy atom for the seam atom:
  `userOverview({login:s.id}, cache)` → `githubAtoms.userOverview({login:s.id}, ctx)` (same return shape — drop-in).
- `prepareElements(scene, cache)` / `composeSvg(…)` / `renderScene(…)` in `scene/render.ts` thread `ctx` (build `ctx.l1 = new DedupeCache()` once per render, exactly where `cache` is built today).

`RenderContext` stays the single context object; `l1` replaces the old standalone `cache` so per-request dedup is preserved AND L2/token/metering come online. **Return shapes are unchanged**, so elements and `numberValue()` need no edits.

## 3. Scope: public vs private (the security-critical bit)

The seam keys L2 as `provider:subject:metric:VANTAGE` (public shared / private owner-namespaced — invariant §6/§14.5). **The same key discipline applies to L1** (render-output) — both layers, every time. Two kinds of "private":

**(a) Statically-private metrics** (e.g. a future `private-repo-stats`): always private; never has a public form. `MetricDef.scope: "private"` ⇒ seam sets `requirePat: true` and owner-namespaces the key.

**(b) Vantage-sensitive metrics — the subtle one (scout's DoD finding + lead-confirmed).** `github:commits-last-year`, `lifetime-commits`, and in fact the WHOLE `contributionsCollection` payload (so also `current-streak`, `longest-streak`, `total-contributions`) INCLUDE `restrictedContributionsCount` / private contribution days **when fetched with a token that can see the owner's private contribs.** So the SAME `(subject, metric)` yields a DIFFERENT number by token vantage:
  - anonymous / app token → **public-only** number (Mo's commits ≈ 545)
  - owner's own PAT/OAuth, own subject → **private-inclusive** number (≈ 6,011)

  This breaks the seam's "public data is identical regardless of fetcher" assumption for these atoms. If a privileged render cached the 6,011 under the shared public key, every anonymous embedder would see Mo's private total — a **leak**; conversely an anonymous-cached 545 served to an authed viewer is wrong.

**Mechanism (lives mostly in the seam — my files):**
- The vantage flag belongs at the **seam-atom** level, because the whole payload is sensitive: mark `githubAtoms.userContributions` + `userLifetime` as `vantageSensitive: true`. `userOverview` + `userTopLanguages` query `privacy: PUBLIC` explicitly → vantage-STABLE (`false`). `MetricDef.scope` stays as the coarse editor-facing hint; the atom flag is the enforcement point.
- **Effective vantage** computed in `runAtom`: `private` iff `vantageSensitive && owner != null && tokenSource is the owner's own (pat/oauth) && subject.id === owner's GitHub login`; else `public`.
  - private vantage → key `…:owner:<ownerId>`, fetch with owner token, the full number; renders only on the owner's own path.
  - public vantage → shared `…:public` key, **force the app token** so the canonical cached number is the public-only one (a PAT fetching someone ELSE's subject also returns public-only, but forcing app token keeps the public entry unambiguous and quota accounting clean).
- **Needs owner→GitHub-login resolution** to evaluate `subject.id === owner's login`: read it from the Better Auth `account` row (providerId `github`) at session-resolve time and carry it on `RenderContext.owner` (e.g. `{ userId, githubLogin? }`). Cheap, one lookup per render.
- Anonymous always renders the public-only number (never sends a token that could see private contribs).

**Subject-for-private = the owner.** A PAT only exposes its OWNER's private data, so `restricted*` is non-zero only when `subject == owner`; for any other subject even a PAT yields public-only. The owner-namespaced key guarantees no cross-owner leakage even if the guard loosens (token scope is the authz boundary, §14.3 — keep both the cheap `subject==owner` guard AND rely on token scope).

> Product/copy framing (honest "CONTRIBUTIONS" vs "COMMITS" label, public-only headline, BYO-PAT perk) is **design's** parallel thread → Mo. My lane wires the MECHANISM so both vantages are correct + isolated regardless of the copy decision.

## 4. Two auth entry points → one render core (§5)

The render core takes `RenderContext.owner` from EITHER source; it never sees the viewer:

| Entry | Owner source | How |
|---|---|---|
| **Editor preview** | session | `auth.api.getSession({ headers })` (Better Auth) → `owner = { userId }`. Clean private previews for the logged-in user. |
| **Embed** `/i/<id>` (Phase C route) | published id | look up `published_embeds` by id → `owner = { userId: row.ownerId }` (the PUBLISHER). Renders the publisher's data with the publisher's PAT even though the viewer is anonymous/hidden. |
| **`/api/render`** (current dev/editor transport) | session if present, else `null` | anonymous when no session — the front-line public path, app token. |

This is exactly the spec's "core accepts owner-from-session AND owner-from-published-id."

## 5. PAT → node routing (§5) — satisfied by PLACEMENT, no runtime switch

Key realization from the merged tree: **`/api/render` (and the future `/i/<id>` embed route) are already `runtime = "nodejs"`** (Skia/sharp compositing is Node-only). So a PAT-decrypting render (Web Crypto + Neon + Upstash, all unconstrained on Node) needs **no edge→node rewrite** — the scene/editor/embed path is already Node.

The edge surface is the **legacy single-card routes** `/api/<user>/<stat>` (edge). Recommendation for v1:
- **Keep the edge single-card routes anonymous / app-token / public-only** — the genuinely-good free front line (spec §0 competitive posture). They keep using the LEGACY atoms (no seam, no PAT). No change needed.
- **All PAT-backed / private / composed renders live on the Node scene path** (`/api/render`, `/i/<id>`). The mercy ladder, private data, and composition are the account value-add — and they're Node by construction.

So §5's "edge except PAT → node" is honored by *where each render type lives*, not by a per-request runtime flip. If we later want PAT-backed SINGLE cards on the public path, add an edge→`/api/n` rewrite gated on auth-cookie presence (deferred; note only).

## 6. Render-compute metering + degrade-to-cached (§7/§14.1)

- After a successful render, the core calls `meterRender({ ownerId })` (the per-owner abuse meter, `data/usage.ts`). For embeds, `ownerId` = the publisher (per-URL/owner, NOT per-IP — camo §7). Anonymous `/api/render` → `ownerId: null` (the `anon:shared` bucket).
- The seam already does **stale-if-error** internally (serve cached bytes on upstream failure). The render route's `catch → 500` only fires on the unavoidable cold-miss + upstream-down case. Once the **L1 render-output cache** lands (builder-2's lane), the route serves the last-good rendered image there too — closing the invariant end-to-end. Note the seam dependency in that lane.

## 7. waitUntil (SWR background revalidation)

Provide `after` from `next/server` as `ctx.waitUntil` in the render route so the seam's stale-while-revalidate refresh runs after the response flushes (nobody waits on upstream — spec §6). Without it the seam still serves stale and refreshes on the next cold read; with it, refresh is eager and invisible.

## 8. Build order (when provisioning is live)

1. Add `scope` to `MetricDef` + thread `RenderContext` through `bind.ts`/`render.ts`/`types.ts` (coordinate with builder-1).
2. Swap legacy atoms → seam atoms in `bind.ts` metric resolvers.
3. Add session resolution (`auth.api.getSession`) in `/api/render`; pass `owner` + `after` into `renderScene`.
4. Add `meterRender` call post-render.
5. (Phase C) `/i/<id>` embed route: owner-from-published-id + pre-warm.
6. Verify end-to-end: anon render (app token, public L2), authed render w/ PAT (own quota, private owner-namespaced key), single-flight under burst, stale-if-error.

## 9. Decisions (settled by lead, 2026-06-17)

1. ✅ **Deputy drives** the `RenderContext` signature change across `bind.ts`/`render.ts`/`types.ts`; **builder-1 reviews** (it's the seam contract).
2. ✅ **Add `scope` to `MetricDef` now** (default `"public"`), even though no private metric ships in v1 — keeps the wiring complete.
3. ✅ **Edge single-card routes stay public-only / app-token for v1.** All PAT/private/composed renders live on the Node scene path. (Clean read of §5; no per-request runtime flip.)

## 10. Sequencing & build plan

**This build (#4) HOLDS until BOTH land** (it edits files they own → avoid conflicts):
- **#10 decompose** (builder-1) — owns `scene/bind.ts`, `scene/render.ts`, `scene/types.ts` (the RenderContext touch points).
- **builder-2's L1 render cache** — owns `app/api/render/route.ts` (where session resolution + `after`/waitUntil + `meterRender` get added).

Building before both land means rebasing onto a moving target in exactly the files I touch. Once both are merged, #4 is a clean, fast, mechanical change.

**Build order when unblocked (one PR, branch `auth-dispatch-wiring`). Verified against merged tree 0e8ae47:**
1. `scene/types.ts` — add `scope?: "public" | "private"` to `MetricDef` (default public at use); change `resolve(subject, cache)` → `resolve(subject, ctx: RenderContext)` (currently `resolve: (subject, cache: DedupeCache)` at types.ts:72). Re-export `RenderContext` from the seam (or a thin `BindContext` alias) so scene files don't import data internals beyond the type.
2. `scene/bind.ts` — `resolveBind(bind, cache)` → `resolveBind(bind, ctx)` (bind.ts:182); swap each metric resolver's legacy atom → seam atom (`userOverview({login}, cache)` → `githubAtoms.userOverview({login}, ctx)`; same return shape). Literal binds unchanged.
3. `scene/render.ts` — `prepareElements(scene, cache)` (render.ts:89, called :150) and the `new DedupeCache()` at :149 become `ctx.l1`; thread `ctx` through `prepareElements`/`composeSvg`/`renderScene`. `renderScene(scene, format, baseUrl, overrides)` (render.ts:203) gains a 5th `ctx` arg.
4. `app/api/render/route.ts` — **changed by the L1 cache (#12); fold in carefully:**
   - Resolve owner ONCE in `renderSceneAndRespond` (before `respondWithL1`): `const session = await auth.api.getSession({ headers: request.headers }); const owner = session?.user?.id ? { userId: session.user.id } : null;`
   - Build `ctx = { owner, l1: new DedupeCache(), waitUntil: after }` (`after` from `next/server`) and pass it into the `doRender` closure → `renderScene(scene, format, baseUrl, url.searchParams, ctx)`.
   - **`meterRender` ALREADY EXISTS** (route.ts:98, currently `{ ownerId: null }` with a comment that owner attribution arrives with this lane). Just thread the owner: `meterRender({ ownerId: owner?.userId ?? null })`. Do NOT add a second call. The L1-hit path correctly skips it (no render = no compute to meter).
5. (Phase C, separate) `/i/<id>` embed route: owner-from-published-id.

### L1 render-cache owner-namespacing (privacy — DO NOT MISS)
The L1 key today is `["scene", format, stableStringify(scene), presentationKey(url)]` (route.ts:235) — **no owner**. That is CORRECT for public renders (public data → identical bytes → safe to share across all requesters; it's the whole multiplier). But a **private/owner-dependent** render MUST add the owner to the L1 key, or user A's private image would be served to user B from L1 — the same invariant as the L2 public/private split (§6/§14.5), one layer up.
- v1 ships no private metrics, so this is forward-looking — but wire it now so we never ship the privacy bug: when the scene contains a `private`-scope bind, append `owner?.userId` to `keyParts` (and shorten its TTL, mirroring the L2 private TTL). A purely-public scene keeps the shared key.
- Helper mirrors `sceneIsDataDependent`: `sceneHasPrivateBind(scene)` → if true, key includes owner + use `L1_TTL_DATA` (or shorter).

**Risk notes for the merge:**
- `RenderContext` lives in `data/seam.ts`; scene files importing it is fine (type-only; the scene/render path is Node anyway).
- Keep the legacy atoms exported — single-card edge routes (decision 3) still use them. Seam atoms are additive.
- `meterRender` + `getSession` are Node-only and already/only in `route.ts` (Node). No edge regression.
- The L1 cache wraps render; my changes live INSIDE the existing `respondWithL1`/`renderSceneAndRespond` flow — additive, not a rewrite.

## 11. Verification plan (when built)

Now that the data layer is live (Neon migrated, Upstash smoke-OK, OAuth creds in `.env.local`):
- **Anon render** (`/api/render?scene=…`, no session) → app token, public L2 key `github:<subj>:<metric>:public`; second identical request is an L2 hit (no upstream call; check `getSharedAppUsage` doesn't double-count).
- **Authed render** (session + a vault PAT) → token source `pat`, miss billed to their per-PAT/owner ledger, NOT the shared app bucket (mercy ladder).
- **Single-flight** — fire N concurrent identical cold misses → exactly one upstream fetch (lock holds; others serve/wait).
- **Stale-if-error** — with a cached entry present, force an upstream failure → still serves cached bytes, sets backoff, never 500.
- **Private scope** (when a private metric exists) → owner-namespaced key; no PAT ⇒ clean error, never silent app-token fallback.
