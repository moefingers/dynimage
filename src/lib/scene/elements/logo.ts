import { z } from "zod";
import type { Element } from "../types";
import {
  GITHUB_PATH,
  GITHUB_VB,
  NITROTYPE_PATH,
  NITROTYPE_VB,
} from "@/lib/cards/brand-icons";
import { themeColor } from "../svg";

// logo — a centered brand mark from the curated built-in set (no
// arbitrary external fetch; §10). Decomposition of brand-icons.ts usage in
// the orbit cards. Sits centered in its local box, so anchoring it to a
// parent's `center` slot drops it exactly at that center.
const ICONS = {
  github: { path: GITHUB_PATH, vb: GITHUB_VB },
  nitrotype: { path: NITROTYPE_PATH, vb: NITROTYPE_VB },
} as const;

const Knobs = z.object({
  icon: z.enum(["github", "nitrotype"]).default("github"),
  fill: z.string().max(20).optional().default("accent"),
  // Icon diameter as a fraction of the box's shorter side.
  scale: z.coerce.number().min(0.1).max(1).optional().default(0.8),
  // Slow opacity "breath" (live SVG only). Off => steady at peak opacity.
  breathe: z.coerce.boolean().optional().default(false),
  peakOpacity: z.coerce.number().min(0).max(1).optional().default(0.85),
  dimOpacity: z.coerce.number().min(0).max(1).optional().default(0.18),
  dur: z.coerce.number().min(0.5).max(30).optional().default(5.4),
});
type Knobs = z.infer<typeof Knobs>;

export const logoElement: Element<Knobs> = {
  type: "logo",
  runtime: "edge",
  defaultSize: { width: 96, height: 96 },
  knobs: Knobs,
  bind: { accepts: "none" },
  meta: {
    title: "Logo / brand mark",
    description:
      "Centered brand mark (GitHub octocat, Nitrotype N) from the curated built-in set. Optional slow opacity breath.",
    supportsAnimation: true,
  },
  render: ({ knobs, theme, box, raster }) => {
    const { w, h } = box;
    const fill = themeColor(theme, knobs.fill, "accent");
    const { path, vb } = ICONS[knobs.icon];
    const size = Math.min(w, h) * knobs.scale;
    const sc = size / vb;
    const tx = w / 2 - size / 2;
    const ty = h / 2 - size / 2;
    const animate =
      knobs.breathe && !raster
        ? `<animate attributeName="opacity" values="${knobs.dimOpacity.toFixed(2)};${knobs.peakOpacity.toFixed(2)};${knobs.dimOpacity.toFixed(2)}" ` +
          `keyTimes="0;0.5;1" calcMode="spline" keySplines="0.42 0 0.58 1; 0.42 0 0.58 1" dur="${knobs.dur}s" repeatCount="indefinite"/>`
        : "";
    return (
      `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${sc.toFixed(5)})">` +
      `<path d="${path}" fill="${fill}" opacity="${knobs.peakOpacity}">${animate}</path>` +
      `</g>`
    );
  },
};
