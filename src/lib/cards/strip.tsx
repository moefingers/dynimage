import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import {
  userOverview,
  userContributions,
  type UserOverview,
  type UserContributions,
} from "@/lib/data/atoms";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 900;
const DEFAULT_H = 140;

// Horizontal stats strip with offset color-shifting animations. Four
// numbers in monospace + a small hue-cycling accent bar under each.
// Each accent bar's hue-rotate begin is offset so the colors shift
// independently — gives the "live" feel without baked keyframes.

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
  const padX = 28;
  const cols = 4;
  const colW = (width - padX * 2) / cols;
  const stats: Array<{ label: string; value: number; color: string }> = [
    {
      label: "COMMITS · 1Y",
      value: data.contrib.totalCommitsLastYear,
      color: "#a855f7",
    },
    { label: "REPOS", value: data.overview.publicRepoCount, color: "#22d3ee" },
    {
      label: "STREAK · DAYS",
      value: data.contrib.currentStreak,
      color: "#fbbf24",
    },
    { label: "FOLLOWERS", value: data.overview.followers, color: "#f472b6" },
  ];

  const cells = stats
    .map((s, i) => {
      const cx = padX + colW * i + colW / 2;
      const top = height / 2 - 18;
      const accentY = height - 28;
      const countVals = buildCountUp(s.value, 18);
      // Each column's hue-cycle starts at a different phase so the four
      // accent bars are continuously color-offset from each other.
      const begin = `${(-i * 1.2).toFixed(2)}s`;
      return `
        <g class="col c${i}">
          <text class="lbl" x="${cx}" y="${top - 14}" text-anchor="middle">${esc(s.label)}</text>
          <text class="num" x="${cx}" y="${top + 26}" text-anchor="middle">${fmtInt(s.value)}<animate attributeName="textContent" values="${countVals}" dur="1.4s" fill="freeze" begin="${0.15 + i * 0.1}s"/></text>
          <rect x="${cx - 28}" y="${accentY}" width="56" height="3" rx="1.5" fill="${s.color}">
            <animate attributeName="fill" values="${s.color};#22d3ee;#a855f7;#fb7185;#fbbf24;${s.color}" dur="10s" begin="${begin}" repeatCount="indefinite"/>
            <animate attributeName="width" values="40;72;40" dur="3s" begin="${begin}" repeatCount="indefinite"/>
            <animate attributeName="x" values="${cx - 20};${cx - 36};${cx - 20}" dur="3s" begin="${begin}" repeatCount="indefinite"/>
          </rect>
        </g>`;
    })
    .join("");

  // Vertical separators between cells.
  const seps: string[] = [];
  for (let i = 1; i < cols; i++) {
    const x = padX + colW * i;
    seps.push(
      `<line x1="${x}" y1="22" x2="${x}" y2="${height - 22}" stroke="${theme.stroke}" stroke-width="1"/>`,
    );
  }

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Stats strip for @${data.overview.login}`)}">
  <defs>
    <linearGradient id="stripBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="stripSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .lbl { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.22em; }
      .num { font: 700 36px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .col { opacity: 0; animation: fadeUp 500ms cubic-bezier(.2,.7,.2,1) both; }
      .c0 { animation-delay: 60ms; }
      .c1 { animation-delay: 160ms; }
      .c2 { animation-delay: 260ms; }
      .c3 { animation-delay: 360ms; }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="url(#stripBg)" stroke="${theme.stroke}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="14" ry="14" fill="url(#stripSheen)">
    <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="4.2s" repeatCount="indefinite"/>
  </rect>
  ${seps.join("")}
  ${cells}
</svg>`,
  };
};

export const stripCard: Card<Input, Data> = {
  name: "strip",
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
    title: "Stats strip",
    description:
      "Four-column stats strip — commits (1y), repos, streak, followers. Per-column hue-rotating accent bars with offset begin times so the colors shift independently.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
