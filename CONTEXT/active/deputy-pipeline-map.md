# Render Pipeline — Architecture Map

> Source: deputy warmup survey (read-only), 2026-06-17. File-ready for scribe to consolidate.
> Scope: `/api/render`, `/api/<user>/<stat>` (+ `/api/n/*`), `/api/meta`, the card
> registry, the Satori(edge) + Skia/Sharp(node) split, and LayoutSpec encode/decode.

## 1. Entrypoints

| Route | Runtime | Purpose |
|---|---|---|
| `GET /api/<user>/<stat>` | edge | Single card. `route.tsx` → `dispatchCard(getEdgeCard)`. |
| `GET /api/n/<user>/<stat>` | nodejs | Single card needing native graphics. `route.tsx` → `dispatchCard(getCard)`. **Internal** — clients still call `/api/<user>/<stat>`; `next.config.ts` rewrites node-only cards here. |
| `GET\|POST /api/render` | nodejs | Compound (multi-card composite). GET: `?spec=<base64-JSON>[&z=1 gzip]&format=`. POST: JSON body. Both → `LayoutSpec.safeParse` → `renderCompound`. |
| `GET /api/meta` | nodejs (`force-static`) | Introspection for the editor: serializes `allCards()` incl. zod→JSON-Schema. |

All image routes are `force-dynamic`. Uniform `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`.

## 2. Core dispatch flow (`src/lib/cards/dispatch.ts`)

