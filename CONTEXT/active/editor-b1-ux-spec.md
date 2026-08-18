# Editor B1 — Basic-tier UX Spec

> Owner: **design**. Drives builder-1's `editor-b1` lane (UX layer over the meta-driven engine).
> Scope: **basic tier only** (§12 ladder). Preset-first, `/api/meta`-driven, **no canvas / no X-Y-size** (that's B2).
> Companion: `funnel-ux-spec.md` (this editor is the funnel's "tune" stage). Architecture: `design-vision-spec.md`.

## 0. The one job
Let a user go **preset → pick animation → tweak color/text → see it live → copy a working embed** in under a minute, with **no account for the public path**. This is the moat; it must feel fast and obvious.

## 1. Layout / IA (3 zones)
```
┌─────────────┬───────────────────────────────────────┐
│  PRESET     │            LIVE PREVIEW (animated)      │
│  RAIL       │       [light ⇆ dark toggle]             │
│ (thumbs)    ├───────────────────────────────────────┤
│             │  CONTROL PANEL (meta-driven knob form)  │
│             │  subject · theme · color · text · anim  │
│             ├───────────────────────────────────────┤
│             │  OUTPUT: [Copy snippet] [Publish →]     │
└─────────────┴───────────────────────────────────────┘
```
- **Preset rail** (left): thumbnail of each preset (commits-orbit, typing-orbit, recanon, + primitives). Click loads it. This is the entry — no blank canvas in B1.
- **Live preview** (top-right): the actual rendered banner, **animated SVG**, with a light/dark toggle (the embed is `<picture>` theme-split, so the user must see both).
- **Control panel**: the meta-driven knob form for the selected preset.
- **Output bar**: Copy snippet (always available, public path) + Publish (gated → funnel).

## 2. The flow
1. **Pick a preset** from the rail → loads its default config into preview + panel.
2. **Enter the subject** if the preset binds data (`/api/meta` declares the dimension): GitHub username / nitrotype handle / repo. Inline-validate; show the metric↔subject-kind matrix (don't offer invalid combos).
3. **Tune knobs** (panel) — live, debounced.
4. **Pick an animation-preset** (named motion style; see §3).
5. **Watch the preview** update (sample/cached data — never per-keystroke upstream; §4).
6. **Copy snippet** (public, no account) — or **Publish** (→ funnel: sign-in/PAT/owned embed).

## 3. Meta-driven form contract (knob-type → control)
The engine reads each element's Zod-derived JSON-Schema from `/api/meta` and renders controls **with no hardcoded card names.** Mapping:

| Knob type (schema) | Control | Notes |
|---|---|---|
| `string` (text field, e.g. wordmark/label) | text input | live; char cap from schema `max` |
| `enum` (≤4 options) | segmented control | e.g. `align` |
| `enum` (>4) | select | |
| color (hex pattern) | swatch + hex input | default = theme value; clearing reverts to theme |
| `number` (has min/max) | slider + numeric stepper | step from schema |
| `boolean` | toggle | |
| `theme` (special) | 6-swatch theme picker | dark/light/ocean/ember/forest/rose |
| `treatment` (curated palette enum, e.g. neon/prism) | labeled select w/ motion-preview on hover | §  "curated palettes are knobs" |
| animation-preset (enum) | labeled select | `glow` / `orbit-slow` / `sheen` / `pulse` / `none` etc. |
| subject/dimension | text input + live validation | gated by metric↔subject-kind matrix |
| `bind.source` | **not user-editable in B1** | preset defines binds |

**Grouping (top→bottom):** Subject · Theme · Color · Text · Animation. **Basic shows only** these. **Hidden until "Advanced" (→B2):** x/y/w/h/z, `anchor`, add/remove elements, per-element z-order, raw per-color beyond accent.

**Theme × light/dark model (design ruling — BUG A):** the 6-swatch theme is a **FIXED palette applied to both modes (WYSIWYG)** — what you pick is what every viewer sees. The embed serves the chosen theme to everyone (`<a><img>`, matching the flagship README's real usage). The preview's light/dark toggle previews the banner against a light vs dark **page background** (a legibility check), **not** two banner variants. Rationale: our themed banners are self-contained (solid bg → read on any GitHub appearance), and adaptive-by-default would hide a user's ocean/ember/forest/rose choice from light-mode viewers — breaking WYSIWYG for 4 of 6 themes. **Deferred (backlog, not B1):** an explicit **"Adaptive (auto light/dark)"** option that emits the `<picture>` split (chosen dark theme for dark mode + the `light` theme for light mode) — the one case where the toggle previews two genuine variants.

## 4. Live preview rules
- **Debounced** (~250ms) re-render via `/api/render?preset=…` or `?scene=…`.
- **Sample/cached data only** — NEVER per-keystroke upstream fetch (it'd make the editor the spammiest thing we own).
- Render the **animated SVG** so motion (count-up, orbit, hue-rotate) is visible.
- **Light/dark toggle** (the embed is theme-split; user confirms both read well).
- Show a subtle "preview uses sample/cached data; live embed pulls current data" note for bound presets.

## 5. Output / copy snippet
- **Copy snippet** emits the **full embed markup**, not a bare URL: `<a>` wrapper + `<picture>` light/dark `<source>` + cache-bust. (Hand-assembly always breaks theme-switching.)
- The engine emits the **shortest encoding that fits** (preset/param URL; auto-promote to `?c=` blob past length/nesting threshold — codec exists).
- **Public path completes here, no account.** A "Publish for an owned, always-current URL" affordance leads into the funnel (sign-in/PAT/`/i/<id>`).
- **BYO-PAT nudge — adaptive, NO over-promise.** The contribution total follows the *target's* GitHub "include private contributions on profile" setting, so a public/full gap exists **only for setting-OFF subjects** (setting-ON users — e.g. Mo — already show the full number anonymously). So the nudge must not universally promise a bigger number. Framing: *"Your contribution total follows GitHub's 'include private contributions' profile setting. To show your full number: turn it on in GitHub (makes it public, no token needed) — or connect a token here to fold private contributions into this card."* Post-connect, if authed == public, show *"You're already showing your full number"* (no false gain). The token perk stays **unconditionally** real for OTHER private data (private repos/orgs) — that's its durable value.

## 6. States (must all be designed)
- **Loading**: preview skeleton (banner-shaped shimmer), not a spinner-on-blank.
- **Invalid subject** (unknown GitHub user / handle): inline error on the field, preview holds last good.
- **Data unavailable / upstream error**: preview shows the card with placeholder/sample values + a quiet "couldn't fetch live data" note — never a broken image.
- **Rate-limited (playground)**: friendly "you're going fast — preview paused a moment," not a hard error.
- **Empty (no preset selected)**: the rail with a "pick a preset to start" prompt + the default preset auto-loaded.

## 7. Microcopy (key strings)
- Rail header: "Start from a preset"
- Subject field: "Your GitHub username" / "Nitrotype handle"
- Animation control: "Animation"
- Copy button: "Copy embed" → on click: "Copied! Paste into your README."
- Publish button: "Publish →" (tooltip: "Get an owned URL that stays current")
- BYO-PAT nudge: see §5.

## 8. A11y + responsive
- Every knob control keyboard-operable + labeled (the schema's title/description feed labels + help text).
- Color contrast on controls; preview is decorative (alt text on the eventual embed handled at snippet-gen).
- Desktop-first (dev audience); below ~720px stack zones vertically (preview → panel → output), rail becomes a horizontal scroller.
