import type {
  AnyElement,
  Anchor,
  Point,
  ResolvedBox,
  SlotName,
  Transform,
} from "./types";

// ─────────────────────────────────────────────────────────────────────
// Anchoring & slots.
//
// Every element exposes the eight geometric slots below, derived from its
// resolved box. An element MODULE may publish custom slots (e.g. an orbit
// whose visual center is offset from its box center) via `element.slots`;
// those override the geometric default for that name.
//
// An anchored element's CENTER is placed at the parent's named slot, plus
// a pixel nudge (dx, dy). Boxes are resolved in dependency order (parent
// before child); cycles and dangling parents are hard errors.
// ─────────────────────────────────────────────────────────────────────

export function geometricSlotPoint(box: ResolvedBox, slot: SlotName): Point {
  const { x, y, w, h } = box;
  switch (slot) {
    case "center":
      return { x: x + w / 2, y: y + h / 2 };
    case "top":
      return { x: x + w / 2, y };
    case "bottom":
      return { x: x + w / 2, y: y + h };
    case "left":
      return { x, y: y + h / 2 };
    case "right":
      return { x: x + w, y: y + h / 2 };
    case "top-left":
      return { x, y };
    case "top-right":
      return { x: x + w, y };
    case "bottom-left":
      return { x, y: y + h };
    case "bottom-right":
      return { x: x + w, y: y + h };
  }
}

function slotPoint(
  element: AnyElement,
  box: ResolvedBox,
  slot: SlotName,
): Point {
  const custom = element.slots?.[slot];
  return custom ? custom(box) : geometricSlotPoint(box, slot);
}

// An element as seen by the resolver: its id, its module, and the parsed
// transform/anchor from the wire spec.
export type PlacedElement = {
  id: string;
  element: AnyElement;
  transform?: Transform;
  anchor?: Anchor;
};

// Resolve every element's box in scene coordinates. Returns a map keyed by
// element id. Throws on a missing anchor parent or an anchor cycle.
export function resolveBoxes(
  placed: ReadonlyArray<PlacedElement>,
): Map<string, ResolvedBox> {
  const byId = new Map<string, PlacedElement>();
  for (const p of placed) byId.set(p.id, p);

  const resolved = new Map<string, ResolvedBox>();
  const inProgress = new Set<string>();

  const resolveOne = (p: PlacedElement): ResolvedBox => {
    const existing = resolved.get(p.id);
    if (existing) return existing;
    if (inProgress.has(p.id)) {
      throw new Error(`Anchor cycle detected at element "${p.id}".`);
    }
    inProgress.add(p.id);

    const t = p.transform ?? {};
    const w = t.w ?? p.element.defaultSize.width;
    const h = t.h ?? p.element.defaultSize.height;
    const rotate = t.rotate ?? 0;

    let x: number;
    let y: number;
    if (p.anchor) {
      const parent = byId.get(p.anchor.to);
      if (!parent) {
        throw new Error(
          `Element "${p.id}" anchors to unknown element "${p.anchor.to}".`,
        );
      }
      const parentBox = resolveOne(parent);
      const point = slotPoint(parent.element, parentBox, p.anchor.slot);
      // Center the child on the slot point, then apply the pixel nudge.
      x = point.x - w / 2 + (p.anchor.dx ?? 0);
      y = point.y - h / 2 + (p.anchor.dy ?? 0);
    } else {
      x = t.x ?? 0;
      y = t.y ?? 0;
    }

    const box: ResolvedBox = { x, y, w, h, rotate };
    inProgress.delete(p.id);
    resolved.set(p.id, box);
    return box;
  };

  for (const p of placed) resolveOne(p);
  return resolved;
}
