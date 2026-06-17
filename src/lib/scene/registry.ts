import type { AnyElement } from "./types";
import { frameElement } from "./elements/frame";
import { textElement } from "./elements/text";
import { logoElement } from "./elements/logo";
import { statElement } from "./elements/stat";
import { orbitElement } from "./elements/orbit";
import { latticeElement } from "./elements/lattice";
import { tileGridElement } from "./elements/tile-grid";

// ─────────────────────────────────────────────────────────────────────
// Element registry — the same self-registering pattern as the card
// registries (registry-all.ts / registry-edge.ts). Adding an element is
// one import + one line here; everything downstream (render, /api/meta)
// reads from this map.
//
// §50 starter element set: frame, text/wordmark, logo, data-bound stat,
// orbit (sphere/icosa, neon|prism treatments), lattice background,
// tile-grid. Enough to compose the three flagship presets.
// ─────────────────────────────────────────────────────────────────────
const ELEMENTS = {
  frame: frameElement,
  text: textElement,
  logo: logoElement,
  stat: statElement,
  orbit: orbitElement,
  lattice: latticeElement,
  "tile-grid": tileGridElement,
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
