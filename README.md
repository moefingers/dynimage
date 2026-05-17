<div align="center">

# 🎴 dynimage

**Live, theme-aware, animated GitHub stat cards for README embeds.**

One URL. Adapts to the viewer's reader. Animates inside `camo`. Works everywhere `<img>` works.

<sub>Built on Next.js 16 · Edge SVG + Satori · Skia + Sharp on Node · Zero client JS</sub>

</div>

---

## 🖼️ Live cards

> [!NOTE]
> These cards hit the live API at `dynimage.vercel.app`. The SVG variants animate inside GitHub's `camo` image proxy via SMIL + CSS keyframes — only `<script>` is stripped, animation is not.

### `commits` — Edge runtime, animated SVG + Satori PNG

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=dark">
  <source media="(prefers-color-scheme: light)" srcset="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=light">
  <img alt="commits — theme-responsive" src="https://dynimage.vercel.app/api/moefingers/commits.svg">
</picture>

<p>
  <img alt="commits — ocean" src="https://dynimage.vercel.app/api/moefingers/commits.png?theme=ocean">
  <img alt="commits — ember" src="https://dynimage.vercel.app/api/moefingers/commits.png?theme=ember">
</p>

### `streak` — real Gaussian blur via SVG `<filter>`, pulse rings via SMIL

<p>
  <img alt="streak — animated" src="https://dynimage.vercel.app/api/moefingers/streak.svg">
</p>

<p>
  <img alt="streak — forest" src="https://dynimage.vercel.app/api/moefingers/streak.png?theme=forest">
  <img alt="streak — rose" src="https://dynimage.vercel.app/api/moefingers/streak.png?theme=rose">
</p>

### `portrait` — Skia compositing + Sharp AVIF transcode on Node

<p>
  <img alt="portrait" src="https://dynimage.vercel.app/api/moefingers/portrait.png">
</p>

<p>
  <img alt="portrait — ember avif" src="https://dynimage.vercel.app/api/moefingers/portrait.avif?theme=ember&w=900&h=400">
</p>

---

## 🎨 Theme gallery

The same card, six themes. Override any color via query string with raw hex (no leading `#`).

<p>
  <img alt="dark" src="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=dark">
  <img alt="light" src="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=light">
  <img alt="ocean" src="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=ocean">
</p>
<p>
  <img alt="ember" src="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=ember">
  <img alt="forest" src="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=forest">
  <img alt="rose" src="https://dynimage.vercel.app/api/moefingers/commits.svg?theme=rose">
</p>

### One-off custom palette

```md
![](https://dynimage.vercel.app/api/moefingers/commits.svg?bg=0a0a0a&accent=fb923c&gradient=7c2d12)
```

<p>
  <img alt="custom" src="https://dynimage.vercel.app/api/moefingers/commits.svg?bg=0a0a0a&accent=fb923c&gradient=7c2d12">
</p>

---

## 🗺️ Architecture

```mermaid
flowchart LR
  GH[GitHub README<br/>&lt;img src=...&gt;] --> CAMO[camo<br/>image proxy]
  CAMO --> RW{next.config<br/>rewrites}
  RW -->|edge cards| EDGE[/api/&lt;user&gt;/&lt;stat&gt;<br/>Edge runtime]
  RW -->|node cards| NODE[/api/n/&lt;user&gt;/&lt;stat&gt;<br/>Node runtime]
  EDGE --> DISP[dispatchCard]
  NODE --> DISP
  DISP --> REG{card registry}
  REG -->|svg| TPL[template SVG<br/>SMIL + CSS]
  REG -->|edge png| SATORI[next/og<br/>Satori → PNG]
  REG -->|edge blur png| RESVG[resvg-wasm<br/>SVG filter → PNG]
  REG -->|node png| SKIA[skia<br/>@napi-rs/canvas]
  REG -->|node avif| SHARP[sharp<br/>transcode]
  EDGE -.->|GraphQL| GQL[@octokit/graphql<br/>+ Next fetch cache]
  NODE -.-> GQL
  GQL -.-> GHAPI[GitHub API]
```

---

## 🔧 URL shape

```
/api/<user>/<card>.<format>?<query>
```

| segment                                                    | values                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `card`                                                     | `commits` · `streak` · `portrait`                               |
| `format`                                                   | `svg` · `png` · `webp` · `avif` (per card; not all support all) |
| `theme`                                                    | `dark` · `light` · `ocean` · `ember` · `forest` · `rose`        |
| `bg`, `accent`, `text`, `text-muted`, `gradient`, `stroke` | hex without `#`, overrides theme                                |
| `w`, `h`                                                   | 1..4096                                                         |

Press <kbd>R</kbd> in your browser to bust the cache and see fresh data.

