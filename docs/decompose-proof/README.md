# Decompose lane — verification evidence

Proof that the §50 starter elements + the three flagship **presets** render
through the scene/element pipeline, and that the existing cards are
unbroken. (Branch: `decompose-flagships`.)

## 1. Flagship presets — rebuilt from elements (v1 Definition of Done)

Each banner below is composed purely from elements (`frame`, `orbit`,
`logo`, `stat`, `text`, `lattice`, `tile-grid`) via `src/lib/scene/presets.ts`,
rendered through the unchanged `/api/render` endpoint. Values use the
preset's `sample` path (literal binds) since this environment has no
`GITHUB_TOKEN` / Nitrotype access; production binds (`github:*`,
`nitrotype:*`) traverse the identical `resolveBind` path.

- `preset-commits-orbit.png` — neon orbit + GitHub octocat caged at the orbit's `center` slot + last-year headline + all-time subline
- `preset-typing-orbit.png` — prism orbit + Nitrotype mark + average-WPM headline + best-WPM subline
- `preset-syndicate.png` — counter-rotating lattice + "Recanon" wordmark + three service tiles

## 2. Stabilization #2 — compound id-collision, now SMIL-safe + index-keyed

`namespacing-dup-orbit.png` renders **two `orbit` elements** in one scene.
Both define an internal `rim` gradient; the renderer namespaces by element
INDEX, so the output contains distinct `id="e1__rim"` / `id="e2__rim"`
(verified by grep) and **both rim glows render** — a collision would drop
one. `namespaceIds` now also rewrites SMIL syncbase refs and uses an
index prefix (pure digits ⇒ unambiguous delimiter):

```
IN:  <rect id="spin"/><animate begin="spin.end+0.4s" end="btn.click"/><circle r="0.4s"/><set begin="0.4s;loop.repeat(2)"/>
OUT: <rect id="e3__spin"/><animate begin="e3__spin.end+0.4s" end="e3__btn.click"/><circle r="0.4s"/><set begin="0.4s;e3__loop.repeat(2)"/>
```

(clock values like `0.4s` are left untouched; only id-references are namespaced.)
Two instances of the same element never collide: `e0__wash` vs `e1__wash`.

## 3. Stabilization #5 — cross-format drift single-sourced

- `card-bar.png` (Satori path): filled bar full-opacity, track at the
  single-sourced `TRACK_OPACITY` (0.5) — matches the SVG path's separate-rect approach.
- `card-metric.png` (Satori path): label tracking from the single-sourced
  `LABEL_LETTER_SPACING_EM` (0.08em), no longer a fixed 1.5px.
- `commits` bg-gradient opacity single-sourced via `BG_GRADIENT_OPACITY` (rgba in Satori).

## 4. Mechanical per-card enumeration (all 15 cards, unchanged URLs)

Each card hit at its unchanged public URL on the pipeline. NONE fail in
route / dispatch / card-load / input-validation / render — the only
failures are the upstream **data** fetch (no `GITHUB_TOKEN` here; Nitrotype
upstream 500), i.e. environmental, not a pipeline break.

| Card          | URL                                 | Result          | Stage reached                |
| ------------- | ----------------------------------- | --------------- | ---------------------------- |
| text          | `/api/x/text.svg?text=…`            | **200** svg     | rendered ✓                   |
| metric        | `/api/x/metric.svg?label=…&value=…` | **200** svg/png | rendered ✓                   |
| bar           | `/api/x/bar.svg?value=…&max=…`      | **200** svg/png | rendered ✓                   |
| orbit         | `/api/x/orbit.svg?v=neon`           | **200** svg     | rendered ✓                   |
| syndicate     | `/api/<u>/syndicate.svg`            | **200** svg     | rendered ✓                   |
| commits       | `/api/<u>/commits.svg`              | 502             | data-resolve (no token)      |
| streak        | `/api/<u>/streak.svg`               | 502             | data-resolve (no token)      |
| portrait      | `/api/<u>/portrait.png`             | 502             | data-resolve (no token)      |
| hero          | `/api/<u>/hero.svg`                 | 502             | data-resolve (no token)      |
| strip         | `/api/<u>/strip.svg`                | 502             | data-resolve (no token)      |
| prism         | `/api/<u>/prism.svg`                | 502             | data-resolve (no token)      |
| nucleus       | `/api/<u>/nucleus.svg`              | 502             | data-resolve (no token)      |
| commits-orbit | `/api/<u>/commits-orbit.svg`        | 502             | data-resolve (no token)      |
| typing        | `/api/<u>/typing.svg`               | 502             | data-resolve (nitrotype 500) |
| typing-orbit  | `/api/<u>/typing-orbit.svg`         | 502             | data-resolve (nitrotype 500) |

**Coverage note:** 5/15 render fully here (incl. `bar`+`metric`, two of the
three Stab #5-touched cards). The other 10 reach the data layer and 502
ONLY on upstream — they are byte-identical to pre-branch except they don't
import the deleted dead `responsiveThemeStyle()`; the third touched card
(`commits`) is a localized constant single-source. **Data-backed visual
confirmation of the 10 upstream cards needs a `GITHUB_TOKEN` + Nitrotype
access** — flagged for scout's preview/prod QA pass.
