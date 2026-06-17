import type { JsonSchema } from "./meta-types";

// ─────────────────────────────────────────────────────────────────────
// The meta-driven control mapping — design's knob-type → control table
// (editor-b1-ux-spec §3). Pure function from a knob's JSON-Schema (+ key)
// to a ControlSpec the form renders. NO hardcoded card/element names: the
// decision is by schema shape + a few conventional key names (color/fill).
// ─────────────────────────────────────────────────────────────────────

export type ControlKind =
  | "text"
  | "segmented"
  | "select"
  | "color"
  | "slider"
  | "stepper"
  | "toggle"
  | "treatment";

// Basic-tier groups only (editor-b1-ux-spec §3: "basic shows only these").
// Subject + Theme are owned by the Editor shell. Structural / fine-tune
// knobs (points, radius, per-element scale, durations, icosa/verts/rim,
// raw opacities) are ADVANCED → hidden in B1, surfaced in B2's canvas.
export type ControlGroup = "Text" | "Color" | "Animation";

export type ControlSpec = {
  key: string;
  kind: ControlKind;
  label: string;
  help?: string;
  group: ControlGroup;
  // enum / segmented / select / treatment
  options?: string[];
  // number controls
  min?: number;
  max?: number;
  step?: number;
  // text
  maxLength?: number;
};

// Knobs that are B2 (advanced canvas) — never shown in basic tier.
const HIDDEN_KEYS = new Set(["x", "y", "w", "h", "z", "rotate"]);

const COLOR_KEYS = new Set(["color", "fill", "stroke", "accent", "labelColor"]);
const HEX_RE = /\[0-9a-fA-F\]\{6\}|#\?\[0-9a-f/i;

function titleCase(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function enumOptions(s: JsonSchema): string[] | null {
  if (Array.isArray(s.enum)) return s.enum.map(String);
  // zod enums sometimes serialize as anyOf:[{const:…}] or type+enum.
  if (Array.isArray(s.anyOf)) {
    const consts = s.anyOf
      .map((a) => (a && "const" in a ? a.const : undefined))
      .filter((v) => v !== undefined);
    if (consts.length) return consts.map(String);
  }
  return null;
}

function schemaType(s: JsonSchema): string | undefined {
  return Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
}

function isColor(key: string, s: JsonSchema): boolean {
  if (COLOR_KEYS.has(key)) return true;
  if (typeof s.pattern === "string" && HEX_RE.test(s.pattern)) return true;
  return false;
}

// Returns null for knobs that should NOT appear in the basic-tier form.
export function controlFor(
  key: string,
  schema: JsonSchema,
): ControlSpec | null {
  if (HIDDEN_KEYS.has(key)) return null;

  const label = schema.title ?? titleCase(key);
  const help = schema.description;
  const t = schemaType(schema);
  const opts = enumOptions(schema);

  // Color: hex string knob → swatch + hex.
  if (t === "string" && isColor(key, schema)) {
    return { key, kind: "color", label, help, group: "Color" };
  }

  // Enum → treatment (curated palette) / segmented (≤4) / select (>4).
  // Basic tier exposes treatment (Animation) + text align/weight (Text);
  // other enums (e.g. logo icon) are preset-defined / advanced.
  if (opts) {
    if (key === "treatment") {
      return {
        key,
        kind: "treatment",
        label,
        help,
        group: "Animation",
        options: opts,
      };
    }
    if (key === "align" || key === "weight") {
      return {
        key,
        kind: opts.length <= 4 ? "segmented" : "select",
        label,
        help,
        group: "Text",
        options: opts,
      };
    }
    return null; // advanced enum
  }

  if (t === "boolean") {
    // Named motion toggles are basic (Animation); structural toggles
    // (icosa/verts/rim/softenCenter/mono) are advanced.
    const motion = /^(breathe|countUp|wash|hueRotate|shimmer|pulse|glow)$/.test(
      key,
    );
    return motion
      ? { key, kind: "toggle", label, help, group: "Animation" }
      : null;
  }

  if (t === "number" || t === "integer") {
    // Only the text `size` is basic; structural numbers (points, radius,
    // scale, durations, opacities, gap) are advanced.
    if (key !== "size") return null;
    const min = schema.minimum ?? schema.exclusiveMinimum;
    const max = schema.maximum ?? schema.exclusiveMaximum;
    const step = schema.multipleOf ?? (t === "integer" ? 1 : undefined);
    const hasRange = typeof min === "number" && typeof max === "number";
    return {
      key,
      kind: hasRange ? "slider" : "stepper",
      label,
      help,
      group: "Text",
      min: typeof min === "number" ? min : undefined,
      max: typeof max === "number" ? max : undefined,
      step,
    };
  }

  if (t === "string") {
    return {
      key,
      kind: "text",
      label,
      help,
      group: "Text",
      maxLength: schema.maxLength,
    };
  }

  // Unknown / unsupported (arrays, objects like tile-grid.tiles) — omit from
  // the basic form (B2 / preset-defined).
  return null;
}

export const GROUP_ORDER: ControlGroup[] = ["Text", "Color", "Animation"];
