import { z } from "zod";
import type { Element } from "../types";
import { themeColor } from "../svg";

// frame — a rounded-rect panel with optional border and radial wash. This
// is the decomposition of the rounded-rect background every current card
// draws. It's the canonical PARENT for anchoring demos: children anchor to
// its `center` (geometric) slot and stay placed as it resizes.
const Knobs = z.object({
  radius: z.coerce.number().min(0).max(200).optional().default(14),
  fill: z.string().max(20).optional().default("bg"),
  stroke: z.string().max(20).optional().default("stroke"),
  // Radial wash from theme.gradient → fill, like the commits/orbit bg.
  wash: z.coerce.boolean().optional().default(false),
});
type Knobs = z.infer<typeof Knobs>;

export const frameElement: Element<Knobs> = {
  type: "frame",
  runtime: "edge",
  defaultSize: { width: 480, height: 200 },
  knobs: Knobs,
  bind: { accepts: "none" },
  meta: {
    title: "Frame",
    description:
      "Rounded-rect panel with optional border and radial wash. The base layer / anchor parent for a scene.",
    supportsAnimation: false,
  },
  render: ({ knobs, theme, box }) => {
    const { w, h } = box;
    const fill = themeColor(theme, knobs.fill, "bg");
    const stroke = themeColor(theme, knobs.stroke, "stroke");
    const r = Math.min(knobs.radius, w / 2, h / 2);
    const gradId = "wash"; // namespaced by the scene renderer per element
    const defs = knobs.wash
      ? `<defs><radialGradient id="${gradId}" cx="50%" cy="50%" r="75%">` +
        `<stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.55"/>` +
        `<stop offset="100%" stop-color="${fill}" stop-opacity="1"/>` +
        `</radialGradient></defs>`
      : "";
    const bg = knobs.wash ? `url(#${gradId})` : fill;
    return (
      defs +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${bg}" stroke="${stroke}" stroke-width="1"/>`
    );
  },
};
