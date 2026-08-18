# "Adaptive (auto light/dark)" Theme Option — Spec (deferred / backlog)

> Owner: **design**. The opt-in counterpart to the §3 fixed-WYSIWYG theme ruling.
> Status: **BACKLOG** — not B1/B2-blocking. Spec'd now so it's lane-ready when prioritized.
> Companions: `editor-b1-ux-spec.md` §3 (the fixed-theme default this extends), `funnel-ux-spec.md`.

## Why it exists
§3 made theme **fixed/WYSIWYG** by default (what you pick is what every viewer sees) — because adaptive-by-default would hide a user's ocean/ember/forest/rose choice from light-mode viewers. But some users genuinely want a banner that **follows the reader's GitHub light/dark appearance** (a dark banner that becomes light on a light-mode page). This is the explicit, opt-in path for that — the one case where the `<picture>` split is correct.

## The control
- A single **"Auto light/dark" toggle** sits next to the theme picker (both B1 basic + B2 advanced). **Default OFF** (fixed/WYSIWYG).
- When **ON**: the chosen theme becomes the **dark-mode** variant; the **`light`** theme is automatically the **light-mode** variant.
- Constraint: only the **5 dark themes** (dark/ocean/ember/forest/rose) are valid as the dark half. If the chosen theme is already **`light`**, the toggle is disabled/N-A (it's already a light banner — nothing to adapt to).

## Behavior
| Auto light/dark | Embed output | Preview light/dark toggle |
|---|---|---|
| **OFF (default)** | single themed `<a><img>` at the chosen theme (§3) | previews the banner on a light vs dark **page bg** (banner unchanged) |
| **ON** | `<picture>` split: chosen theme for dark mode, `light` theme for light mode | previews the **two real variants** (chosen-dark / light) |

## Snippet (when ON)
```html
<a href="…">
  <picture>
    <source media="(prefers-color-scheme: dark)"  srcset="…&theme=<chosen>">
    <source media="(prefers-color-scheme: light)" srcset="…&theme=light">
    <img src="…&theme=<chosen>" alt="…">
  </picture>
</a>
```
- **Ad-hoc (`/api/render`)**: append `theme=<chosen>` / `theme=light` per `<source>` (the param overrides the scene theme — which is exactly what we DON'T want for fixed, but IS what we want here).
- **Published (`/i/<id>`)**: reuse builder-2's retained **per-(id, theme)** machinery — the id resolves a config whose theme is overridden per-source, or two pre-warmed variants. Pre-warm **both** variants on publish (so camo hit #1 is instant for either mode).

## Editor UX when ON
- The light/dark toggle's meaning flips from "page-bg preview" to "**variant preview**" — show a small label: *"This banner follows the reader's GitHub light/dark mode."*
- Make the trade-off legible: a one-line note that in light mode the banner uses the clean **light** palette (not the chosen color theme) — so users aren't surprised their ocean choice "disappears" in light mode (the exact surprise §3 avoids by default).

## Non-goals (for this iteration)
- Per-theme light variants (e.g. an "ocean-light"): **out of scope** — we only have one light theme. If we ever design light variants per palette, this option generalizes to "chosen-light + chosen-dark."
- Making adaptive the default: **no** — §3 fixed/WYSIWYG stays the default; this is strictly opt-in.

## Acceptance
- Toggle OFF → byte-identical to today's §3 single-img output. ON → correct `<picture>` split, both variants pre-warmed, preview shows both. `light` chosen → toggle disabled. No regression to the fixed path.