---

## ✨ The SVG superpowers

> [!TIP]
> GitHub's `camo` proxy serves SVG faithfully — `<script>` is stripped, but **SMIL animation, `<style>` blocks, CSS `@keyframes`, `@media (prefers-color-scheme)`, and `<foreignObject>` all work**. dynimage uses all of them.

dynimage's SVG output ships with:

- **SMIL animation** — `<animateTransform>` sheen sweeps, `<animate>` count-up, pulse rings
- **CSS keyframes** inside in-SVG `<style>` — entrance fades, transitions
- **`prefers-color-scheme` media queries** when no `theme` param is given — one URL, both modes
- **Real SVG `<filter>`** with `feGaussianBlur` — actual Gaussian blur, not faked

---

## 🚀 Deploy your own

<details>
<summary><strong>Click to expand setup</strong></summary>

```sh
git clone https://github.com/moefingers/dynimage
cd dynimage
pnpm install
cp .env.example .env.local           # add your GITHUB_TOKEN
pnpm dev                              # http://localhost:3000

# Production
vercel link
vercel env add GITHUB_TOKEN production preview development
vercel --prod
```

The `GITHUB_TOKEN` must be a fine-grained PAT with read-only public repo metadata access. Create one at [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta).

</details>

> [!IMPORTANT]
> The cards above will return `502` until `GITHUB_TOKEN` is set in the Vercel project envs and the project is redeployed.

---

## 🧱 Adding a card

<details>
<summary><strong>Three steps, no architectural decisions left to revisit</strong></summary>

1. Create [`src/lib/cards/<name>.ts`](src/lib/cards/) exporting a `Card<TData>` — data fetcher, renderer per format, declared runtime
2. Add it to [`src/lib/cards/registry-edge.ts`](src/lib/cards/registry-edge.ts) **or** [`registry-node.ts`](src/lib/cards/registry-node.ts) (pick the one matching your runtime) and to [`registry-meta.ts`](src/lib/cards/registry-meta.ts) for the homepage demo grid
3. If `runtime: 'nodejs'`, add the new card name to the regex group in [`next.config.ts`](next.config.ts) rewrites

</details>

---

## 🧰 Stack

| layer              | choice                                           | why                                                                 |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| Framework          | Next.js 16 App Router                            | dual runtime per route, file-based catch-all, `next/og` built in    |
| Type system        | TypeScript strict + `noUncheckedIndexedAccess`   | per zcanon canon                                                    |
| Edge PNG           | `next/og` (Satori + Resvg)                       | Vercel-native, JSX-driven, no native deps                           |
| Edge real-blur PNG | `@resvg/resvg-wasm`                              | hand-authored SVG with `<filter feGaussianBlur>` rasterized on Edge |
| Node PNG           | `@napi-rs/canvas` (Skia)                         | full Canvas API, same engine as Chrome                              |
| Node transcode     | `sharp`                                          | AVIF/WebP, best compression                                         |
| GitHub data        | `@octokit/graphql` + `next: { revalidate: 300 }` | one round-trip per card, shared cache                               |
| Package manager    | pnpm                                             | per zcanon canon                                                    |

---

## 📐 Math

Why does the streak's blur look right at any DPR? Because SVG `<filter>` operates in user-space units, which the rasterizer scales:

$$
\sigma_{\text{px}} = \sigma_{\text{user}} \cdot \frac{w_{\text{px}}}{w_{\text{user}}}
$$

The blur kernel grows with the output resolution, so the _visual_ blur radius stays constant. No "looks fuzzy at 4x" artifacts.

---

## 🎬 What this README is also demonstrating

<details>
<summary><strong>Every GitHub-flavored-markdown trick used above</strong></summary>

| Technique                                        | Where                                         |
| ------------------------------------------------ | --------------------------------------------- |
| `<picture>` with `<source media>`                | commits theme-responsive embed at top         |
| Animated SVG embed                               | streak, commits                               |
| `prefers-color-scheme` inside the SVG            | when no `theme=` param                        |
| `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` callouts | throughout                                    |
| `<details>` / `<summary>` collapsibles           | setup, adding cards, this section             |
| `<kbd>` keyboard chips                           | URL shape section                             |
| `<div align="center">` heading                   | top of README                                 |
| `<sub>` for sub-text                             | top of README                                 |
| Mermaid diagram                                  | architecture section                          |
| LaTeX math (`$$...$$`)                           | the "why blur scales correctly" section above |

</details>

---

<div align="center">

<sub>Repo: <a href="https://github.com/moefingers/dynimage">github.com/moefingers/dynimage</a> · API: <a href="https://dynimage.vercel.app">dynimage.vercel.app</a></sub>

</div>
