import { z } from "zod";
import type { Element } from "../types";
import { esc, fontStack, themeColor } from "../svg";

// text — a static text/wordmark element. Decomposition of the `text`
// card. Draws centered within its local box by default.
const Knobs = z.object({
  text: z.string().min(1).max(200),
  size: z.coerce.number().int().min(8).max(200).optional().default(32),
  weight: z.enum(["normal", "medium", "bold"]).optional().default("bold"),
  align: z.enum(["left", "center", "right"]).optional().default("center"),
  color: z.string().max(20).optional().default("text"),
});
type Knobs = z.infer<typeof Knobs>;

const WEIGHT = { normal: 400, medium: 500, bold: 700 } as const;

export const textElement: Element<Knobs> = {
  type: "text",
  runtime: "edge",
  defaultSize: { width: 320, height: 80 },
  knobs: Knobs,
  bind: { accepts: "none" },
  meta: {
    title: "Text / wordmark",
    description: "Static text label — title, wordmark, section header.",
    supportsAnimation: false,
  },
  render: ({ knobs, theme, box, raster }) => {
    const { w, h } = box;
    const x = knobs.align === "left" ? 0 : knobs.align === "right" ? w : w / 2;
    const anchor =
      knobs.align === "left"
        ? "start"
        : knobs.align === "right"
          ? "end"
          : "middle";
    const fill = themeColor(theme, knobs.color, "text");
    return (
      `<text x="${x}" y="${h / 2}" text-anchor="${anchor}" dominant-baseline="middle" ` +
      `font-family='${fontStack(raster)}' font-size="${knobs.size}" font-weight="${WEIGHT[knobs.weight]}" ` +
      `fill="${fill}">${esc(knobs.text)}</text>`
    );
  },
};
