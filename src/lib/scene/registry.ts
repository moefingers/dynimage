import type { AnyElement } from "./types";
import { frameElement } from "./elements/frame";
import { textElement } from "./elements/text";
import { logoElement } from "./elements/logo";
import { statElement } from "./elements/stat";

// ─────────────────────────────────────────────────────────────────────
// Element registry — the same self-registering pattern as the card
// registries (registry-all.ts / registry-edge.ts). Adding an element is
// one import + one line here; everything downstream (render, /api/meta)
// reads from this map.
//
// Reference set for the CONTRACT PR: frame, text, logo, stat — enough to
// prove static + anchored + data-bound rendering end-to-end. The full
// §50 starter set (orbit/sphere/icosa, prism, lattice, tile-grid) is
// decomposed from the flagship cards in the follow-up phase.
// ─────────────────────────────────────────────────────────────────────
const ELEMENTS = {
  frame: frameElement,
  text: textElement,
  logo: logoElement,
  stat: statElement,
} as const;

export type ElementType = keyof typeof ELEMENTS;

export function getElement(type: string): AnyElement | null {
  if (type in ELEMENTS) {
    return ELEMENTS[type as ElementType] as unknown as AnyElement;
  }
  return null;
}

export function allElements(): ReadonlyArray<AnyElement> {
  return Object.values(ELEMENTS) as unknown as AnyElement[];
}
