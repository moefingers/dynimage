# Editor B2 — Canvas (Advanced Tier) UX Spec

> Owner: **design**. Drives builder-1's `editor-b2` lane (UX over the existing scene/element engine).
> Scope: the **advanced tier** (§12) — the full composable canvas that exposes the knobs B1 hides.
> The scene/element model **already supports all of it** (transform x/y/w/h/z/rotate, anchor/slots, per-element knobs + bind). B2 surfaces the controls. Companions: `editor-b1-ux-spec.md`, `funnel-ux-spec.md`, `design-vision-spec.md`.

## 0. The one job
Let a power user **compose a scene freely** — add/remove/arrange elements, position them, anchor them, and bind each to data — and get the same encoded URL / publish flow as B1. B1 is "pick a preset and tweak"; **B2 is "build it from elements."** Same model underneath; B2 is progressive disclosure, not a separate product.

## 1. Relationship to B1 (one model, two tiers)
- B2 is an **"Advanced" mode** you opt into from B1 (a toggle/button: "Advanced canvas →"). Opening it **loads the current scene onto the canvas** — a preset becomes editable elements; nothing is lost.
- **B1 → B2 is lossless and the expected path** (start from a preset, then go advanced to rearrange). **B2 → B1**: allowed only if the scene still matches a single-preset shape; otherwise B1 is greyed with "this scene is custom — edit in Advanced." Don't silently drop custom layout.
- B2 reuses B1's meta-driven form engine, encoding, preview, and copy/publish. **Only the canvas + layers + inspector are new.**

## 2. Layout / IA (4 zones)
```
┌───────────┬─────────────────────────────────────┬──────────────┐
│  LAYERS   │   CANVAS (live, selectable elements) │  INSPECTOR   │
│  (z-list) │   [⊹ handles on selection]           │  (selected   │
│  + Add    │                                      │   element's  │
│  element  │   [toolbar: canvas w/h·theme·zoom·   │   knobs)     │
│           │    light/dark page·snap]             │              │
├───────────┴─────────────────────────────────────┴──────────────┤
│  OUTPUT: encoding badge · [Copy embed] · [Publish →]            │
└─────────────────────────────────────────────────────────────────┘
```
- **Canvas** (center): the scene rendered live; click an element to select (selection box + move/resize/rotate handles). Drag to move, handles to resize, rotate handle to rotate. The canvas IS the live preview.
- **Layers panel** (left): z-ordered element list (top of list = top z). Select, reorder (drag), toggle visibility, delete. **"+ Add element"** opens the palette.
- **Inspector** (right): the **selected element's** controls — Transform, Anchor, type-specific knobs (the meta-driven form), and Bind. Empty-state when nothing selected (canvas-level controls).
- **Toolbar** (top of canvas): canvas `w`/`h`, scene `theme`, zoom/fit, light/dark **page-background** preview (per §3 ruling — page bg, not banner variants), snap-to-guides toggle.
- **Output bar**: encoding badge (auto `?c=` blob for full-custom) + Copy embed + Publish (same flow as B1/funnel).

