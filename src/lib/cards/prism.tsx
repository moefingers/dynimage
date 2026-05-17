import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import {
  userOverview,
  userContributions,
  type UserOverview,
  type UserContributions,
} from "@/lib/data/atoms";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 1200;
const DEFAULT_H = 240;

// Prism banner — the color-shift maximalist. Wide banner with the
// username in giant type and three rotating-hue rectangles framing
// stats. CSS `hue-rotate()` filter is supported by camo, and we offset
// the begin times so each block has its own color phase.

const Input = z.object({
  user: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/),
});
type Input = z.infer<typeof Input>;

type Data = {
  overview: UserOverview;
  contrib: UserContributions;
};

function buildCountUp(total: number, steps: number): string {
  const vals: string[] = [];
  for (let k = 0; k <= steps; k++) {
    vals.push(fmtInt(Math.round((total * k) / steps)));
  }
  return vals.join(";");
}

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  // Three vertical color bands behind the title. SMIL `<animate>` on
  // `fill` cycles each through six hues at offset begin times so they
  // collectively look like a slowly-rotating spectrum.
  const bandColors = [
    "#a855f7;#22d3ee;#fbbf24;#f472b6;#4ade80;#fb7185;#a855f7",
    "#22d3ee;#fbbf24;#f472b6;#4ade80;#fb7185;#a855f7;#22d3ee",
    "#fbbf24;#f472b6;#4ade80;#fb7185;#a855f7;#22d3ee;#fbbf24",
  ];
  const bandW = 38;
  const bandsX = 28;
  const bands = bandColors
    .map(
      (c, i) =>
        `<rect x="${bandsX + i * (bandW + 8)}" y="22" width="${bandW}" height="${height - 44}" rx="6" ry="6" fill="${c.split(";")[0]}" opacity="0.85"><animate attributeName="fill" values="${c}" dur="12s" begin="${(-i * 1.4).toFixed(2)}s" repeatCount="indefinite"/></rect>`,
    )
    .join("");

  const titleX = bandsX + 3 * (bandW + 8) + 20;
  const titleY = 110;
  const display = data.overview.name ?? data.overview.login;

  // Three stat cells on the right.
  const statsX = width * 0.62;
  const colW = (width - statsX - 30) / 3;
  type Cell = { label: string; value: number };
  const cells: Cell[] = [
    { label: "COMMITS · 1Y", value: data.contrib.totalCommitsLastYear },
    { label: "REPOS", value: data.overview.publicRepoCount },
    { label: "STREAK · DAYS", value: data.contrib.currentStreak },
  ];
  const cellEls = cells
    .map((c, i) => {
      const cx = statsX + i * colW + colW / 2;
      const countVals = buildCountUp(c.value, 16);
      return `<g class="prCell c${i}">
        <text class="prLbl" x="${cx}" y="60" text-anchor="middle">${esc(c.label)}</text>
        <text class="prNum" x="${cx}" y="138" text-anchor="middle">${fmtInt(c.value)}<animate attributeName="textContent" values="${countVals}" dur="1.4s" fill="freeze" begin="${0.2 + i * 0.1}s"/></text>
      </g>`;
    })
    .join("");

  const cellDelays = cells
    .map(
      (_, i) =>
        `.prCell.c${i}{opacity:0;animation:prFade 500ms ease-out ${260 + i * 80}ms forwards;}`,
    )
    .join("");

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Prism banner for @${data.overview.login}`)}">
  <defs>
    <linearGradient id="prBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="prSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accent}" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .prName { font: 900 56px ui-sans-serif, system-ui, -apple-system, sans-serif; fill: ${theme.text}; letter-spacing: -0.02em; }
      .prSub  { font: 600 14px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.textMuted}; letter-spacing: 0.12em; }
      .prLbl  { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.22em; }
      .prNum  { font: 800 56px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .prName, .prSub { opacity: 0; animation: prFade 600ms ease-out forwards; }
      .prName { animation-delay: 80ms; }
      .prSub  { animation-delay: 180ms; }
      ${cellDelays}
      @keyframes prFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#prBg)" stroke="${theme.stroke}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#prSheen)">
    <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="4.4s" repeatCount="indefinite"/>
  </rect>
  ${bands}
  <text class="prName" x="${titleX}" y="${titleY}">${esc(display)}</text>
  <text class="prSub"  x="${titleX}" y="${titleY + 28}">@${esc(data.overview.login)} · LIVE · GITHUB</text>
  ${cellEls}
</svg>`,
  };
};

export const prismCard: Card<Input, Data> = {
  name: "prism",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input, cache) => {
    const [overview, contrib] = await Promise.all([
      userOverview({ login: input.user }, cache),
      userContributions({ login: input.user }, cache),
    ]);
    return { overview, contrib };
  },
  formats: {
    svg: renderSvg,
  },
  meta: {
    title: "Prism banner — color-shift spectrum",
    description:
      "Wide name+stats banner with three vertical color bands cycling through six hues at offset begin times — the color-shift maximalist preset.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
