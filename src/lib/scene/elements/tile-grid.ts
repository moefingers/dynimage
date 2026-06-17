import { z } from "zod";
import type { Element } from "../types";
import { esc, fontStack } from "../svg";
import { themeColor } from "../svg";
import { SYNDICATE_TEAL } from "@/lib/cards/syndicate-lattice";

// tile-grid — a row of titled service tiles with a staggered shimmer and
// optional focus highlight. Decomposition of the syndicate tile row.
const Tile = z.object({
  key: z.string().max(40).optional(),
  title: z.string().min(1).max(40),
  sub: z.string().max(60).optional(),
});

const Knobs = z.object({
  tiles: z.array(Tile).min(1).max(6),
  // Highlight one tile by key; others dim. Omit/"all" => no focus.
  focus: z.string().max(40).optional(),
  gap: z.coerce.number().min(0).max(48).optional().default(14),
  radius: z.coerce.number().min(0).max(40).optional().default(14),
  accent: z.string().max(20).optional().default(SYNDICATE_TEAL),
  shimmerDur: z.coerce.number().min(1).max(30).optional().default(5.4),
});
type Knobs = z.infer<typeof Knobs>;

export const tileGridElement: Element<Knobs> = {
  type: "tile-grid",
  runtime: "edge",
  defaultSize: { width: 840, height: 150 },
  knobs: Knobs,
  bind: { accepts: "none" },
  meta: {
    title: "Tile grid",
    description:
      "A row of titled tiles with a staggered shimmer sweep and optional focus highlight. The syndicate services row.",
    supportsAnimation: true,
  },
  render: ({ knobs, theme, box, raster }) => {
    const { w, h } = box;
    const n = knobs.tiles.length;
    const tileW = (w - (n - 1) * knobs.gap) / n;
    const accent = themeColor(theme, knobs.accent, "accent");
    const family = fontStack(raster);
    const hasFocus = !!knobs.focus && knobs.focus !== "all";

    const shimmerGrad =
      `<linearGradient id="tileShimmer" x1="0%" y1="0%" x2="100%" y2="0%">` +
      `<stop offset="0%" stop-color="${accent}" stop-opacity="0"/>` +
      `<stop offset="50%" stop-color="${accent}" stop-opacity="0.32"/>` +
      `<stop offset="100%" stop-color="${accent}" stop-opacity="0"/></linearGradient>`;

    const clips = knobs.tiles
      .map((_, i) => {
        const x = i * (tileW + knobs.gap);
        return `<clipPath id="tileClip${i}"><rect x="${x.toFixed(1)}" y="0" width="${tileW.toFixed(1)}" height="${h}" rx="${knobs.radius}" ry="${knobs.radius}"/></clipPath>`;
      })
      .join("");

    const tiles = knobs.tiles
      .map((t, i) => {
        const x = i * (tileW + knobs.gap);
        const isFocus = hasFocus && t.key === knobs.focus;
        const dim = hasFocus && !isFocus;
        const cardOpacity = dim ? 0.4 : 1;
        const stroke = isFocus ? accent : theme.stroke;
        const strokeW = isFocus ? 2 : 1;
        const begin = (-i * (knobs.shimmerDur / n)).toFixed(2);
        const shimmer = raster
          ? ""
          : `<g clip-path="url(#tileClip${i})"><rect x="${x.toFixed(1)}" y="0" width="${tileW.toFixed(1)}" height="${h}" rx="${knobs.radius}" ry="${knobs.radius}" fill="url(#tileShimmer)">` +
            `<animateTransform attributeName="transform" type="translate" from="${-tileW.toFixed(1)} 0" to="${tileW.toFixed(1)} 0" dur="${knobs.shimmerDur}s" begin="${begin}s" repeatCount="indefinite"/></rect></g>`;
        const cx = x + tileW / 2;
        const title = `<text x="${cx.toFixed(1)}" y="${(h / 2 - 4).toFixed(1)}" text-anchor="middle" font-family='${family}' font-size="18" font-weight="700" fill="${theme.text}">${esc(t.title)}</text>`;
        const sub = t.sub
          ? `<text x="${cx.toFixed(1)}" y="${(h / 2 + 22).toFixed(1)}" text-anchor="middle" font-family='${family}' font-size="13" font-weight="500" fill="${theme.textMuted}">${esc(t.sub)}</text>`
          : "";
        return (
          `<g opacity="${cardOpacity}">` +
          `<rect x="${x.toFixed(1)}" y="0" width="${tileW.toFixed(1)}" height="${h}" rx="${knobs.radius}" ry="${knobs.radius}" fill="${theme.bg}" fill-opacity="0.72" stroke="${stroke}" stroke-width="${strokeW}"/>` +
          shimmer +
          title +
          sub +
          `</g>`
        );
      })
      .join("");

    return `<defs>${shimmerGrad}${clips}</defs>${tiles}`;
  },
};
