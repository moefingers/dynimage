# dynimage v1 — Architecture Overview

> Orientation for any agent joining mid-stream. **Source of truth is the locked spec**
> `CONTEXT/active/design-vision-spec.md` (product/vision) + `CONTEXT/active/deputy-auth-options-memo.md`
> (auth/storage/crypto substrate). This doc is a map, not a replacement — section refs like
> *(spec §6)* point at the canonical text. When this doc and the spec disagree, the spec wins.
> Maintained by scribe; updated document-as-built as Wave-1 PRs merge.

## One-line

**Tuneable image generation: tune knobs in a UI → get a compressed URL → embed a live,
theme-aware, animated image in any README.** *(spec §0)*

**Definition of done (v1):** the editor rebuilds Mo's real profile README — the three banners
`commits-orbit`, `typing-orbit`, `syndicate`/`recanon` — purely from **elements + presets**, no
hand-authoring. Those become the three flagship presets. Every element they need already exists
inside today's cards; v1 is largely *decomposing monolithic cards into composable elements*. *(spec §0)*

**Competitive posture:** the anonymous public URL is the front line and must be good on its own;
accounts/PAT buy *power* (composition, private data, mercy limits), never table stakes. The
**editor is the moat.** *(spec §0)*

---

## The model: scene of composable elements *(spec §1)*

The unit is **not** a monolithic card — it's a **scene** of ordered, z-layered, individually
tunable, optionally data-bound **elements**.

```
Scene   = { canvas: {w, h, theme/bg}, elements: [ …ordered, z-layered… ] }
Element = { type, transform{x,y,w,h,z,rotate}, anchor?{to,slot}, knobs{…Zod…}, bind?{source} }
```

- **Element = generalization of today's `Card`** — same self-registering module, same
  Zod-schema-as-knob-spec, same `/api/meta` introspection, just finer-grained. **Evolution, not rewrite.**
- **`bind` unifies graphics and stats** — an element is static *or* bound (`github:commits`,
  `nitrotype:wpm`, `literal`, …). "A stat" is just a bound element.
