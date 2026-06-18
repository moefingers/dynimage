import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { ElementMetaEntry, JsonSchema } from "./meta-types";

// ─────────────────────────────────────────────────────────────────────
// Pure scene mutations for the B2 canvas (advanced tier). Every helper
// returns a NEW Scene (immutable) so React state updates are clean. The
// scene/element model already supports all of this — B2 just exposes it.
// ─────────────────────────────────────────────────────────────────────

function clone(scene: Scene): Scene {
  return structuredClone(scene);
}

function schemaType(s: JsonSchema): string | undefined {
  return Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
}

function enumOptions(s: JsonSchema): unknown[] | null {
  if (Array.isArray(s.enum)) return s.enum;
  if (Array.isArray(s.anyOf)) {
    const consts = s.anyOf
      .map((a) => (a && "const" in a ? a.const : undefined))
      .filter((v) => v !== undefined);
    if (consts.length) return consts;
  }
  return null;
}

// Seed a new element's knobs from its JSON-Schema: use each property's
// `default`, else a minimal valid value for required props so the element
// renders out-of-the-box (an imperfect seed still previews gracefully via
// the probe-img error state). Optional props are left for the element's
// own Zod defaults.
export function defaultKnobs(entry: ElementMetaEntry): Record<string, unknown> {
  const schema = entry.knobsSchema;
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const out: Record<string, unknown> = {};
  for (const [key, p] of Object.entries(props)) {
    if (p.default !== undefined) {
      out[key] = p.default;
      continue;
    }
    if (!required.has(key)) continue; // optional → element's Zod default
    const opts = enumOptions(p);
    if (opts) out[key] = opts[0];
    else {
      switch (schemaType(p)) {
        case "string":
          out[key] = "Text";
          break;
        case "number":
        case "integer":
          out[key] = p.minimum ?? 0;
          break;
        case "boolean":
          out[key] = false;
          break;
        case "array":
          out[key] = [];
          break;
      }
    }
  }
  return out;
}

function maxZ(scene: Scene): number {
  return (scene.elements as ElementSpec[]).reduce(
    (m, e) => Math.max(m, e.transform?.z ?? 0),
    0,
  );
}

function uniqueId(scene: Scene, type: string): string {
  const ids = new Set((scene.elements as ElementSpec[]).map((e) => e.id));
  let n = 1;
  let id = `${type}-${n}`;
  while (ids.has(id)) id = `${type}-${++n}`;
  return id;
}

export function addElement(
  scene: Scene,
  type: string,
  entry: ElementMetaEntry,
): { scene: Scene; id: string } {
  const next = clone(scene);
  const id = uniqueId(next, type);
  const w = Math.min(entry.defaultSize.width, scene.canvas.w);
  const h = Math.min(entry.defaultSize.height, scene.canvas.h);
  (next.elements as ElementSpec[]).push({
    id,
    type,
    transform: {
      x: Math.round((scene.canvas.w - w) / 2),
      y: Math.round((scene.canvas.h - h) / 2),
      w,
      h,
      z: maxZ(scene) + 1,
    },
    knobs: defaultKnobs(entry),
  });
  return { scene: next, id };
}

export function removeElement(scene: Scene, id: string): Scene {
  const next = clone(scene);
  next.elements = (next.elements as ElementSpec[]).filter((e) => e.id !== id);
  // Drop dangling anchors that pointed at the removed element.
  for (const el of next.elements as ElementSpec[]) {
    if (el.anchor?.to === id) delete el.anchor;
  }
  return next;
}

// Move an element earlier/later in the array (paint order for equal z).
export function reorderElement(scene: Scene, id: string, dir: -1 | 1): Scene {
  const next = clone(scene);
  const els = next.elements as ElementSpec[];
  const i = els.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= els.length) return scene;
  [els[i], els[j]] = [els[j]!, els[i]!];
  return next;
}

export function patchTransform(
  scene: Scene,
  id: string,
  patch: Partial<NonNullable<ElementSpec["transform"]>>,
): Scene {
  const next = clone(scene);
  const el = (next.elements as ElementSpec[]).find((e) => e.id === id);
  if (el) el.transform = { ...(el.transform ?? {}), ...patch };
  return next;
}

export function setAnchor(
  scene: Scene,
  id: string,
  anchor: ElementSpec["anchor"] | null,
): Scene {
  const next = clone(scene);
  const el = (next.elements as ElementSpec[]).find((e) => e.id === id);
  if (el) {
    if (anchor) el.anchor = anchor;
    else delete el.anchor;
  }
  return next;
}

export function setBind(
  scene: Scene,
  id: string,
  bind: ElementSpec["bind"] | null,
): Scene {
  const next = clone(scene);
  const el = (next.elements as ElementSpec[]).find((e) => e.id === id);
  if (el) {
    if (bind) el.bind = bind;
    else delete el.bind;
  }
  return next;
}

export function setKnob(
  scene: Scene,
  id: string,
  key: string,
  value: unknown,
): Scene {
  const next = clone(scene);
  const el = (next.elements as ElementSpec[]).find((e) => e.id === id);
  if (el) el.knobs = { ...(el.knobs ?? {}), [key]: value };
  return next;
}

export function setCanvasTheme(scene: Scene, theme: string): Scene {
  const next = clone(scene);
  next.canvas = { ...next.canvas, theme };
  return next;
}
