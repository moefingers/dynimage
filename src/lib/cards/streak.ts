import { readFileSync } from "node:fs";
import path from "node:path";
import type { Card, CardRenderer, Theme } from "./types";
import { fetchStreak, type StreakData } from "@/lib/octokit";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 520;
const DEFAULT_H = 220;

// Lazily load the bundled font on first PNG request and cache the
// base64-encoded data URI. Used to inline @font-face into the SVG so
// sharp's librsvg has real glyphs to render; without this, server-side
// rasterization renders text as .notdef boxes because Vercel's Node
// runtime has no fonts installed and `ui-sans-serif`/`system-ui` are
// CSS keywords that browser engines resolve, not real font families.
let fontDataUriCached: string | null = null;
function fontDataUri(): string {
  if (fontDataUriCached) return fontDataUriCached;
  // process.cwd() resolves to the Next project root on Vercel Node
  // functions. The literal string lets Vercel's file tracer include
  // the TTF in the function bundle automatically.
  const buf = readFileSync(
    path.join(process.cwd(), "src/lib/cards/fonts/NotoSans-Regular.ttf"),
  );
  fontDataUriCached = `data:font/ttf;base64,${buf.toString("base64")}`;
  return fontDataUriCached;
}

// Flame icon — outline path from Heroicons (MIT, https://heroicons.com).
// Inlined as SVG <path> instead of the 🔥 emoji so server-side
// rasterization doesn't need an emoji font (which Vercel's Node runtime
// also lacks). Drawn at 24x24, transformed at use-site for any size.
const FLAME_PATH =
  "M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.547 3.75 3.75 0 013.255 3.719z";

// `embedFont` controls whether we inline the font @font-face in the SVG.
// `true` for the PNG path (sharp needs the glyphs); `false` for the SVG
// path (browser uses the viewer's OS fonts — keeping the response small).
function streakSvg(
  data: StreakData,
  theme: Theme,
  width: number,
  height: number,
  opts: { animate: boolean; embedFont: boolean },
): string {
  const flameX = 120;
  const blobR = 80;
  const cx1 = flameX;
  const cy1 = height / 2;
  const cx2 = width - 140;
  const cy2 = height / 2;

  // Flame: scale 24×24 viewBox → 56px, center on (flameX, cy1+4).
  const flameSize = 56;
  const flameScale = flameSize / 24;
  const flameTx = flameX - flameSize / 2;
  const flameTy = cy1 + 4 - flameSize / 2;

  const animatedRings = opts.animate
    ? `
    <circle cx="${cx1}" cy="${cy1}" r="34" fill="none" stroke="${theme.accent}" stroke-width="2" opacity="0.6">
      <animate attributeName="r" values="34;58;34" dur="2.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="${cx1}" cy="${cy1}" r="34" fill="none" stroke="${theme.accent}" stroke-width="2" opacity="0.4">
      <animate attributeName="r" values="34;72;34" dur="2.4s" begin="0.6s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" begin="0.6s" repeatCount="indefinite"/>
    </circle>`
    : "";

  // Browser path uses `ui-sans-serif, system-ui, sans-serif` so the
  // SVG inherits whatever font the viewer's OS provides (Apple Sans,
  // Segoe UI, Liberation Sans, etc). The rasterizer path embeds Noto
  // Sans so librsvg always finds a glyph.
  const fontFamily = opts.embedFont
    ? `"Noto Sans", sans-serif`
    : `ui-sans-serif, system-ui, sans-serif`;

  const fontFaceBlock = opts.embedFont
    ? `
      @font-face {
        font-family: "Noto Sans";
        src: url("${fontDataUri()}") format("truetype");
        font-weight: 100 900;
        font-style: normal;
      }`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${data.currentStreak} day streak`)}">
  <defs>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="36"/>
    </filter>
    <linearGradient id="card-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg}"/>
      <stop offset="100%" stop-color="${theme.bg}"/>
    </linearGradient>
    <style>${fontFaceBlock}
      .big { font: 700 72px ${fontFamily}; fill: ${theme.text}; }
      .med { font: 600 28px ${fontFamily}; fill: ${theme.text}; }
      .label { font: 500 14px ${fontFamily}; fill: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.08em; }
      .sub { font: 400 13px ${fontFamily}; fill: ${theme.textMuted}; }
      .accent { fill: ${theme.accent}; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="url(#card-bg)" stroke="${theme.stroke}" stroke-width="1"/>
  <g filter="url(#blur)">
    <circle cx="${cx1}" cy="${cy1}" r="${blobR}" fill="${theme.accent}" opacity="0.55"/>
    <circle cx="${cx2}" cy="${cy2}" r="${blobR * 0.7}" fill="${theme.gradient}" opacity="0.45"/>
  </g>
  ${animatedRings}
  <g transform="translate(${flameTx}, ${flameTy}) scale(${flameScale})">
    <path d="${FLAME_PATH}" fill="${theme.accent}" fill-rule="evenodd" clip-rule="evenodd"/>
  </g>
  <line x1="${width / 2 - 30}" y1="40" x2="${width / 2 - 30}" y2="${height - 40}" stroke="${theme.stroke}" stroke-width="1"/>
  <text x="${width / 2 + 20}" y="${cy1 - 14}" class="big accent">${esc(fmtInt(data.currentStreak))}</text>
  <text x="${width / 2 + 20}" y="${cy1 + 12}" class="label">current streak</text>
  <text x="${width / 2 + 20}" y="${cy1 + 50}" class="med">${esc(fmtInt(data.longestStreak))}</text>
  <text x="${width / 2 + 20}" y="${cy1 + 70}" class="label">longest</text>
  <text x="${width - 22}" y="${height - 22}" text-anchor="end" class="sub" opacity="0.6">@${esc(data.login)}</text>
</svg>`;
}

const renderSvg: CardRenderer<StreakData> = async ({
  data,
  theme,
  width,
  height,
}) => ({
  contentType: "image/svg+xml; charset=utf-8",
  body: streakSvg(data, theme, width, height, {
    animate: true,
    embedFont: false,
  }),
});

// PNG renderer runs on Node so we can use sharp to rasterize the
// hand-authored SVG (preserving the real <filter feGaussianBlur>).
// Vercel Edge's runtime-WASM-compile prohibition rules out
// @resvg/resvg-wasm; Turbopack's wasm-as-ES-module bundling doesn't
// give us a WebAssembly.Module either. Node + sharp sidesteps both.
const renderPng: CardRenderer<StreakData> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const sharp = (await import("sharp")).default;
  const svg = streakSvg(data, theme, width, height, {
    animate: false,
    embedFont: true,
  });
  const png = await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  return { body: new Uint8Array(png), contentType: "image/png" };
};

export const streakCard: Card<StreakData> = {
  name: "streak",
  // The SVG renderer is Edge-safe, but the PNG renderer needs sharp
  // (Node-only). To keep the card single-runtime, we put the whole
  // card on Node. The SVG response is still fast — just a few ms of
  // Node cold-start on top of pure-template assembly.
  runtime: "nodejs",
  fetch: (login) => fetchStreak(login),
  formats: {
    svg: renderSvg,
    png: renderPng,
  },
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
};
