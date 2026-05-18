// Brand marks for the platforms the compound cards present data from.
// Both icons sit at the geometric center of the icosahedron in the
// orbit visual — the rotating wireframe spins around a fixed brand mark
// like a cage around a core. Inlined so the SVG has no external fetches
// (camo strips <script> AND can't load cross-origin <use>).

// GitHub octocat (the "mark-github" octicon). Native viewBox is 16x16.
// Single path — fits the camo passthrough constraints exactly.
export const GITHUB_PATH =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.41.68 1.2 2.69.83 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";
export const GITHUB_VB = 16;

// Nitrotype's stylized "N" mark — pulled verbatim from their public
// safari-pinned-tab.svg. Native viewBox is 260x260.
export const NITROTYPE_PATH =
  "M1.8 32.2C8.4 43 18 59.3 18 59.8c0 .3.6 1.3 1.4 2.1.8.9 2.4 3.3 3.5 5.5 3 5.3 20.8 35.3 23.7 39.8 1.3 2.1 2.4 4.3 2.4 5 0 .7-2 11.6-4.5 24.3-2.5 12.6-4.8 24.6-5.1 26.5-.3 1.9-1 5.5-1.6 8-.5 2.5-1.2 5.6-1.4 7-.3 1.4-1.1 6-2 10.3-.8 4.2-1.8 9-2 10.5-.3 1.5-1.4 7.2-2.5 12.7-1.1 5.5-2.2 11.1-2.5 12.5-.2 1.4-.7 3.5-.9 4.8L26 231l96.2-.2 96.3-.3 1.6-8c.9-4.4 2.4-11.6 3.4-16 .9-4.4 3.9-18.8 6.6-32 2.8-13.2 5.5-26.3 6-29 .6-2.8 1.3-5.9 1.5-7 .2-1.1.8-4 1.4-6.5.9-4.1 10.2-49.1 11.4-55 .2-1.4 2.5-12.3 5-24.4 2.5-12 4.6-22.2 4.6-22.7s-55.5-.9-130.1-.9H-.2l2 3.2zm141.1 60.1c20 33 19.2 32.1 20.5 22.2.2-1.7 1.2-6.4 2-10.5.9-4.1 2.3-10.9 3-15 2.7-14.7 5-25.5 5.8-26.6 1-1.4 42.4-1.3 42.2.1-.4 2.1-6.8 35.1-12.9 66-3.4 17.6-7.7 39.5-9.5 48.7-2.9 14.9-3.5 16.7-5.4 17-1.1.2-9.3.3-18.1.3l-16-.1-8.3-13.4c-4.5-7.4-8.8-14.5-9.5-15.8-3.8-6.9-19.2-32-19.5-31.7-.3.3-3.8 16.5-4.8 22-.8 5.2-5.4 28.8-6.5 33.7-.6 2.5-1.6 4.8-2.2 5-1.7.6-40.5.3-41.1-.3-.2-.2.7-6 2-12.9 1.4-6.9 2.7-13.6 2.9-15 .2-1.4 3.8-19.4 7.9-40 4.1-20.6 8.4-42.7 9.6-49 3.4-17.6.9-15.7 21.6-15.6l17.7.1 18.6 30.8z";
export const NITROTYPE_VB = 260;

/**
 * Emit a centered, scaled brand icon at (cx, cy) of the embedding SVG.
 * The icon is rendered behind the icosahedron in the compound cards so
 * the wireframe rotates over it. A subtle <animate> pulses opacity for
 * life without competing with the spinning geometry.
 */
export function brandIconAt(opts: {
  cx: number;
  cy: number;
  size: number;
  pathD: string;
  pathViewBox: number;
  fill: string;
  opacity?: number;
  ariaLabel?: string;
}): string {
  const { cx, cy, size, pathD, pathViewBox, fill, opacity = 0.55 } = opts;
  // Translate so that the icon's center lands at (cx, cy), then scale
  // the path's native viewBox down to `size`. The path is centered on
  // the viewBox midpoint by construction (both source icons are).
  const scale = size / pathViewBox;
  const tx = cx - size / 2;
  const ty = cy - size / 2;
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})" opacity="${opacity}">
    <path d="${pathD}" fill="${fill}">
      <animate attributeName="opacity" values="${(opacity * 0.7).toFixed(2)};${opacity.toFixed(2)};${(opacity * 0.7).toFixed(2)}" dur="6s" repeatCount="indefinite"/>
    </path>
  </g>`;
}
