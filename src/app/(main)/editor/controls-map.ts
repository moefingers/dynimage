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

// B1 shows only Text/Color/Animation (editor-b1-ux-spec §3). B2's inspector
// (advanced=true) also surfaces "Style" — the structural/fine-tune knobs B1
// hides (points, radius, scale, durations, icosa/verts/rim, opacities).
export type ControlGroup = "Text" | "Color" | "Animation" | "Style";

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

// Map a knob's schema to a control. In BASIC (advanced=false) the structural
// knobs return null (B1 hides them); in ADVANCED (B2 inspector) they map to
// the "Style"/"Animation" groups. Returns null only for truly unsupported
// shapes (arrays/objects) and the transform keys (handled by Transform).
export function controlFor(
  key: string,
  schema: JsonSchema,
  advanced = false,
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
    if (!advanced) return null; // other enums hidden in basic
    return {
      key,
      kind: opts.length <= 4 ? "segmented" : "select",
      label,
      help,
      group: "Style",
      options: opts,
    };
  }

  if (t === "boolean") {
    const motion = /^(breathe|countUp|wash|hueRotate|shimmer|pulse|glow)$/.test(
      key,
    );
    if (motion) return { key, kind: "toggle", label, help, group: "Animation" };
    if (!advanced) return null;
    return { key, kind: "toggle", label, help, group: "Style" };
  }

  if (t === "number" || t === "integer") {
    if (key !== "size" && !advanced) return null;
    const min = schema.minimum ?? schema.exclusiveMinimum;
    const max = schema.maximum ?? schema.exclusiveMaximum;
    const step = schema.multipleOf ?? (t === "integer" ? 1 : undefined);
    const hasRange = typeof min === "number" && typeof max === "number";
    const motion = /dur|speed|delay/i.test(key);
    return {
      key,
      kind: hasRange ? "slider" : "stepper",
      label,
      help,
      group: key === "size" ? "Text" : motion ? "Animation" : "Style",
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

  // Unknown / unsupported (arrays, objects like tile-grid.tiles).
  return null;
}

export const GROUP_ORDER: ControlGroup[] = [
  "Text",
  "Color",
  "Animation",
  "Style",
];
