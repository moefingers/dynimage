// Minimal helpers for assembling SVG strings safely.
// We hand-template rather than use a DOM lib because SVG output is
// hot-path code and the template is small enough to read directly.

// Conservative entity escape for text content inserted into SVG.
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Format a large integer with thousands separators (locale-neutral).
export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}

// Rounded card frame, shared by every card: cardFrameOpen right after
// </defs>, the card's content, then cardFrameClose just before </svg>.
//
// Content is clipped to the rounded rect, so sheens, lattices and glows
// can't paint into the corner areas outside the border.
//
// The border is drawn inset by half its stroke width, on top of the
// content. A stroke is centered on its path: on a rect flush with the
// SVG edge, the outer half is cut off by the viewport along the straight
// sides but not around the corners (they curve inward), so the corners
// read thicker and brighter than the edges.
//
// The clip id carries the card's size because compound nests several
// cards in one document: a same-named clip from a different-size card
// would clip this one to the wrong rect.
export function cardFrameOpen(
  idPrefix: string,
  width: number,
  height: number,
  radius: number,
  fill: string,
): string {
  const id = `${idPrefix}Frame-${width}x${height}`;
  return `<clipPath id="${id}"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}"/></clipPath>
  <g clip-path="url(#${id})">
  <rect width="${width}" height="${height}" fill="${fill}"/>`;
}

export function cardFrameClose(
  width: number,
  height: number,
  radius: number,
  stroke: string,
  strokeWidth = 1,
): string {
  const inset = strokeWidth / 2;
  return `</g>
  <rect x="${inset}" y="${inset}" width="${width - strokeWidth}" height="${height - strokeWidth}" rx="${radius - inset}" ry="${radius - inset}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}
