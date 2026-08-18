> ⚠️ SUPERSEDED (2026-06-17) by the v1 **scene/element** model. The standalone "card architecture"
> doc is NOT being published — the published orientation doc is
> `CONTEXT/internal_docs/architecture-v1.md`, which folds this in as *engine-internals reference*
> (Element generalizes Card; the registry/runtime split + dispatch flow carry over under the hood).
> This outline is retained only as a source for the `scene-element-model` as-built section.
> Do not treat as the v1 product model.

# OUTLINE (DRAFT — not published) — Doc #1: Card Abstraction & the Dual Registry/Runtime Split

> Status: OUTLINE ONLY. Body writing on HOLD until lead greenlights (stabilize-vs-build-new
> decision pending Mo + design). Scribe scaffold, 2026-06-17.
> Sources consolidated: deputy `CONTEXT/active/deputy-pipeline-map.md` + builder-1 THEMING MAP
> (bus from-builder-1 #3). Cross-checked against code.
> Intended publish target: `CONTEXT/internal_docs/card-architecture.md`.

## 0. Framing (why this doc exists)
- The single most central + currently undocumented subsystem. Everything else (catalog,
  theming, compound, data) hangs off the `Card` abstraction and the edge/node split.
- Audience: anyone adding or moving a card; anyone debugging a 404/500 misroute.

## 1. The `Card<TInput, TData>` abstraction
- One declaration per card → TS infers everything downstream (types.ts).
- Fields: name, runtime ("edge"|"nodejs"), defaultSize, input (zod), resolve(input,cache),
  formats (Partial<fmt→renderer>), meta (CardMeta: title/description/dimensions[]/supportsAnimation).
- TInput = what the URL parses into (zod); TData = whatever the resolver returns / renderer needs.
- AnyCard erasure at the registry boundary — why (invariant generics, no HKT), and that it's
  sound because dispatch pairs the same card's zod input + resolver + renderer.

## 2. Request → render flow (dispatch.ts, the 10 steps)
- STAT_RE parse <card>.<fmt> (400) → getCard (404) → runtime guard (500, loud anti-drift) →
  format guard (404) → build input (pathParams+searchParams, FIRST WRITE WINS) → zod safeParse
  (400) → resolve(+DedupeCache) (502) → w/h clamp 1..4096 + resolveTheme → renderer (500) →
  etagOf → 304/200 (+X-Card/X-Runtime).
- Cross-cutting query params (theme, w, h, color overrides) are resolved SEPARATELY, not in
  card input — so all cards share consistent presentation. Call this out explicitly.
- Uniform Cache-Control on every path; routes force-dynamic. ETag = sha256 sliced to 32 hex.

## 3. The dual registry / three-place runtime coupling  ← CORE OF THIS DOC
- registry-edge.ts: 13 edge cards; MUST NEVER transitively import sharp / @napi-rs/canvas.
- registry-all.ts: all 15; used by node route + /api/meta + compound.
- next.config.ts rewrite regex `(streak|portrait)` → /api/n/*; serverExternalPackages.
- THE INVARIANT: a node-only card must appear in (a) rewrite regex, (b) NOT in registry-edge,
  (c) in registry-all. Three places that must agree.
- Failure modes (from deputy HOTSPOT #2): forget regex → edge route → getEdgeCard null → 404;
  add to edge registry → edge bundle pulls native deps → build break. The 500 mismatch guard
  only catches "registered for wrong runtime," NOT these misroutes.
- Note the known fix direction (single source of truth = card.runtime) as "Known fragility"
  — DO NOT present current 3-place setup as ideal. [cross-ref: candidate fix lane the lead filed]

## 4. Runtime split: what actually renders (builder-1: it's THREE strategies, not two)
- (1) Hand-written SVG strings — theme.* injected as literal hex; edge serves raw, node/compound
  rasterize via sharp.
- (2) Satori (next/og ImageResponse) JSX → PNG — commits, text, metric, bar.
- (3) Skia (@napi-rs/canvas) → PNG, sharp transcodes webp/avif — portrait only (no SVG path).
- streak: ONE shared streakSvg() → svg + sharp-rasterized png (density 144, Noto embedded,
  anim off) — no svg/png drift by construction.

## 5. Adding / moving a card (the checklist this doc must give)
- New edge card: create module → add one line to registry-edge + registry-all.
- New node-only card: create module → registry-all ONLY → add to next.config rewrite regex →
  (do NOT add to registry-edge). Embed fonts for any raster path (Vercel Node = no system fonts).
- Promoting/demoting between runtimes: update all three places together.

## 6. Cross-references (stubs to other docs, once written)
- Theming engine (theme.ts palettes + ?override precedence) → doc #5.
- Card catalog (per-card dimensions/formats/animation) → doc #4.
- LayoutSpec + compound → doc #3.
- Data layer (atoms/DedupeCache/octokit) → doc #6.

## 7. Open issues to NOT bury (surface as a "Known fragility" box, credit recon)
- [HOTSPOT-1 deputy] Compound SVG id collisions (per-type ids, not per-instance) — but this is
  compound's doc territory (#3); here just one-line + link.
- [HOTSPOT-2 deputy] Three-place coupling (§3 above) — primary fragility of THIS doc.
- [builder-1, VERIFIED] @media / ?theme= reality (corrects my earlier over-claim):
  - orbit.tsx: REALLY emits @media(prefers-color-scheme) AND ignores ?theme= by design —
    palette() does `void themeAccent` (orbit.tsx:267); colors come from per-variant (neon/prism)
    CSS vars, not the resolved theme. This is the genuine camo-mismatch case.
  - commits.tsx: does NOT emit @media. Only a STALE COMMENT (commits.tsx:34) claims
    "per-prefers-color-scheme theming"; actual <style> uses fixed theme.* fills → commits HONORS
    ?theme=. Do NOT document commits as camo-broken. Flag the comment for cleanup only.
  - responsiveThemeStyle() (svg-helpers.ts): dead code, zero importers.
  - Net: lead's fix lane = orbit (real) + dead-helper removal + commits comment cleanup.
- [builder-1] Cross-path font drift (edge browser font vs Satori bundled vs Noto raster vs Skia
  unregistered) — portrait Skia fonts unregistered → .notdef risk in prod.

---
TODO at greenlight: confirm 13 vs 15 edge/all counts still hold; re-verify rewrite regex; check
whether the @media bug + single-source-of-truth refactor landed (changes §3 + §7 framing).
