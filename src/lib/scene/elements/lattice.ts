import { z } from "zod";
import type { Element } from "../types";
import {
  SYNDICATE_LATTICE_PATH_A,
  SYNDICATE_LATTICE_PATH_B,
  SYNDICATE_LATTICE_VB,
  SYNDICATE_TEAL,
} from "@/lib/cards/syndicate-lattice";

// lattice — the brand sacred-geometry background: two counter-rotating,
// counter-breathing layers of intersecting circles with a slow hue-rotate.
// Decomposition of the syndicate/recanon lattice. Drawn centered in its
// box and scaled to overfill so the geometry reads as infinite.
//
// Critical nesting preserved from the source: animateTransform (rotate +
// scale, additive="sum") sit on an OUTER <g>; the path is wrapped in an
// INNER <g translate(-150 -150)> that re-centers its native (150,150)
// origin BEFORE animation — otherwise the rotate drags the lattice off
// center each frame. (See syndicate.tsx for the full rationale.)
const Knobs = z.object({
  stroke: z.string().max(20).optional().default(SYNDICATE_TEAL),
  opacity: z.coerce.number().min(0).max(1).optional().default(0.85),
  hueRotate: z.coerce.boolean().optional().default(true),
  // Soften the center so overlaid text stays legible (radial mask).
  softenCenter: z.coerce.boolean().optional().default(true),
  durA: z.coerce.number().min(10).max(600).optional().default(120),
  durB: z.coerce.number().min(10).max(600).optional().default(160),
  breatheDur: z.coerce.number().min(2).max(60).optional().default(14),
});
type Knobs = z.infer<typeof Knobs>;

export const latticeElement: Element<Knobs> = {
  type: "lattice",
  runtime: "edge",
  defaultSize: { width: 900, height: 320 },
  knobs: Knobs,
  bind: { accepts: "none" },
  meta: {
    title: "Lattice background",
    description:
      "Two counter-rotating, counter-breathing layers of intersecting circles (brand sacred-geometry) with a slow hue-rotate. A background treatment.",
    supportsAnimation: true,
  },
  render: ({ knobs, box, raster }) => {
    const { w, h } = box;
    const cx = w / 2;
    const cy = h / 2;
    const size = Math.max(h * 1.6, w * 0.6, 500);
    const scale = size / SYNDICATE_LATTICE_VB;
    const outerTx = `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${scale.toFixed(4)})`;

    const gradA =
      `<radialGradient id="latGradA" cx="50%" cy="50%" r="50%">` +
      `<stop offset="16%" stop-color="${knobs.stroke}" stop-opacity="0"/>` +
      `<stop offset="35%" stop-color="${knobs.stroke}" stop-opacity="0.55"/>` +
      `<stop offset="100%" stop-color="#808080" stop-opacity="0.95"/></radialGradient>`;
    const gradB =
      `<radialGradient id="latGradB" cx="50%" cy="50%" r="50%">` +
      `<stop offset="2%" stop-color="#6f6f6f" stop-opacity="0"/>` +
      `<stop offset="35%" stop-color="#6f6f6f" stop-opacity="0.45"/>` +
      `<stop offset="100%" stop-color="#808080" stop-opacity="0.85"/></radialGradient>`;

    const mask = knobs.softenCenter
      ? `<radialGradient id="latMaskGrad" cx="50%" cy="34%" r="55%">` +
        `<stop offset="0%" stop-color="#fff" stop-opacity="0.5"/>` +
        `<stop offset="35%" stop-color="#fff" stop-opacity="0.6"/>` +
        `<stop offset="55%" stop-color="#fff" stop-opacity="0.92"/>` +
        `<stop offset="100%" stop-color="#fff" stop-opacity="1"/></radialGradient>` +
        `<mask id="latMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}">` +
        `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#latMaskGrad)"/></mask>`
      : "";

    // Animations dropped under raster (sharp renders the first frame).
    const animA = raster
      ? ""
      : `<animateTransform attributeName="transform" type="rotate" values="0;360" dur="${knobs.durA}s" repeatCount="indefinite" additive="sum"/>` +
        `<animateTransform attributeName="transform" type="scale" values="1;0;1" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" dur="${knobs.breatheDur}s" repeatCount="indefinite" additive="sum"/>`;
    const animB = raster
      ? ""
      : `<animateTransform attributeName="transform" type="rotate" values="360;0" dur="${knobs.durB}s" repeatCount="indefinite" additive="sum"/>` +
        `<animateTransform attributeName="transform" type="scale" values="0;1;0" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" dur="${knobs.breatheDur}s" repeatCount="indefinite" additive="sum"/>`;

    const hueClass = knobs.hueRotate && !raster ? ' class="lat-hue"' : "";
    const hueStyle =
      knobs.hueRotate && !raster
        ? `<style>.lat-hue{animation:latHue ${knobs.durA / 5}s linear infinite;transform-origin:center;}@keyframes latHue{0%{filter:hue-rotate(0deg);}100%{filter:hue-rotate(360deg);}}</style>`
        : "";

    const maskAttr = knobs.softenCenter ? ` mask="url(#latMask)"` : "";

    return (
      `<defs>${gradA}${gradB}${mask}${hueStyle}</defs>` +
      `<g${hueClass}${maskAttr} opacity="${knobs.opacity}">` +
      `<g transform="${outerTx}">` +
      `<g><g transform="translate(-150 -150)"><path d="${SYNDICATE_LATTICE_PATH_A}" fill="none" stroke="url(#latGradA)" stroke-width="1.4" stroke-linejoin="round"/></g>${animA}</g>` +
      `<g><g transform="translate(-150 -150)"><path d="${SYNDICATE_LATTICE_PATH_B}" fill="none" stroke="url(#latGradB)" stroke-width="1.4" stroke-linejoin="round"/></g>${animB}</g>` +
      `</g></g>`
    );
  },
};
