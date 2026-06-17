import { z } from "zod";
import type { Element } from "../types";
import { esc, fmtInt, fontStack, monoStack, themeColor } from "../svg";

// stat — a data-bound number with an optional label. THIS is how the model
// unifies graphics and stats: a "stat" is just an element with a numeric
// `bind`. Decomposition of the count-up headline in commits/commits-orbit.
// The value comes from ctx.bound (resolved by the bind layer); the element
// only knows how to display a number.
const Knobs = z.object({
  label: z.string().max(60).optional(),
  size: z.coerce.number().int().min(12).max(240).optional().default(64),
  color: z.string().max(20).optional().default("accent"),
  labelColor: z.string().max(20).optional().default("muted"),
  align: z.enum(["left", "center", "right"]).optional().default("left"),
  mono: z.coerce.boolean().optional().default(false),
  // Animated count-up 0 → value (live SVG only; raster shows final value).
  countUp: z.coerce.boolean().optional().default(true),
});
type Knobs = z.infer<typeof Knobs>;

export const statElement: Element<Knobs> = {
  type: "stat",
  runtime: "edge",
  defaultSize: { width: 360, height: 120 },
  knobs: Knobs,
  bind: { accepts: "value", valueType: "number" },
  meta: {
    title: "Stat (data-bound counter)",
    description:
      "A data-bound number with optional label and count-up animation. Bind it to any numeric metric (github:commits-last-year, nitrotype:avg-wpm, …).",
    supportsAnimation: true,
  },
  render: ({ knobs, theme, box, bound, raster }) => {
    const { w, h } = box;
    // Fall back to 0 when unbound (e.g. a static preview with no subject).
    const numeric = bound && typeof bound.value === "number" ? bound.value : 0;
    const display = bound ? bound.display : fmtInt(numeric);

    const x = knobs.align === "left" ? 0 : knobs.align === "right" ? w : w / 2;
    const anchor =
      knobs.align === "left"
        ? "start"
        : knobs.align === "right"
          ? "end"
          : "middle";
    const family = knobs.mono ? monoStack(raster) : fontStack(raster);
    const valueColor = themeColor(theme, knobs.color, "accent");
    const labelColor = themeColor(theme, knobs.labelColor, "textMuted");

    const hasLabel = !!knobs.label;
    // Vertically: value sits above the label when a label is present.
    const valueY = hasLabel ? h * 0.46 : h / 2;
    const labelY = h * 0.78;

    // SMIL count-up on text content (live SVG only).
    const countUp =
      knobs.countUp && !raster && numeric > 0
        ? (() => {
            const steps = 20;
            const vals = Array.from({ length: steps + 1 }, (_, i) =>
              fmtInt(Math.round((numeric * i) / steps)),
            ).join(";");
            return `<animate attributeName="textContent" values="${vals}" dur="1.4s" fill="freeze" begin="0.2s"/>`;
          })()
        : "";

    const valueText =
      `<text x="${x}" y="${valueY}" text-anchor="${anchor}" dominant-baseline="middle" ` +
      `font-family='${family}' font-size="${knobs.size}" font-weight="800" fill="${valueColor}">` +
      `${esc(display)}${countUp}</text>`;

    const labelText = hasLabel
      ? `<text x="${x}" y="${labelY}" text-anchor="${anchor}" dominant-baseline="middle" ` +
        `font-family='${fontStack(raster)}' font-size="${Math.max(11, Math.round(knobs.size * 0.22))}" ` +
        `font-weight="600" fill="${labelColor}" letter-spacing="0.12em">${esc(knobs.label!.toUpperCase())}</text>`
      : "";

    return valueText + labelText;
  },
};
