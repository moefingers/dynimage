// Cover layout — shared geometry for the orbit cards' `?layout=cover`.
//
// A cover is a 4:1 profile-header banner (LinkedIn's canonical shape).
// The profile page lays its own chrome over it, measured on LinkedIn
// (2026-11-14) and given here in the design space (COVER_W × COVER_H):
//
//   - the profile photo: a circle centered at (186, 249), radius ~143
//     with its white ring. Nothing goes in it; the band above it
//     (y < ~100, x 40–335) is free and holds the name.
//   - the slide selector (carousel dots): x 794–1107, y 202–259. No
//     content row may reach past x ~780 below y ~195.
//   - the edit pencil (owner only): x 1035–1092, y 34–90.
//
// The SVG's width/height carry the requested pixel size and the viewBox
// stays in design units, so the layout renders crisply at any multiple
// (1128x282, 4512x1128, ...). Another aspect is cropped to fit (slice).

export const COVER_W = 1128;
export const COVER_H = 282;
export const COVER_DEFAULT_SIZE = { width: COVER_W, height: COVER_H } as const;

export type CoverLayout = {
  vw: number;
  vh: number;
  // The sphere: center and scale applied to the card's native
  // 130-unit sphere (built around 0,0 and placed with sphereGroup).
  sphere: { cx: number; cy: number; scale: number };
  // Background glow center and radius (user space).
  glow: { cx: number; cy: number; r: number };
  // The band above the profile photo: name, then one muted line.
  top: {
    x: number;
    nameY: number;
    nameSize: number;
    subY: number;
    subSize: number;
  };
  // The stat column right of the sphere.
  x0: number;
  head: { y: number; size: number };
  label: { y: number; size: number };
};

export function coverLayout(): CoverLayout {
  const vw = COVER_W;
  const vh = COVER_H;
  return {
    vw,
    vh,
    sphere: { cx: 480, cy: 141, scale: 0.78 },
    glow: { cx: 700, cy: 141, r: 640 },
    top: { x: 44, nameY: 56, nameSize: 30, subY: 82, subSize: 14 },
    x0: 630,
    head: { y: 154, size: 120 },
    // Above the slide selector's top edge (y 202).
    label: { y: 186, size: 15 },
  };
}

// Width of a monospace run at `size` (0.6em advance, as the orbit
// cards already assume for ui-monospace; Consolas runs a little
// narrower, so this errs wide).
export function monoWidth(text: string, size: number): number {
  return text.length * size * 0.6;
}

// Wraps sphere/icosa/icon markup built around (0,0) at native scale.
export function sphereGroup(L: CoverLayout, inner: string): string {
  const { cx, cy, scale } = L.sphere;
  return `<g transform="translate(${cx} ${cy}) scale(${scale})">${inner}</g>`;
}

// Opening <svg> for a cover: fixed design space, requested pixel size.
export function coverSvgOpen(
  L: CoverLayout,
  width: number,
  height: number,
  ariaLabel: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${L.vw} ${L.vh}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${ariaLabel}">`;
}
