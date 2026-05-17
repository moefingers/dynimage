import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import {
  DEFAULT_ORIENTATION,
  ICOSA_EDGES,
  ICOSA_VERTICES,
  makeScene,
  buildKeyTimes,
} from "./sphere-math";
import {
  userOverview,
  userContributions,
  type UserOverview,
  type UserContributions,
} from "@/lib/data/atoms";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 360;
const DEFAULT_H = 360;

// Nucleus — compact square banner. Pure icosahedron (no surrounding
// sphere) at the center, two animated rings around it, and one large
// stat (1-year commits) under. Small enough to inline twice on a README
// row.

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

const N_KF = 36;
const D_CAMERA = 4 * 80;

function buildIcosa(
  cx: number,
  cy: number,
  r: number,
  color: string,
  dur: string,
): string {
  const scene = makeScene(D_CAMERA);
  const orient = DEFAULT_ORIENTATION;
  const keyTimes = buildKeyTimes(N_KF);

  type Track = { xs: string[]; ys: string[]; depths: number[] };
  const tracks: Track[] = ICOSA_VERTICES.map(() => ({
    xs: [],
    ys: [],
    depths: [],
  }));
  for (let k = 0; k <= N_KF; k++) {
    const theta = (k / N_KF) * 2 * Math.PI;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let i = 0; i < ICOSA_VERTICES.length; i++) {
      const v = ICOSA_VERTICES[i]!;
      const x = (v[0] * c + v[2] * s) * r;
      const y = v[1] * r;
      const z = (-v[0] * s + v[2] * c) * r;
      const pr = scene.project(x, y, z, orient);
      tracks[i]!.xs.push((cx + pr.x).toFixed(1));
      tracks[i]!.ys.push((cy + pr.y).toFixed(1));
      tracks[i]!.depths.push(pr.depth);
    }
  }

  const out: string[] = [];
  for (const [a, b] of ICOSA_EDGES) {
    const ta = tracks[a]!;
    const tb = tracks[b]!;
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const avg = (ta.depths[k]! + tb.depths[k]!) / 2;
      const norm = avg / r;
      ops.push((0.22 + 0.65 * Math.max(0, (norm + 1) / 2)).toFixed(2));
    }
    out.push(
      `<line x1="${ta.xs[0]}" y1="${ta.ys[0]}" x2="${tb.xs[0]}" y2="${tb.ys[0]}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity="${ops[0]}">` +
        `<animate attributeName="x1" values="${ta.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y1" values="${ta.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="x2" values="${tb.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y2" values="${tb.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `</line>`,
    );
  }
  // Vertex dots
  for (let i = 0; i < ICOSA_VERTICES.length; i++) {
    const t = tracks[i]!;
    const ops: string[] = [];
    const rs: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const norm = t.depths[k]! / r;
      const front = Math.max(0, (norm + 1) / 2);
      ops.push((0.3 + 0.6 * front).toFixed(2));
      rs.push((2.6 + 1.4 * front).toFixed(2));
    }
    out.push(
      `<circle cx="${t.xs[0]}" cy="${t.ys[0]}" r="${rs[0]}" fill="${color}" opacity="${ops[0]}">` +
        `<animate attributeName="cx" values="${t.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${t.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="r" values="${rs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `</circle>`,
    );
  }
  return out.join("");
}

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
  const cx = width / 2;
  const cy = height * 0.42;
  const r = Math.min(width, height) * 0.22;

  const icosa = buildIcosa(cx, cy, r, theme.accent, "14s");
  const commits = data.contrib.totalCommitsLastYear;
  const countVals = buildCountUp(commits, 18);

  // Two concentric rings — outer counter-rotating dashed stroke, inner
  // pulsing radius.
  const ringDur1 = "16s";
  const ringDur2 = "9s";

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Nucleus banner for @${data.overview.login}`)}">
  <defs>
    <radialGradient id="nBg" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <style>
      .nNum { font: 800 56px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .nLbl { font: 600 11px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.22em; }
      .nName{ font: 700 14px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.accent}; letter-spacing: 0.18em; }
      .nNum, .nLbl, .nName { opacity: 0; animation: nFade 600ms ease-out forwards; }
      .nNum  { animation-delay: 300ms; }
      .nLbl  { animation-delay: 380ms; }
      .nName { animation-delay: 80ms; }
      @keyframes nFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#nBg)" stroke="${theme.stroke}" stroke-width="1"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.55}" fill="none" stroke="${theme.accent}" stroke-width="1" stroke-dasharray="4 8" opacity="0.6" transform-origin="${cx} ${cy}">
    <animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${ringDur1}" repeatCount="indefinite"/>
  </circle>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.95}" fill="none" stroke="${theme.accent}" stroke-width="1" stroke-dasharray="2 14" opacity="0.4" transform-origin="${cx} ${cy}">
    <animateTransform attributeName="transform" type="rotate" from="360 ${cx} ${cy}" to="0 ${cx} ${cy}" dur="${ringDur2}" repeatCount="indefinite"/>
  </circle>
  ${icosa}
  <text class="nName" x="${cx}" y="${height - 80}" text-anchor="middle">@${esc(data.overview.login).toUpperCase()}</text>
  <text class="nNum"  x="${cx}" y="${height - 42}" text-anchor="middle">${fmtInt(commits)}<animate attributeName="textContent" values="${countVals}" dur="1.4s" fill="freeze" begin="0.4s"/></text>
  <text class="nLbl"  x="${cx}" y="${height - 22}" text-anchor="middle">COMMITS · LAST YEAR</text>
</svg>`,
  };
};

export const nucleusCard: Card<Input, Data> = {
  name: "nucleus",
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
    title: "Nucleus — compact icosahedron + commits",
    description:
      "Compact square banner with a rotating icosahedron between two counter-rotating dashed rings and the 1-year-commits headline underneath.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
