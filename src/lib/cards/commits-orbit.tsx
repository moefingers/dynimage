import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import {
  userOverview,
  userContributions,
  type UserOverview,
  type UserContributions,
} from "@/lib/data/atoms";
import {
  DEFAULT_ORIENTATION,
  fibonacciSphere,
  ICOSA_EDGES,
  ICOSA_VERTICES,
  makeScene,
  buildKeyTimes,
} from "./sphere-math";
import { esc, fmtInt } from "./svg-helpers";

const DEFAULT_W = 1100;
const DEFAULT_H = 340;

// commits-orbit: prism-variant rotating sphere on the LEFT, a huge
// last-year-commits headline on the RIGHT. Companion to typing-orbit
// (which mirrors the layout for the nitrotype card).

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

const N_POINTS = 50;
const N_KF = 30;
const SPHERE_R = 130;
const POINT_R = 4.2;
const D_CAMERA = 4 * SPHERE_R;

function buildSphereDots(cx: number, cy: number, dur: string): string {
  const scene = makeScene(D_CAMERA);
  const orient = DEFAULT_ORIENTATION;
  const points = fibonacciSphere(N_POINTS);
  const keyTimes = buildKeyTimes(N_KF);

  // Prism palette: wide hue spread across latitude — matches orbit?v=prism.
  const hueFor = (lat: number) =>
    `hsl(${(((lat + Math.PI / 2) / Math.PI) * 360).toFixed(0)}, 85%, 60%)`;

  const initial = points.map((p) => {
    const x0 = SPHERE_R * Math.cos(p.lat) * Math.sin(p.lon);
    const y0 = SPHERE_R * Math.sin(p.lat);
    const z0 = SPHERE_R * Math.cos(p.lat) * Math.cos(p.lon);
    const proj0 = scene.project(x0, y0, z0, orient);
    return { p, depth0: proj0.depth };
  });
  initial.sort((a, b) => a.depth0 - b.depth0);

  const els: string[] = [];
  for (const { p } of initial) {
    const cxs: string[] = [];
    const cys: string[] = [];
    const rs: string[] = [];
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const theta = (k / N_KF) * 2 * Math.PI;
      const lon = p.lon + theta;
      const x = SPHERE_R * Math.cos(p.lat) * Math.sin(lon);
      const y = SPHERE_R * Math.sin(p.lat);
      const z = SPHERE_R * Math.cos(p.lat) * Math.cos(lon);
      const pr = scene.project(x, y, z, orient);
      const norm = pr.depth / SPHERE_R;
      const front = Math.max(0, (norm + 1) / 2);
      cxs.push((cx + pr.x).toFixed(1));
      cys.push((cy + pr.y).toFixed(1));
      rs.push((POINT_R * (0.75 + 0.35 * front)).toFixed(2));
      ops.push((0.22 + 0.72 * front).toFixed(2));
    }
    els.push(
      `<circle cx="${cxs[0]}" cy="${cys[0]}" r="${rs[0]}" fill="${hueFor(p.lat)}" opacity="${ops[0]}">` +
        `<animate attributeName="cx" values="${cxs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${cys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="r" values="${rs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `</circle>`,
    );
  }
  return els.join("");
}

function buildIcosa(
  cx: number,
  cy: number,
  radius: number,
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
    const theta = -(k / N_KF) * 2 * Math.PI;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let i = 0; i < ICOSA_VERTICES.length; i++) {
      const v = ICOSA_VERTICES[i]!;
      const x = (v[0] * c + v[2] * s) * radius;
      const y = v[1] * radius;
      const z = (-v[0] * s + v[2] * c) * radius;
      const pr = scene.project(x, y, z, orient);
      tracks[i]!.xs.push((cx + pr.x).toFixed(1));
      tracks[i]!.ys.push((cy + pr.y).toFixed(1));
      tracks[i]!.depths.push(pr.depth);
    }
  }

  const out: string[] = [];
  // Prism palette icosa stroke (matches orbit?v=prism).
  const stroke = "#fbbf24";
  for (const [a, b] of ICOSA_EDGES) {
    const ta = tracks[a]!;
    const tb = tracks[b]!;
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const avg = (ta.depths[k]! + tb.depths[k]!) / 2;
      const norm = avg / radius;
      ops.push((0.18 + 0.6 * Math.max(0, (norm + 1) / 2)).toFixed(2));
    }
    out.push(
      `<line x1="${ta.xs[0]}" y1="${ta.ys[0]}" x2="${tb.xs[0]}" y2="${tb.ys[0]}" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" opacity="${ops[0]}">` +
        `<animate attributeName="x1" values="${ta.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y1" values="${ta.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="x2" values="${tb.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y2" values="${tb.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `</line>`,
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
  const sphereCx = SPHERE_R + 40;
  const sphereCy = height / 2;
  const sphereDots = buildSphereDots(sphereCx, sphereCy, "22s");
  const icosa = buildIcosa(sphereCx, sphereCy, SPHERE_R * 0.55, "14s");

  const total = data.contrib.totalCommitsLastYear;
  const countUp = buildCountUp(total, 22);
  const display = data.overview.name ?? data.overview.login;
  const subRight = `${data.overview.publicRepoCount} public repos · ${data.contrib.currentStreak}d streak`;

  // Stats panel starts past the sphere's right edge.
  const panelX = sphereCx + SPHERE_R + 30;

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`commits + orbit banner for @${data.overview.login}`)}">
  <defs>
    <radialGradient id="cBg" cx="20%" cy="50%" r="80%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.55"/>
      <stop offset="90%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="cSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .cName { font: 700 22px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .cSub  { font: 500 13px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.textMuted}; letter-spacing: 0.06em; }
      .cHead { font: 800 140px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .cLbl  { font: 600 14px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.22em; text-transform: uppercase; }
      .cFoot { font: 500 11px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.2em; }
      /* Prism palette uses #fbbf24 for accents — gives a warm amber that
         contrasts the cool rainbow dots. */
      .cAccent { fill: #fbbf24; }
      .cName, .cSub, .cHead, .cLbl, .cFoot {
        opacity: 0; animation: cFade 600ms ease-out forwards;
      }
      .cName { animation-delay: 80ms; }
      .cSub  { animation-delay: 180ms; }
      .cHead { animation-delay: 300ms; }
      .cLbl  { animation-delay: 380ms; }
      .cFoot { animation-delay: 520ms; }
      @keyframes cFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#cBg)" stroke="${theme.stroke}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#cSheen)">
    <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="5.4s" repeatCount="indefinite"/>
  </rect>
  ${icosa}
  ${sphereDots}
  <text class="cName" x="${panelX}" y="62">${esc(display)}</text>
  <text class="cSub"  x="${panelX}" y="84">@${esc(data.overview.login)} · ${esc(subRight)}</text>
  <text class="cHead cAccent" x="${panelX}" y="232">${fmtInt(total)}<animate attributeName="textContent" values="${countUp}" dur="1.6s" fill="freeze" begin="0.4s"/></text>
  <text class="cLbl"  x="${panelX}" y="262">COMMITS · LAST YEAR</text>
  <text class="cFoot" x="${width - 28}" y="${height - 18}" text-anchor="end">GITHUB · LIVE · DYNIMAGE</text>
</svg>`,
  };
};

export const commitsOrbitCard: Card<Input, Data> = {
  name: "commits-orbit",
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
    title: "Commits + orbit",
    description:
      "Prism-variant rotating sphere on the left, huge last-year-commits headline on the right. Pairs with typing-orbit for matching visual rhythm.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
