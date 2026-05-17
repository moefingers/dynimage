import type { Card, CardRenderer, Theme } from "./types";
import { fetchStreak, type StreakData } from "@/lib/octokit";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 520;
const DEFAULT_H = 220;

// Build the SVG body — shared between the .svg renderer (returned as
// text) and the .png renderer (rasterized via @resvg/resvg-wasm).
// The blur is implemented as a real SVG <filter feGaussianBlur>, which
// resvg renders correctly to pixels.
function streakSvg(
  data: StreakData,
  theme: Theme,
  width: number,
  height: number,
  opts: { animate: boolean },
): string {
  const flameX = 120;
  const blobR = 80;
  const cx1 = flameX;
  const cy1 = height / 2;
  const cx2 = width - 140;
  const cy2 = height / 2;

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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`${data.currentStreak} day streak`)}">
  <defs>
    <filter id="blur" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="36"/>
    </filter>
    <linearGradient id="card-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg}"/>
      <stop offset="100%" stop-color="${theme.bg}"/>
    </linearGradient>
    <style>
      .big { font: 700 72px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .med { font: 600 28px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .label { font: 500 14px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.08em; }
      .sub { font: 400 13px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; }
      .accent { fill: ${theme.accent}; }
      .flame { font-size: 56px; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="url(#card-bg)" stroke="${theme.stroke}" stroke-width="1"/>
  <g filter="url(#blur)">
    <circle cx="${cx1}" cy="${cy1}" r="${blobR}" fill="${theme.accent}" opacity="0.55"/>
    <circle cx="${cx2}" cy="${cy2}" r="${blobR * 0.7}" fill="${theme.gradient}" opacity="0.45"/>
  </g>
  ${animatedRings}
  <text x="${flameX}" y="${cy1 + 18}" text-anchor="middle" class="flame">🔥</text>
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
  body: streakSvg(data, theme, width, height, { animate: true }),
});

const renderPng: CardRenderer<StreakData> = async ({
  data,
  theme,
  width,
  height,
  baseUrl,
}) => {
  // Lazy-load resvg-wasm; module init is heavy and we want it deferred
  // out of the first-byte path of the .svg renderer.
  const { initWasm, Resvg } = await import("@resvg/resvg-wasm");
  await ensureResvgInitialized(initWasm, baseUrl);
  const svg = streakSvg(data, theme, width, height, { animate: false });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  });
  const png = resvg.render().asPng();
  return { body: png, contentType: "image/png" };
};

let resvgInit: Promise<void> | null = null;
async function ensureResvgInitialized(
  initWasm: (
    module: Promise<WebAssembly.Module> | WebAssembly.Module | Response,
  ) => Promise<void>,
  baseUrl: string,
): Promise<void> {
  if (!resvgInit) {
    resvgInit = (async () => {
      // The wasm is copied to public/wasm/resvg.wasm at build time by
      // scripts/copy-wasm.mjs. Fetching from a stable URL works the
      // same on Edge and Node and avoids bundler-specific module
      // resolution quirks.
      const res = await fetch(new URL("/wasm/resvg.wasm", baseUrl));
      if (!res.ok) {
        throw new Error(
          `Failed to load resvg wasm from ${baseUrl}/wasm/resvg.wasm: ${res.status}`,
        );
      }
      await initWasm(res);
    })();
  }
  await resvgInit;
}

export const streakCard: Card<StreakData> = {
  name: "streak",
  runtime: "edge",
  fetch: (login) => fetchStreak(login),
  formats: {
    svg: renderSvg,
    png: renderPng,
  },
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
};