## 3. Canvas interactions
- **Select**: click element → selection box + 8 resize handles + a rotate handle. Click empty canvas → deselect (canvas-level inspector).
- **Move**: drag body → updates `x`/`y`. **Arrow keys nudge** (1px; Shift = 10px) — the keyboard-accessible path.
- **Resize**: drag handles → `w`/`h`. Shift = preserve aspect. Respect element min/max.
- **Rotate**: rotate handle → `rotate`. Shift = 15° snap.
- **Snapping / alignment guides**: snap to canvas edges, center lines, and other elements' edges/centers; show guide lines on snap. Toggleable.
- **z-order**: reorder in the layers panel (drag), or context actions Bring-forward / Send-back.
- **Marquee/multi-select**: defer to a B2.1 follow-up; **single-select is fine for v1** (note the deferral, don't silently cap).
- **Delete**: Del key or layers-panel delete (with undo).
- **Undo/redo**: Cmd/Ctrl+Z / Shift+Z — non-negotiable for a canvas (track scene mutations).

## 4. Add-element palette
- "+ Add element" → palette of **every element type from `/api/meta`** (orbit, sphere, stat, text, logo, lattice, tile-grid, bar, metric, frame, …) — thumbnail + name + 1-line, **no hardcoded list** (read the catalog). 
- Pick → adds the element to the canvas at a sensible default position/size with its default knobs, selected + inspector open.
- Group the palette by category (background/decor · data/stat · text/brand · shape) for scannability.

## 5. Inspector (the selected element)
Sections, top→bottom:
1. **Transform** — `x` `y` `w` `h` (numeric + drag-on-canvas), `z` (or via layers), `rotate`. Live.
2. **Anchor** (see §6) — "Anchor to: [element ▾] · slot: [center ▾]" or "Free position." When anchored, x/y become offset-from-anchor (or hidden).
3. **Knobs** — the element's meta-driven form (same engine + knob→control mapping as B1 §3): text→input, enum→segmented/select, color→swatch+hex, number→slider+stepper, bool→toggle, treatment/animation→select.
4. **Bind** (see §7) — for data-capable elements: source / subject / metric.

## 6. Anchoring / slots (the model's distinctive feature)
The README forces this: a logo sits *at the orbit's center*. UX:
- An element can be **free** (absolute x/y) or **anchored** to a parent + named **slot** (e.g. orbit's `center`). `/api/meta` declares which elements expose slots and which slots.
- **Set anchor**: in the inspector, "Anchor to → [pick a parent element that has slots] → [pick slot]." On anchor, the child snaps into the slot and **stays placed as the parent moves/resizes** (offset editable).
- **Visual affordance**: when a parent is selected, show its open slots (ghost markers); dragging a compatible element near a slot shows a snap hint ("drop in center"). Show the anchor link subtly (a tether line or a nested badge in the layers panel: child indented under parent).
- **Unanchor**: "Free position" converts back to absolute x/y at the current rendered location (no jump).
- Guard: prevent anchor cycles; only offer slots the child is compatible with.

## 7. Per-element data-bind
B1 hid this (presets pre-bind); B2 exposes it.
- For a data-capable element (stat/metric/etc.), Bind = **Source** (`github` / `nitrotype` / `literal` / [future: fetch]) → **Subject** (`{kind: user|repo|org, id}`) → **Metric** (gated by the **metric↔subject-kind matrix** so only valid combos show).
- `literal` = a static value (no fetch) — the simplest bind.
- Show the **vantage/perk note** where relevant (private-vantage metrics) per the funnel/§7 adaptive copy.
- Invalid/unset bind → the element renders a placeholder + an inspector warning, never a broken canvas (mirror B1's graceful states).

## 8. Live preview rules (same as B1)
- The canvas re-renders **debounced**; **sample/cached data only**, never per-keystroke upstream.
- **Loading** → "rendering…" indicator (don't blank the canvas). **Error** → keep last-good render + the graceful note (spec #6). 
- Theme = **fixed/WYSIWYG** per §3 (the toolbar light/dark previews page bg, not variants).

## 9. Output / encoding (same as B1, auto-promoted)
- A full-custom scene **auto-promotes to the `?c=` blob** (base64url + gzip-by-size); the encoding badge shows "compact." Copy-embed emits the single themed `<a><img>` (§3); Publish runs the same transactional pre-warm → `/i/<id>` flow.
- Nothing new in the output layer — B2 just produces richer scenes the codec already handles.

## 10. Guardrails
- **Element cap** — enforce the scene's policy cap (LayoutSpec capped sub-cards at 8; confirm the scene model's cap with the engine and **surface it** — "max N elements" — never silently drop).
- **Canvas/element bounds** — elements clamp to canvas; min element size; w/h within 1–4096 (the route's existing caps).
- **Confirm destructive deletes** of anchored parents (children get unanchored/deleted — warn).

## 11. States
- **Empty canvas** (start blank): "Add an element to begin, or start from a preset (B1)." Offer both.
- **Loading / render-error**: §8 (graceful, never broken).
- **Invalid bind**: §7 (placeholder + warning).
- **Unsaved work**: same draft model as the funnel (anon draft → sign-in migrates → published). Undo history is session-local.

## 12. A11y
- **Every canvas action has a keyboard path**: arrow-nudge move, inspector numeric fields for x/y/w/h/rotate, layers-panel for select/reorder/delete. The canvas is not the *only* way to do anything.
- Selection announced (live region: "orbit selected, x 20 y 30"). Inspector fields labeled from schema title/description. Focus order: layers → canvas → inspector.

## 13. Microcopy
- "Advanced canvas →" (entry from B1) · "+ Add element" · "Anchor to…" / "Free position" · "Bring forward" / "Send back" · encoding badge "compact" · empty: "Add an element to begin." · B2→B1 block: "This scene is custom — edit it here in Advanced."

## 14. Non-negotiables
1. **Lossless B1→B2** (preset → editable elements, nothing dropped).
2. **Same model, same output** — B2 feeds the same scene → preview → encoding → publish; no parallel format.
3. **Undo/redo** + **keyboard parity** (canvas is not the only path).
4. **Graceful preview** always (loading/error/invalid-bind never break the canvas).
5. **Anchoring holds** — anchored children stay placed as parents move/resize (the README's octocat-in-orbit case).
6. **Theme stays fixed/WYSIWYG** (§3) — B2 doesn't reintroduce per-mode theme overrides.