1. `STAT_RE` parses `<card>.<svg|png|webp|avif>` (400 if malformed).
2. `getCard(name)` lookup (404 if unknown).
3. Runtime guard: `card.runtime !== input.runtime` → 500 (catches registry/rewrite drift — loud, not silent).
4. Format guard: renderer missing for that format → 404.
5. Build input object from `pathParams` + `searchParams` (**first write wins** → path params can't be overridden by query).
6. `card.input.safeParse` (zod) — 400 on failure. All validation at the boundary; downstream sees typed data.
7. `card.resolve(parsed.data, new DedupeCache())` — 502 if upstream throws.
8. Resolve `w`/`h` via `parseIntOr` (clamp 1..4096, fallback to `card.defaultSize`) + `resolveTheme(searchParams)`.
9. `renderer({ data, theme, width, height, baseUrl })` — 500 on throw.
10. `etagOf(body)` → 304 if `If-None-Match` matches, else 200 with `X-Card` / `X-Runtime` headers.

## 3. Card model (`src/lib/cards/types.ts`)

```ts
Card<TInput, TData> = {
  name; runtime: "edge" | "nodejs"; defaultSize;
  input: z.ZodType<TInput>;
  resolve: (input, cache?) => Promise<TData>;
  formats: Partial<Record<CardFormat, CardRenderer<TData>>>;
  meta: CardMeta;  // title, description, dimensions[], supportsAnimation
}
```

15 cards: commits, streak, portrait, text, metric, bar, orbit, typing, syndicate, hero, strip, prism, nucleus, commits-orbit, typing-orbit.

### Registries
- `registry-edge.ts` — 13 **edge** cards. Must NEVER transitively import a node-only module (sharp / @napi-rs/canvas) or the edge bundle breaks.
- `registry-all.ts` — all 15. Used by the node route, `/api/meta`, and compound.
- `next.config.ts` `serverExternalPackages: ["@napi-rs/canvas", "sharp"]` (left as runtime `require`, not bundled).

## 4. Render split

**Edge / Satori**
- SVG: hand-built template strings with SMIL `<animate>` + CSS keyframes (survive GitHub's camo proxy — only `<script>` is stripped).
- PNG: `next/og` `ImageResponse(jsx, { width, height })` (Satori → resvg).

**Node / Skia + Sharp**
- `portrait`: `@napi-rs/canvas` (Skia) full canvas API → PNG; sharp transcodes WebP/AVIF.
- `streak`: SVG template → `sharp(svg, { density: 144 }).resize().png()`; embeds `NotoSans-Regular.ttf` as a base64 data-URI `@font-face` for the raster path only (Vercel Node has no system fonts).

## 5. Data layer

- `data/client.ts` — `gh()` = `@octokit/graphql` `.defaults()` with `bearer GITHUB_TOKEN` and a `cachedFetch` that sets `next: { revalidate: 300 }` (honored on edge + node).
- `data/atoms.ts` — `atom()` factory wraps a fetcher into a deduped query (`name:JSON.stringify(params)` cache key). Atoms: `userOverview`, `userContributions`, `userLifetime` (aliased per-year query, floor 2016), `userTopLanguages`.
- `data/nitrotype.ts` — `nitrotypeRacer` via `nitrotype-api.vercel.app` proxy (typed errors on upstream `{error}`/non-ok).
- `data/cache.ts` — `DedupeCache`: per-render in-flight dedup (DataLoader-lite). Cross-request caching is ONLY Next's fetch cache (300s); render output is not cached.

## 6. LayoutSpec + compound (`spec.ts`, `compound.ts`)

`LayoutSpec` = `{ v: 1, w/h ≤ 4096, theme?, cards: [1..8] { type, input, x, y, w, h } }`. Hard caps (8 cards, 4096px) are boundary policy.

- **Encode** side lives in callers (e.g. unlv-museum sync script) — no encoder in this repo. Decode: `/api/render` does base64url→(optional gunzip)→`JSON.parse`→`LayoutSpec.safeParse`.
- `renderCompound`: theme resolution (searchParams > spec.theme > default) → `renderSubCards` (each via `getCard`, parallel, **shared** `DedupeCache`) at sub-format (`svg` stays svg; png/webp/avif → render subs as `png`).
  - SVG compose: `stripOuterSvg` each sub then wrap in nested `<svg x y w h viewBox overflow=visible>` over a bg `<rect>`. Nested SVGs preserve each sub's SMIL/CSS.
  - Raster compose: `sharp({create: bg}).composite(layers @ top/left)` → png/webp/avif.
- Compound is deliberately NOT in the registry → enforces depth=1 (no compound-in-compound) at the type level.

## 7. Fragility / risk hotspots

1. **Compound SVG ID collisions** (silent correctness bug). Def IDs are static per *card-type*, not per-instance (`bg`/`sheen` in commits; `blur`/`card-bg` in streak; `tBg`/`cBg`/`hBg`/… in newer cards). Compose inlines stripped sub-SVGs into one document, so `url(#id)` resolves to the first matching node → a compound with two instances of any card (or any cross-card id reuse) renders the wrong gradient/filter/mask. **Fix:** namespace IDs per sub-card index at compose time.
2. **Three-place runtime routing coupling.** Node-only cards must agree across (a) `next.config.ts` rewrite regex `(streak|portrait)`, (b) `registry-edge` (must EXCLUDE), (c) `registry-all` (includes). Forget the regex → edge route → `getEdgeCard` null → 404. Add to edge registry → edge bundle pulls native deps → build break. The 500 mismatch guard only fires when a card is registered for the wrong runtime, not for these misroutes. **Fix:** derive the rewrite list + per-runtime registries from one source of truth (`card.runtime`).
3. **No compute caching + decompression bomb on `/api/render`.** `force-dynamic` + ETag computed after the full render ⇒ every hit re-runs Satori/Skia/sharp (304 saves bandwidth, never CPU). And `?z=1` `gunzipSync` runs on attacker-controlled base64 with no inflated-size cap before `JSON.parse` (the 8-card/4096 caps apply only after parse) → OOM risk. **Fix:** cap decompressed size before parse; cache rendered output by spec hash/etag.

### Honorable mentions
- `portrait` Skia text uses `ui-sans-serif`/`system-ui` but **no font is registered** anywhere (`GlobalFonts`/`registerFont` absent) → likely fallback/`.notdef` glyphs in prod. `streak` embeds Noto for its raster path; `portrait` never does.
- Compound raster has no bounds check that `x+w ≤ spec.w` / `y+h ≤ spec.h`; `sharp.composite` throws (500) if a layer overflows the base canvas.
- ETag is SHA-256 sliced to 32 hex chars; recomputed on every request including 304s.
