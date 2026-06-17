import type { z } from "zod";
import type { DedupeCache } from "@/lib/data/cache";
import type { Theme, CardFormat } from "@/lib/cards/types";

// ─────────────────────────────────────────────────────────────────────
// Scene / Element model — the keystone contract.
//
// This GENERALIZES today's `Card` (see cards/types.ts) into a finer
// grain: a Scene is a z-ordered list of composable, individually-tunable,
// optionally data-bound Elements. It is EVOLUTION, not rewrite —
//   • same self-registering module pattern (registry.ts)
//   • same Zod-schema-as-spec pattern (an element's `knobs` schema is the
//     single source of truth for its tunable params, just like a card's
//     `input` schema)
//   • same /api/meta introspection (elements serialize their knob schema
//     to JSON-Schema for the editor)
//
// Today's rich cards (commits-orbit, syndicate, …) become PRESETS: named
// bundles of {elements + knobs}. This file defines the contract those
// presets, the editor, the encoding codec, and the renderer all build on.
// ─────────────────────────────────────────────────────────────────────

// Render formats carry over verbatim from the card system.
export type { CardFormat } from "@/lib/cards/types";
export type { Theme } from "@/lib/cards/types";

// ── Subject — a typed entity reference ───────────────────────────────
// The (provider, subject, metric) model absorbs user / org / repo. A
// bound element points at a Subject; the bind layer resolves it to a
// value. `repo` was already a declared CardDimension.
export type SubjectKind = "user" | "org" | "repo";

export type Subject = {
  kind: SubjectKind;
  // The provider-native id: a GitHub login, an org slug, "owner/name" for
  // a repo, a Nitrotype username, etc. Validation of the shape lives with
  // each provider's metric definitions, not here.
  id: string;
};

// ── Bind — unifies graphics and stats ────────────────────────────────
// An element is either static, or BOUND to a data source. "Stats" is just
// a bound element: a count-up stat binds to `github:commits-last-year`,
// a wordmark is static. `literal` carries its value inline so the editor
// can preview precomputed numbers without an upstream fetch.
export type Bind =
  | { provider: "literal"; value: string }
  | { provider: string; subject: Subject; metric: string };

// The value a bind resolves to, handed to the element renderer. `value`
// is the typed datum (number for counters, string for labels); `display`
// is a presentation-ready string (thousands-separated, etc.).
export type BoundValue = {
  value: number | string;
  display: string;
};

// One row of the provider catalogue: a single bindable metric. This same
// structure powers (a) bind resolution at render time and (b) the
// metric ↔ subject-kind compatibility matrix surfaced via /api/meta, so
// the editor never offers nonsense (e.g. a user-only metric on a repo).
export type MetricDef = {
  provider: string;
  metric: string;
  label: string;
  // The compatibility matrix: which subject kinds this metric accepts.
  subjectKinds: ReadonlyArray<SubjectKind>;
  valueType: "number" | "string";
  // Resolve the metric for a subject. MUST call the EXISTING data atoms
  // (data/atoms.ts, data/nitrotype.ts) — the bind layer is a thin seam
  // over them and never reimplements fetching.
  resolve: (subject: Subject, cache: DedupeCache) => Promise<BoundValue>;
};

// ── Transform & anchoring ────────────────────────────────────────────
// A transform is the element's box in scene coordinates. All fields are
// optional in the wire format and defaulted at resolve time (an element
// with no transform falls back to its module `defaultSize`, placed at the
// canvas origin).
export type Transform = {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  z?: number;
  rotate?: number;
};

// Named anchor points. Every element exposes the geometric defaults below
// derived from its box; an element MODULE may also publish custom slots
// (e.g. an orbit whose visual center is offset from its box center).
export type SlotName =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

// A positional RELATIONSHIP: this element's center is placed at the
// parent's named slot, plus an optional pixel nudge (dx, dy). This is what
// keeps the octocat at the orbit's center as the orbit resizes — the
// child stays placed relative to the parent, not pinned to absolute X/Y.
export type Anchor = {
  to: string; // parent element id
  slot: SlotName;
  dx?: number;
  dy?: number;
};

// A fully-resolved box in scene coordinates (post transform + anchor).
export type ResolvedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
};

// A point in scene coordinates (a resolved slot).
export type Point = { x: number; y: number };

// ── Element module — generalization of `Card` ────────────────────────
// What a card was to a stat, an element is to a single composable visual.
// `knobs` is the Zod single-source-of-truth (cf. Card.input). `render`
// emits an SVG FRAGMENT in the element's LOCAL coordinate space (0,0 →
// w,h); the scene renderer positions it (nested <svg> + optional rotate)
// and rasterizes the whole scene once for png/webp/avif. This is why an
// element has ONE `render` rather than a per-format map: composition is
// SVG-fragment based (matching today's compound SVG path), and raster is
// a single scene-level step (matching how `streak` rasterizes its SVG).
export type ElementContext<TKnobs> = {
  knobs: TKnobs;
  theme: Theme;
  box: ResolvedBox;
  // Resolved bind value, or null for a static element / unbound render.
  bound: BoundValue | null;
  baseUrl: string;
  // Whether the fragment will be rasterized (png/webp/avif) rather than
  // served as live SVG. Elements use this to drop SMIL animation and
  // embed fonts for server-side rasterization (cf. streak's embedFont).
  raster: boolean;
};

// An element renders to an SVG fragment string in LOCAL coords.
export type ElementRenderer<TKnobs> = (
  ctx: ElementContext<TKnobs>,
) => string | Promise<string>;

// What kind of bind (if any) an element accepts — drives editor wiring
// and validation. `none` = purely static; `value` = accepts any bound
// metric of the given value type.
export type BindAffinity = {
  accepts: "none" | "value";
  valueType?: "number" | "string";
};

export type ElementMeta = {
  title: string;
  description: string;
  supportsAnimation: boolean;
};

export type Element<TKnobs = unknown> = {
  type: string;
  runtime: "edge" | "nodejs";
  defaultSize: { width: number; height: number };
  // Single source of truth for this element's tunable knobs.
  knobs: z.ZodType<TKnobs>;
  // Whether/how this element consumes a data bind.
  bind: BindAffinity;
  // Custom named slots beyond the geometric defaults. Maps a slot name to
  // a function of the element's resolved box → a point. Optional.
  slots?: Partial<Record<SlotName, (box: ResolvedBox) => Point>>;
  render: ElementRenderer<TKnobs>;
  meta: ElementMeta;
};

// Convenience alias for module exports / registry erasure at the boundary.
export type AnyElement = Element<unknown>;

// A rendered scene, ready for an HTTP response (mirrors RenderedCard).
export type RenderedScene = {
  body: string | Uint8Array;
  contentType: string;
};

// Re-export so scene consumers don't reach back into cards/types.
export type RenderSceneFormat = CardFormat;
