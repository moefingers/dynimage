# dynimage

Dynamic GitHub stat images for README embeds. Live, theme-aware, animated SVG on Edge — raster PNG / WebP / AVIF on Node via Skia + Sharp. One URL per card; drop into an `<img>` tag in any README and it stays current.

Once deployed, replace `BASE` below with your deployment URL (e.g. `https://dynimage.vercel.app`). The embeds in this README are live — GitHub renders SVG (including SMIL animation and CSS keyframes) through its `camo` proxy.

## Live cards (replace BASE after first deploy)

### `commits` — Edge, animated SVG + Satori PNG

<p>
  <img alt="commits.svg" src="https://dynimage.vercel.app/api/moefingers/commits.svg" />
</p>

<p>
  <img alt="commits.png (ocean)" src="https://dynimage.vercel.app/api/moefingers/commits.png?theme=ocean" />
</p>

### `streak` — Edge, real Gaussian blur via SVG `<filter>`, animated pulse rings

<p>
  <img alt="streak.svg" src="https://dynimage.vercel.app/api/moefingers/streak.svg" />
</p>

<p>
  <img alt="streak.png (ember)" src="https://dynimage.vercel.app/api/moefingers/streak.png?theme=ember" />
</p>

### `portrait` — Node, full Skia compositing + Sharp AVIF transcode

<p>
  <img alt="portrait.png" src="https://dynimage.vercel.app/api/moefingers/portrait.png" />
</p>

<p>
  <img alt="portrait.avif (forest)" src="https://dynimage.vercel.app/api/moefingers/portrait.avif?theme=forest" />
</p>

## URL shape

```
/api/<user>/<card>.<format>?<query>

card     commits | streak | portrait
format   svg | png | webp | avif      (per card; not all support all)

query
  theme        dark | light | ocean | ember | forest | rose
  bg           override theme bg            (hex, no leading #)
  accent       override theme accent
  text         override theme text color
  text-muted   override theme muted text
  gradient     override theme gradient stop
  stroke       override theme border
  w            override width    (1..4096)
  h            override height   (1..4096)
```

When no `theme` param is given, the SVG output is **responsive to `prefers-color-scheme`** via an in-SVG `<style>` block with `@media` rules. One URL adapts to the viewer's reader.

## Stack

- Next.js 16 App Router, TypeScript strict (`noUncheckedIndexedAccess`), pnpm
- `@octokit/graphql` over Edge-compatible fetch with `next: { revalidate: 300 }` shared cache
- `next/og` (Satori + Resvg) for Edge PNG rendering of designed cards
- `@resvg/resvg-wasm` for Edge rasterization of hand-authored SVG with `<filter>` graph
- `@napi-rs/canvas` (Skia) for Node imperative compositing
- `sharp` for Node AVIF / WebP transcode
- CSS Modules + custom-property tokens (no Tailwind)

## Architecture

- Each card is a module in [`src/lib/cards/`](src/lib/cards/) declaring its data fetcher, supported formats, and renderer per format
- One Edge catch-all at [`/api/[user]/[stat]/route.tsx`](src/app/api/%5Buser%5D/%5Bstat%5D/route.tsx), one Node catch-all at [`/api/n/[user]/[stat]/route.tsx`](src/app/api/n/%5Buser%5D/%5Bstat%5D/route.tsx)
- [`next.config.ts`](next.config.ts) rewrites the public URL to the Node catch-all for cards needing native graphics — clients only see `/api/<user>/<stat>`
- ETag derived from a SHA-256 of the response body for cheap `304 Not Modified` on hot paths
- Response headers: `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`

## Local development

```sh
pnpm install
cp .env.example .env.local           # add GITHUB_TOKEN
pnpm dev
# Browse http://localhost:3000
```

The `GITHUB_TOKEN` must be a fine-grained PAT with read-only access to public repository metadata.

## Deploy

```sh
vercel link
vercel env add GITHUB_TOKEN production
vercel env add GITHUB_TOKEN preview
git push                              # auto-deploys
```

After first deploy, update the `BASE` URL in the embeds above if your Vercel project name differs from `dynimage`.

## Adding a card

1. Add `src/lib/cards/<name>.ts` exporting a `Card<TData>` — declare `runtime`, the data fetcher, and a renderer per format
2. Register it in [`src/lib/cards/registry.ts`](src/lib/cards/registry.ts)
3. If `runtime: 'nodejs'`, add the new card name to the regex group in [`next.config.ts`](next.config.ts) rewrites

That's the whole house: no architectural decisions are left to revisit per card.
