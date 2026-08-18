# GitHub theme-aware images: what actually works

A README image needs to flip with the viewer's GitHub theme (light / dark) to read well in both. There's a tempting wrong answer and a correct answer. Captured here so we don't relearn it.

## The wrong answer: `@media (prefers-color-scheme: dark)` inside the SVG

```svg
<style>
  .title { fill: #18181b; }
  @media (prefers-color-scheme: dark) {
    .title { fill: #fafafa; }
  }
</style>
```

This works when the SVG is opened as a document and tested with DevTools' rendering emulator — which makes it _look_ like the right answer. **It is not.** When the same SVG is loaded via `<img>` on github.com (proxied through camo), the `@media` query evaluates against the **browser/OS-resolved** color scheme, not the github.com page's resolved scheme.

The two diverge constantly:

- OS dark + GitHub theme light → SVG flips dark, page is light → jarring
- OS light + GitHub theme dark → SVG stays light on a dark page → jarring
- camo's own caching can pin a render in one mode for hours after the user switches

Verified live on `https://github.com/moefingers/JS-Events-Demonstration`: the banner always rendered dark regardless of the GitHub theme setting.

## The right answer: `<picture>` with theme-pinned sources

GitHub explicitly supports `<picture>` in README markdown ([changelog 2022-05-19](https://github.blog/changelog/2022-05-19-specify-theme-context-for-images-in-markdown-beta/)). The browser evaluates the `<source media>` selectors against the **github.com page's** resolved color scheme — which tracks the user's GitHub Appearance setting, not just the OS. The matching variant is fetched directly; the fallback `<img>` is used otherwise.

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://example.com/banner?theme=dark">
  <img src="https://example.com/banner?theme=light" alt="...">
</picture>
```

This swaps reliably and correctly.

## The render-side implication

Each card endpoint that wants to participate in `<picture>` needs to accept a theme parameter and emit a **theme-locked** SVG — no `@media` block. One palette, fixed colors. The same endpoint can still serve a responsive version (with `@media`) when called without the param, for direct viewing and dev work.

Shape that works:

```
GET /api/<card>.svg                  → responsive (with @media for prefers-color-scheme)
GET /api/<card>.svg?theme=light      → fixed light palette, no @media
GET /api/<card>.svg?theme=dark       → fixed dark palette, no @media
```

In code, factor the palette into a constant per theme and emit either:

- both palettes + `@media` wrapper around dark (default, when `theme` is unset)
- just the requested palette (when `theme` is `light` or `dark`)

This keeps a single source of truth for the colors.

## README authoring pattern

When a project consumes the card in its README, write:

```html
<a href="https://yourproject/canonical-link" target="_blank" rel="noopener">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://dynimage.example/api/card?theme=dark&...">
    <img src="https://dynimage.example/api/card?theme=light&..." alt="..." width="100%">
  </picture>
</a>
```

The `<a>` wrapper makes the image clickable; `<picture>` handles the theme split.

## Cache busting

camo aggressively caches the image at the URL level. When card data changes (and you want the new render visible immediately rather than after camo's TTL), append a query param the URL hasn't seen before — content hash, lockHash, last-modified timestamp, anything stable that changes with the data:

```
?theme=dark&v=<hash>
```

`?v=<random>` works for manual one-shot refreshes; `?v=<contentHash>` is the proper version-on-publish pattern.

## What we tried before landing on this

1. Inline `@media` in SVG → broken on github.com (always rendered dark).
2. Radial-gradient bg (e.g. `#0d1117` edges, black center) baked into the SVG — proposed as a workaround so the banner would look fine on either GitHub theme. Made moot once `<picture>` was in place because the SVG can stay transparent and each variant has its own palette.

## Verified

- unlv-museum's `/github-banners/[slug]` route — accepts `?theme=light|dark`, omits the `@media` block when theme is pinned, ships at `unlv-museum.infinite-syndicate.com/github-banners/<slug>`.
- README on `moefingers/JS-Events-Demonstration` — uses `<picture>` and flips cleanly between Appearance settings.

Pattern is portable; dynimage should adopt the same `?theme=` convention on cards that have themed palettes.