- **`asset` ref (integrated, PR #33 `shepherd@d2e2fc9`):** `ElementSpec.asset?: {id}` sits **top-level,
  parallel to `bind`** — a logo/image element points at an uploaded `asset` (raster-only, Vercel Blob, §10).
  Resolution is **central + SSRF-safe** (elements stay pure; raster-only fallback). Remaining: inspector
  asset-picker (builder-1) + live Blob provisioning (Mo) — backlog #14.
- **Anchoring/slots are required** — the octocat sits *in the orbit's center slot*; children stay
  placed as parents resize (not just absolute X/Y).
- **Subject is a typed entity ref** `{kind: user|org|repo, id}`; the `(provider, subject, metric)`
  model absorbs all three. `/api/meta` gains a metric↔subject-kind compatibility matrix.
- **Today's rich cards become presets** — named bundles of elements + knobs; current cards keep working.
- **Curated palettes are `treatment` knobs, not lock-outs** *(spec §1)* — a signature look (orbit's neon,
  prism's spectrum) is a selectable knob with that look as the *default*, but `?theme=` + per-color
  overrides still compose on top. No element silently ignores theme; it just ships a strong default.
  (This is the model-level resolution of the current orbit `?theme=` behavior — backlog Stab #6.)
- **Cross-format parity = "same card," not "same pixels"** *(spec §1)* — SVG and PNG/Satori/Skia of the
  same element+theme must read as the same card (palette/layout/proportions/key treatments), modulo
  animation raster can't carry. Perceptible drift in *shared* values is a defect → single-source the
  constants so both paths read one value (backlog Stab #5).

### How this supersedes the old "Card / dual-registry" model
The earlier scribe outline (`CONTEXT/active/doc1-outline-card-architecture.md`, "card abstraction +
dual registry/runtime split") is **superseded but still load-bearing under the hood** — it documents
the substrate the element model is built *on*, which carries over unchanged:
- The **self-registering module + Zod-schema + `/api/meta` introspection** pattern → now per-element.
- The **edge/node runtime split** and the dispatch flow → still how rendering routes. PAT-decrypt
  renders go to **node**; everything else stays **edge** *(spec §5)*.
- **Known fragility that survives into v1** (from deputy's pipeline map): the *three-place runtime
  coupling* (next.config rewrite regex ↔ registry-edge ↔ registry-all) and *compound SVG id
  collisions* (static per-type ids). The element/scene compositor must namespace ids per element
  instance — the old per-card-type ids break the moment a scene holds two of the same element.

  → Treat the old outline as **engine-internals reference**, not the v1 product model. It will be
  re-folded into the as-built subsystem docs (scene-element-model lane) rather than published standalone.

---

## Encoding — three tiers, one config *(spec §2)*

| Tier | For | Example |
|---|---|---|
| **0 Preset** | "the github banner with my name" | `?preset=commits-orbit&user=moefingers` |
| **1 Readable params** | one element, light tuning (80% case) | `/api/<user>/commits.svg?theme=ocean&accent=fb923c` |
| **2 Compressed blob** | full custom / compound (editor output) | `/api/render?c=<base64url(gzip(json))>&z=1` |

All three decode to the **same internal config**. The editor emits the shortest encoding that fits
and auto-promotes to the blob past a length/nesting threshold — the user never picks an encoding.
**base64url** (not base64 — `+/=` are camo-unsafe), **gzip by size**, **versioned (`v:1`)** so
embedded URLs never break.

**Tier status:** Tier-2 `?c=` ✅ **DONE** (PR #6 codec + PR #8 `/api/render` wiring → `decodeConfig` →
Scene → `renderScene`, under the shared decompression cap). Tier-1 readable params 🔧 **partial** (the
existing per-card query params; not yet generalized per-element). Tier-0 `?preset=` ✅ **DONE** (PR #14,
`shepherd@261f4c1`): `GET /api/render?preset=<name>&user=<id>` → `getPreset(name).build({subject})` →
Scene → same L1/render path (byte-identical to `?scene=`). The flagship presets are now **embeddable**.

---

## Caching — L0 / L1 / L2 *(spec §6)*

| Layer | Caches | TTL | Protects |
|---|---|---|---|
| **L0 camo** | final image bytes | hours (not ours) | outer freshness ceiling |
| **L1 render cache** ✅ | rendered bytes per (config, presentation, format) | ≤ min L2 TTL | our compute |
| **L2 data cache** ✅ | the GitHub/nitrotype response | 15–60 min, per-metric | upstream budget |

- **L2 key = `provider:subject:metric:SCOPE`.** `public` ⇒ globally shared (100 embeds of one
  subject = 1 fetch/TTL); `private` ⇒ **also namespaced by owner** so it never crosses owners.
  *The privacy boundary is a security-correctness invariant, not an optimization.*
- **Stale-while-revalidate** everywhere; **single-flight** on revalidation (no thundering herd).
- **The L2 TTL is the sole upstream-rate governor** — no path (embed, editor preview, `?v=`) fetches
  faster than the floor. Insertion point: wrap the `atom()` factory in `data/atoms.ts` with a
  read-through L2 (carrier: Upstash). *(memo §6a)*
- ✅ **The Vercel edge CDN sits above L1** (backlog Stab #12, **CLOSED**): L1/L2 owner-namespacing protects
  *below* the edge, so a privileged **session-owner** render emitting `Cache-Control: public` (no
  `Vary: Cookie`) was getting cached at the Vercel edge and **cross-served to anon** (was proven live:
  `X-Vercel-Cache: HIT` cookieless). **Fixed + scout prod-verified** (PR #21, `shepherd@23e0534`): authed/
  privileged renders emit `private, no-store`; **anon, `/i/<id>` and compound stay `public`** so legit
  embeds remain camo-cacheable; bundled open-redirect guard. *(Forward-check on the public `/i/<id>` path
  is backlog #17, runs at publish-e2e.)*

---

## Rate limiting — the mercy ladder *(spec §7, memo §6b)*

| Tier | GitHub budget burned | Limits |
|---|---|---|
| Anonymous (no account) | our service token, shared | tightest — front line |
| Account, no PAT | our service token, per-owner | moderate |
| **Account + PAT** | **their** 5k/hr | most generous — their calls stop counting against us |

- **Meter on cache MISSES (real upstream calls), not render requests.** A cache hit costs nobody
  quota → popular public subjects are ~free regardless of embed popularity.
- **Two separate ledgers, don't conflate** *(memo §7.2)*: (a) upstream GitHub calls = misses =
  quota/mercy meter; (b) render/compute count per-owner = a separate abuse meter that fires on every
  render *including* L2 data-cache hits (relieved only by a future L3 render-output cache).
- **GUARDRAIL: no per-IP limiter for embeds.** camo fetches embeds from its own IPs with the viewer
  hidden → per-IP throttling punishes camo, not abusers. Limit embeds by **subject + owner + cache**;
  reserve **per-IP for the interactive playground only.** *(spec §7, memo §7.3)*

---

## Auth / PAT vault *(spec §3–5, memo §3–5)*

- **Better Auth** account, **email-verified to publish** (the only way per-user metering works,
  since camo fetches anonymously). **GitHub OAuth = primary private-data path**; **manual PAT =
  power-user fallback.** Gating applies to *construction* — raw parametric public URLs stay anonymous.
- **PAT vault:** per-user, per-provider; **envelope encryption** (AES-256-GCM via Web Crypto,
  master key `PAT_ENC_KEY` in env, KMS-ready schema — rotation re-wraps data keys only). **Decrypt
  only at use, in-memory, on the render request; never returned/logged/cached.** Audit error paths
  (`dispatch.ts`/`client.ts` echo raw upstream errors — scrub so a 401 body can't leak a token).
- **Storage substrate** *(memo §3, §5)*: **Neon Postgres** = system of record (accounts +
  app-encrypted PAT + durable usage/audit), via `@neondatabase/serverless` so edge can read.
  **Upstash Redis** = hot-path rate-limit + usage counters (atomic, REST, edge+node). **Blob** for
  assets only. The token's own scope *is* the authorization boundary.

---

## Publish → embed lifecycle *(spec §8)*

- **Permanent embed = stable id-based URL, NO version param** (`/i/<id>.svg`). Freshness lives
  behind the id via cache/TTL — editing config updates what `/i/<id>` resolves to server-side.
- **`?v=` is reserved for the publisher's explicit "refresh now"** (respects the TTL floor) — never
  the permanent embed.
- **Publish is transactional + pre-warms** L1+L2 so camo hit #1 is instant (no broken day-one image).
- **`<picture>` theme-split ⇒ one id renders ≥2 variants**; pre-warm/cache/usage are per **(id, theme)**.
- **L1 and L2 invalidate independently** (editing config busts L1 for that id; L2 subject data untouched).
- **Editor emits the full snippet** (`<a>` + `<picture>` + cache-bust), not a bare URL. *(See
  `CONTEXT/internal_docs/github-theme-aware-images.md` for the `<picture>` theme-split rationale.)*
- **Dead/expired PAT ⇒ stale-if-error** (serve last cached value, never 502; notify owner).
- **Publishing private data is intentional ⇒ disclaim at publish**; deletion isn't instant (camo lag).
- **Unguessable published ids**; `/i/<id>` returns only the image, never the config JSON.

---

## The 7 invariants *(spec §14 — verbatim anchors; the load-bearing rules)*

1. **Failures and limits degrade to cached bytes, never to an error.** (DoS-via-own-limit, dead PAT,
   thundering herd, per-URL abuse all resolve here.)
2. **Private data is the gate, not config complexity.** A custom *public* banner needs no account.
3. **The token's scope is the authorization boundary.**
4. **The L2 TTL is the sole upstream-rate governor; every consumer reads through it.**
5. **The subject-keyed shared cache is public-data-only; private is owner-namespaced.**
6. **The permanent embed URL is a stable id; freshness lives behind it, not in the URL.**
7. **camo hides viewers** → meter generations (misses), limit per-URL/owner, IP only for the playground.

---

## Phasing & lanes *(spec §13)*

- **A — Core:** scene/element model + anchoring + tiered encoding + decompose the README's elements +
  render. In parallel: auth/storage/crypto foundation (deputy's lane).
- **B1 — Basic editor** → **B2 — Canvas (advanced)** → **C — Accounts live** → **D — Grow.**

**🏠✅ STATUS (2026-06-18): v1 BUILD + UX FULLY COMPLETE (PRs #5–#37 merged, 0 open build items).** Every
spec lane + every QA gap closed: scene/element model, encoding codec, auth foundation, decompose+presets, L1
cache, auth→dispatch wiring, publish lifecycle, accounts-live, **full editor B1+B2**, **assets UX**,
**moderation end-to-end**, recanon tagline. Server side is leak-clean (Stab #12 CLOSED) and the **funnel is
REAL-USER PROVEN end-to-end on prod**
(force-verify: publish 200 → unguessable id → honest disclaimer → `/i` publisher-vantage image → #17
cacheability PASS). **REAL-USER funnel PROVEN end-to-end on prod** — Mo published a real embed
(`/i/64F-HwM8WPA8l8RjsDH_4g`: 200 SVG, `public,max-age=300`, `X-Vercel-Cache HIT`, image-only) — Stab #17
PASS on a real id (Stab #19/#20/#21 ✅; snippet coherence Stab #24 ✅ PR #27). Per Mo, remaining QA is
**deferred** (full owed list in `backlog.md` → DEFERRED/OWED): Stab #23 first-OAuth retry hardening (deputy),
Stab #25 design deploy re-verify (§8 disclaimer + snippet), `VERCEL_SUPER_TOKEN` rotation (#22), value-gap
fixture (#11), `GITHUB_TOKEN` swap (#11-stab). Building resumes — assets lane (#14, builder-2) next.
Deferred/queued (non-blocking): value-gap fixture (#11), assets/report (#14/#15), token-swap (Stab #11),
B2 canvas editor. *Full status in `CONTEXT/active/backlog.md`.*

---

## As-built log
*(Pre-stubbed skeletons — each filled from the actual code when its Wave-1 PR merges. Until a
section shows a PR/commit + date, it is a PLACEHOLDER, not as-built fact. Order = expected merge order.)*

### 1. encoding-codec — **MERGED** (PR #6 · `shepherd@d6aa993` · 2026-06-17 · builder-2)
**Module:** `src/lib/encode/codec.ts` (+ `codec.test.ts`, ~200 lines of round-trip/edge tests).
- **API:** `encodeConfig(config) → {c, z}`, `decodeConfig(c, z) → config`, plus `encodeToQuery` /
  `decodeFromQuery` (URLSearchParams convenience) and `base64urlEncode/Decode`. All failures surface
  as `CodecError` with a caller-safe message.
- **Envelope:** `{ v: 1, d: <config> }` — `CODEC_VERSION = 1`; decode rejects a missing envelope or a
  version mismatch. This is the `v:1` gate that keeps embedded URLs decodable as the schema evolves.
- **gzip by size:** `GZIP_THRESHOLD = 512` bytes — below it (or if gzip *grows* a high-entropy blob)
  ships raw; the `z` flag records which branch so decode stays symmetric. Transport: `?c=<base64url>&z=1`.
- **Decompression-bomb guard:** `MAX_DECODED_BYTES = 256 KiB`, enforced by a streaming `collect()` that
  aborts mid-inflation (`gunzipCapped`) **before `JSON.parse`** — and also caps the raw (non-gzip) path.
- **Edge-safe:** Web APIs only (`CompressionStream`/`DecompressionStream`, `btoa`/`atob`, `TextEncoder`)
  — no `node:zlib`/`Buffer`. Runs unchanged on edge + Node.
- ✅ **Route-wired** (`shepherd@37c9469`): `/api/render`'s unified `decodeParam` now calls the codec's
  `inflateCapped` (caps to `MAX_DECODED_BYTES` *before* `JSON.parse`) for **both** `?scene=` and `?spec=`,
  replacing the old `node:zlib gunzipSync`. **Closes backlog Stab #1** (lead-verified diff + builder-2
  live-verified all four cases).
- ✅ **Tier-2 `?c=` transport wired** (PR #8, `shepherd@06ae202`): `/api/render` now accepts `?c=` →
  `decodeConfig` (unwraps the `v:1` envelope under the same cap) → Scene → `renderScene`. This is the
  editor's blob output path; it joins `?scene=`/`?spec=` on the same route.
- Three-tier collapse (§2): codec is **Tier-2** only; Tier-0/1 (preset / readable params) are flat
  projections onto the same internal config — projection funcs land with the decompose/editor lanes.

### 2. scene-element-model (keystone) — **MERGED** (PR #5 · `shepherd@0ce688f` · 2026-06-17 · builder-1)
**Module tree:** `src/lib/scene/{types, scene-spec, registry, render, anchor, bind, svg, subject}.ts`
+ `elements/{frame, text, logo, stat}.ts`. Proof artifacts: `docs/scene-element-proof.{json,svg}`.
Modified `src/app/api/{render,meta}/route.ts`. *(This is the substrate the old doc #1 described, now
generalized — the registry/runtime split + dispatch discipline carry over verbatim.)*

- **Wire contract** (`scene-spec.ts`): `Scene = { v:1, canvas{ w,h ≤4096, theme?, bg? }, elements[1..16] }`.
  `ElementSpec = { id (`^[a-zA-Z0-9_-]+$`, unique — enforced by `superRefine`), type, transform?,
  anchor?, knobs?, bind? }`. Element cap (16) is a compute/rate-limit boundary, same rationale as
  LayoutSpec's card cap.
- **Element module** (`types.ts`) = generalization of `Card`: `{ type, runtime, defaultSize, knobs
  (Zod SSOT, cf. Card.input), bind (affinity), slots?, render, meta }`. **One `render`** (not a
  per-format map) emitting an **SVG fragment in LOCAL coords** — composition is fragment-based and
  raster is a single scene-level step (matches how `streak` rasterizes).
- **Registry** (`registry.ts`): same self-registering one-line-per-type pattern as the card
  registries. Reference set = `frame / text / logo / stat` (proves static + anchored + data-bound
  end-to-end). The full §50 starter set (orbit/sphere/icosa, prism, lattice, tile-grid) is decomposed
  from the flagship cards in **lane #5**.
- **Subject / bind** (`subject.ts`, `bind.ts`, `types.ts`): `Subject{ kind: user|org|repo, id }`;
  `Bind = {provider:"literal",value} | {provider,subject,metric}`; resolves to `BoundValue{value,display}`.
  `MetricDef.subjectKinds[]` **is** the compatibility matrix, and its `resolve()` MUST call the existing
  `data/atoms.ts` / `data/nitrotype.ts` atoms — the bind layer is a thin seam, never reimplements fetch.
- **Anchoring** (`anchor.ts`): 8 geometric slots + optional module-published custom slots;
  `Anchor{to,slot,dx,dy}` places the child's center at the parent's slot (resolved in dependency order),
  so a child stays placed as its parent resizes.
- **Renderer** (`render.ts`): theme resolved once (canvas theme/bg + request overrides) → per element
  validate knobs + resolve bind → `resolveBoxes` → render fragment → **`namespaceIds(fragment, "${id}__")`**
  → nested `<svg>` position (+ `rotate` via `<g>`) → stable z-sort → compose over a `bg` `<rect>`. SVG
  returns directly; png/webp/avif rasterized once via `sharp(density:144)` with Noto embedded (`fontDataUri`).
- **Stab #2 fixed here** ✓ — `namespaceIds` rewrites `id="…"`, `url(#…)`, and `href`/`xlink:href="#…"`
  with a per-element prefix, so two instances of one element type can't collide on a `<defs>` id.
  *(Hardened in PR #10 — see as-built §4: prefix is now index-based `e{i}__` and SMIL `begin`/`end`
  timing refs are rewritten too; both original edge-cases closed.)*
- **`/api/meta` extended** (Queued #6 landed here): now serves `elements` (each with `knobsSchema`
  JSON-Schema + `bind` affinity + exposed `slots`) and `metrics` = `metricMatrix()` (the subject-kind
  compatibility matrix), alongside the retained `cards` surface.
- **`/api/render` extended:** GET routes by param — `?scene=` (Scene) vs `?spec=` (legacy LayoutSpec,
  retained during transition); POST sniffs body shape (`elements` ⇒ Scene, `cards` ⇒ LayoutSpec). Both
  GET transports share one `decodeParam()`, now size-capped via the codec's `inflateCapped` (PR #6, `shepherd@37c9469` — Stab #1 closed).

### 3. auth-foundation + atom L2 seam — **MERGED** (PR #7 · `shepherd@8972dc8` · 2026-06-17 · deputy)
**Scope:** Better Auth + envelope crypto + Neon schema + Upstash + the runtime-agnostic atom seam
(token-select → L2 → meter). **Standalone — NOT yet wired into `dispatch.ts`/render** (that's Wave-2
item #4). Both DB and Redis clients are **lazy** so `next build` needs no live creds.

- **Auth** (`auth.ts`, route `api/auth/[...all]/route.ts`): Better Auth over a Drizzle/Neon adapter.
  **GitHub OAuth = primary private-data path** (token lands in the `account` table); email/password also
  enabled. `requireEmailVerification` is **off for now** (no email sender provisioned in Wave 1; the
  publish-gate is Phase C). Account gates construction/publish, never the anonymous URL (spec §3).
- **Envelope crypto** (`crypto.ts`, 8 tests in `crypto.test.ts`): AES-256-GCM, **Web Crypto only**
  (edge+node). Two-layer — `plaintext —AES-GCM(dataKey,iv)→ ciphertext`; `dataKey —AES-GCM(masterKey)→
  wrappedDataKey`. Stores `{ciphertext, iv, wrappedDataKey, keyVersion}`; the master key (`PAT_ENC_KEY`)
  **never touches the secret**, only wraps per-secret random data keys → **rotation re-wraps data keys**
  (cheap) and a KMS move only changes wrap/unwrap. (spec §4; invariant §14.3.)
- **Credential vault** (`vault.ts`): per-user, per-provider. Plaintext enters via `addCredential`
  (encrypted immediately) and leaves **only** via `getDecryptedSecret`, in-memory, per render — never
  logged/returned/cached; clients see `label + last4 + scopes`. `validateGitHubToken` does the
  "validate on add / show what it unlocks" check (the token's own scope IS the authz boundary).
- **Mercy ladder** (`token-select.ts`): authenticated + stored PAT → **their** token; else shared
  `GITHUB_TOKEN`; `requirePat` (private scope) hard-errors instead of silently falling back. ⚠️ **SCALING
  NOTE in code:** do **not** add a shared-PAT pool (ToS gray-to-red) — use a GitHub App for anonymous
  headroom. (spec §7/§9.)
- **THE atom seam** (`seam.ts`, `atoms-seam.ts`): `defineAtom` wraps a fetcher into
  `(params, ctx) → data` flowing through the exact spec order — **identify owner → select token → build
  L2 key `provider:subject:metric:SCOPE` (public = shared / private = owner-namespaced) → L1 dedupe →
  read-through L2 → on real MISS meter upstream + touch PAT `last_used`.** Private keys namespaced by
  `owner.userId` so data never crosses owners (invariant §14.5).
- **L2 cache** (`l2cache.ts`): caches the upstream *response* (not the image); **L2 TTL is the sole
  upstream governor** (§14.4). Fresh→serve; stale→serve + background single-flight revalidate (SWR);
  cold→single-flight blocking (one Redis lock/key coalesces cross-region misses); **ETag revalidation**
  (304 doesn't count vs quota); **Retry-After backoff + stale-if-error** → degrade to cached bytes,
  never throw (§14.1).
- **Usage — two ledgers** (`usage.ts`): `upstream` = cache MISSES = quota/mercy meter (BYO-PAT misses
  hit their key, not ours); `render` = every render incl. L2 hits = abuse meter. Upstash atomic `INCR`,
  hourly self-expiring buckets, periodic flush → Neon `usageLedger`. (spec §7, memo §7.2.)
- **Storage** (`db/schema.ts`, `drizzle/0000_auth_foundation.sql`): Neon/Drizzle tables — `user`,
  `session`, `account`, `verification`, `entitlements`, `credentialVault`, `publishedEmbeds`,
  `usageLedger`. Upstash via `redis.ts` (REST, edge+node, lazy).
- **Provisioning env** (Mo's turnkey list, see backlog Provisioning): `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_OAUTH_CLIENT_ID/SECRET`, `GITHUB_TOKEN`,
  `UPSTASH_REDIS_REST_URL/TOKEN`, `PAT_ENC_KEY`.

### 4. decompose flagships → elements + presets — **MERGED** (PR #10 · `shepherd@bed4951` · 2026-06-17 · builder-1)
**This is the v1 Definition of Done — CODE-COMPLETE and fully QA-PASSED** (design-fidelity = CLEAN FULL
PASS; scout data = PASS, typing-orbit exact 150/175). Mo's three README banners now rebuild from
composable elements — no monolithic card, and now **README-embeddable** via Tier-0 `?preset=` (PR #14).
*(Two QA follow-ups, neither a DoD fail: Stab #8 sheen → POLISH, Stab #9 commits-vantage → product/security.)*
- **New elements** (`scene/elements/`): `orbit` (the neon/prism orbit), `lattice` (counter-rotating
  background), `tile-grid` — registered in `registry.ts`. Re-implemented from the flagship cards.
- **Preset registry** (`scene/presets.ts`): `Preset.build(params) → Scene`, rendering through the exact
  same `/api/render` pipeline as any hand-authored scene. Three flagship presets (`commits-orbit`,
  `typing-orbit`, `syndicate`). Binds point at live `github:*`/`nitrotype:*`; a `sample` map substitutes
  literal values for offline/editor preview (§12). ✅ The `?preset=` **URL transport is now wired**
  (PR #14, `shepherd@261f4c1`): `GET /api/render?preset=<name>&user=<id>` builds the preset's Scene and
  renders it through the same L1 path — the flagship presets are genuinely README-embeddable.
- **namespaceIds hardened** (`render.ts`) — both Stab-#2 edge-cases CLOSED: the prefix is now an
  **index-based** `e{i}__` (not the user-controlled element id, killing the ambiguous-collision risk),
  and **SMIL `begin`/`end` timing refs** (`idref.event`) are now rewritten too, so duplicated animated
  elements can't cross-bind. (`docs/decompose-proof/namespacing-dup-orbit.png` proves two orbits.)
- **Stab #5 closed** — drift constants single-sourced so SVG + Satori read one value: `TRACK_OPACITY`
  (bar), `BG_GRADIENT_OPACITY` (commits), `LABEL_LETTER_SPACING_EM` (metric).
- **Stab #6 closed** — dead `responsiveThemeStyle()` deleted from `svg-helpers.ts`; orbit re-landed as a
  scene element (curated palette is a "treatment" default; theme/overrides compose on top).
- Proof artifacts under `docs/decompose-proof/` (per-card SVG/PNG + LIVE preset renders).

### 5. L1 render-output cache — **MERGED** (PR #12 · `shepherd@0e8ae47` · 2026-06-17 · builder-2)
**Module:** `src/lib/data/l1cache.ts` (+ `l1cache.test.ts`); wired into `/api/render`. Caches the
**rendered bytes** (SVG/PNG/WebP/AVIF) per (config, presentation, format) — the layer between camo (L0)
and the renderer. **L1 caches the image; L2 caches the upstream data.** A hit returns bytes with **no
Satori/Skia/sharp work and no render-meter tick** → a popular published embed costs ~0 compute after the
first render. **Closes [PERF] Stab #3.**
- **Read-through + single-flight render lock** (one Redis lock per key) so simultaneous cross-region camo
  misses coalesce into ONE render (no thundering herd on compute) — mirrors `l2cache.ts` discipline.
- **Graceful degrade:** if Upstash is unconfigured or any cache op fails, it bypasses and renders
  directly — L1 is purely additive, never a new failure mode (invariant §14.1 spirit).
- **Freshness:** caller picks `ttlMs ≤ min L2 TTL` of the config's binds, so a cached image can't outlive
  the data it rendered. **Size guard:** outputs > `L1_MAX_BYTES` (512 KiB) render but skip the store.

### 6. auth → dispatch wiring (owner/vantage into render) — **MERGED** (PR #15 · `shepherd@6074393` · 2026-06-17 · deputy)
Threads identity + vantage isolation through the render path. **Lead security-review + builder-1
contract-review both PASS. Edge routes untouched** (only the Node `/api/render` path). Files:
`render/route.ts`, `seam.ts`, `atoms-seam.ts`, `bind.ts`, `scene/{render,types}.ts`, **`data/cache-key.ts`**.
- **`deriveCacheKey`** (`cache-key.ts`) — the load-bearing privacy primitive, kept a **pure,
  dependency-free, unit-testable** function. A read is keyed **private (owner-namespaced)** iff the metric
  is statically `private` **OR** it's `vantageSensitive` **and** fetched with a non-app token. So a
  private-inclusive value can **never** land under the shared `:public` key where a public embedder would
  read it (closes Stab #9 architecture thread; invariant §14.5). Backed by a **falsifiable leak test**.
  - *Threat-model note (verified, Stab #10):* the app token is **public-vantage, not all-seeing** — a
    metric like `restrictedContributionsCount` is gated by the **target user's** "include private
    contributions" profile setting, not the viewer token. So the public/private gap (and thus the need
    for owner-namespacing) exists **only for setting-OFF subjects**; setting-ON users have anon == authed.

### 7. publish → embed lifecycle — **MERGED** (PR #17 · `shepherd@ee00116` · 2026-06-17 · builder-2)
**Module tree:** `src/lib/publish/{path, publish, render-embed, snippet, store}.ts` + route
`src/app/i/[id]/route.ts`. Lead build + security review PASS (60/60). Implements spec §8.
- **`/i/<id>[.ext]` permanent embed** (`i/[id]/route.ts`): resolves the published config → renders via the
  **same `renderScene` + L1 path** → returns **only image bytes, never the config JSON**. **Possession of
  the unguessable id IS the authorization**; the embed is public (camo-anonymous) but renders with the
  **publisher's vantage** (owner-from-id), so a consented private bind uses their token and L1/L2 stay
  owner-namespaced. **Disabled or missing → identical 404** (moderation §11). `?theme=` split, `?v=`
  transient refresh (L2 TTL floor still governs; stale-if-error), `?cb=` camo-bust ignored at render.
- **`publishEmbed`** (`publish.ts`) — **LIBRARY-ONLY**, sole caller = deputy's gated publish action
  (session + email-verified + entitlements); never a route/unguarded action (the one-insert-path guard).
  Transactional: validate Scene → allocate 128-bit unguessable id (`genId`, collision-retry ×4, atomic
  `onConflictDoNothing`) → INSERT → **pre-warm L1+L2** across snippet theme variants (`undefined`/`dark`/
  `light`, best-effort `allSettled`) → return `{id, url, snippet, exposesPrivateData}`. `exposesPrivateData`
  = `sceneHasPrivilegedBind` (computed here, single source of truth, never caller-supplied). Camo hit #1 is
  a cache hit → "no broken embed, ever."
- **Snippet** (`snippet.ts`): full `<a>`-wrapped `<picture>` with `prefers-color-scheme` dark/light split +
  bare `<img>` fallback; carries a **stable per-publish `?cb=`** (base36 epoch, new on re-publish) — the
  permanent URL carries **no `?v=`** (that's the transient owner refresh). *(See `github-theme-aware-images.md`.)*
  - **Basic-tier embed model = single themed `<a><img>` end-to-end (design §3).** The editor (PR #25,
    `ecb80b9`) and the publish `snippet.ts` (PR #27, `84e139a`, closing Stab #24) **both** now emit a single
    themed image — theme drives the preview + embed URL; the editor light/dark toggle is a page-bg preview,
    not two variants. WYSIWYG from editor → published embed. *(The `<picture>` split was dropped here as a
    product choice; the `github-theme-aware-images.md` `<picture>` technique itself remains correct for any
    caller that wants an auto-adaptive embed.)*
- **Path/store** (`path.ts`/`store.ts`): `parseEmbedPath` (id = base64url, optional ext, default svg);
  `insertPublishedEmbed`/`getPublishedEmbed` over the `published_embeds` table with a `disabled` flag.

### 8. Phase C — accounts live — **MERGED** (PR #18 · `shepherd@811c8a8` · 2026-06-17 · deputy)
Makes the #3 auth foundation **user-facing** + adds the publish gate. UI: `sign-in`/`sign-up`/`account`
pages, `auth-form.tsx`, `vault-manager.tsx`, `auth/client.ts`. Honest gating — an account gates
**construction/publish only**, never tuning or the anonymous public card.
- **Session helpers** (`auth/session.ts`): `getSessionUser` **never throws on a missing session**
  (anonymous is a valid state — the public front line); `requireUser` → 401; typed `AuthError` (401/403).
- **`assertCanPublish`** (`auth/publish-gate.ts`) — **the ONLY authorizer of a write to `published_embeds`**;
  `publishEmbed` (#7) is library-only, called solely behind this gate. Checks in order: signed-in (else 401)
  → **email-verified** (else 403, "verify to publish"; GitHub sign-in auto-verifies) → within `maxPublished`
  (else 403). **Wired (PR #20, `shepherd@dd20b12`):** the gated **`POST /api/publish`** (ownerId-from-session)
  + owner-scoped **`PUT /api/publish/[id]`** (404 fail-closed) are the only callers — `assertCanPublish` →
  `publishEmbed` → `{id, url, snippet}`. The editor's publish-call (backlog #13b) is the last hop to wire.
- **Entitlements** (`auth/entitlements.ts`, spec §9): limits **read from the DB, never hardcoded** →
  dialing tiers later is a data change, not a migration. Everyone defaults to **`FULL_ACCESS`** (ratchet in
  schema, wide open until monetization; `null` = unlimited). `ensureEntitlements` idempotent.
- **PAT vault API** (`api/account/credentials/*`, spec §4): session-gated. Plaintext token enters **only via
  POST** (envelope-encrypted immediately by the vault), **never returned** — clients see `label + last4 +
  scopes`. `validate`-on-add confirms the token live and reports what it unlocks.
- **authed-e2e (backlog #11): MECHANISM verified** through HTTP (owner-namespaced key + ledger isolation);
  the *number-gap* half still needs a real setting-OFF subject fixture (Mo, via envoy).

### 9. editor B1 (the moat) — **MERGED** (PR #19 · `shepherd@2b37d09` · 2026-06-17 · builder-1)
**Module:** `src/app/(main)/editor/*` (`Editor.tsx`, `SchemaForm.tsx`, `controls{,-map}.tsx`,
`encoding.ts`, `meta-types.ts`) + an additive `/api/meta` tweak. The basic-tier editor — **the moat**.
- **Meta-driven, no hard-coded fields:** the editor reads `/api/meta` and renders a form per element/preset
  from each card's/element's JSON-Schema knobs (the same introspection surface from PR #5). 3-zone layout
  (pick/tune/output).
- **Debounced live preview** (~250ms): re-renders through the **shortest encoding** rather than per-keystroke
  upstream fetches (spec §12); preview reads sample/cached data.
- **Shortest-encoding ladder, client-side** (`encoding.ts`): untweaked preset → `?preset=&user=` (Tier-0);
  a tweaked scene → `?scene=<base64url>` and **auto-promotes to `?c=<gzip>&z=1` when shorter** (Tier-2). The
  codec is Web-API based so gzip runs in the browser. Theme appended per-variant for the `<picture>` split.
- **Copy-embed:** generates the full snippet and copies it; the user never picks an encoding tier.
- **Publish-call wired** (PR #23, `shepherd@c874d05`): editor → gated `/api/publish` → permanent
  `/i/<id>`, plus **sign-in-return-to-state** (resume the in-progress scene after the auth round-trip) and
  the GAP1/GAP2 fixes (`defaultSubject` on preset-switch; probe-img never-broken, spec #6). **This closes
  the funnel convergence (#13) — the whole house is built: land → tune → sign-in → publish → embed.**
- **B2 canvas / advanced tier MERGED** (PR #31, `shepherd@8fca658`): full composable canvas on the same
  Scene model — 4-zone layout (layers/canvas/inspector), lossless **eject** (B1 preset → editable canvas),
  undo/redo, publish-from-canvas. **The v1 editor (B1+B2) is complete.** Deferred B2 polish (non-blocking):
  drag-reorder, marquee-select, slot-ghosts, inspector asset-picker.
- **`resolveOwner`** (`render/route.ts`): owner-from-session via Better Auth `getSession`. **Never blocks
  a render on auth** — if session resolution fails, treat as anonymous. (Embed owner-from-published-id
  arrives with `/i/<id>` in Phase C.)
- **`RenderContext`** threads `owner` + per-render L1 dedupe + the SWR hook into the seam; the **mercy
  ladder** now selects the PAT vs app token on the live render path, and **`meterRender`** ticks the
  per-owner abuse meter (never per-IP).
- **L1 owner-namespacing**: when `owner && sceneHasPrivilegedBind(scene)`, the render-output key gets an
  `owner:<id>` namespace (mirrors the L2 invariant) so a privileged image can't be served to a public embedder.
- ⚠️ **Owed:** the authed-PAT *HTTP e2e* path (login → PAT decrypt → private render → owner-namespaced
  cache → their ledger) is unit-proven but not exercisable until the Phase-C login UI exists — backlog #11.
