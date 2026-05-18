import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import { nitrotypeRacer, type NitrotypeRacer } from "@/lib/data/nitrotype";
import {
  DEFAULT_ORIENTATION,
  fibonacciSphere,
  ICOSA_EDGES,
  ICOSA_VERTICES,
  makeScene,
  buildKeyTimes,
} from "./sphere-math";
import { esc, fmtInt } from "./svg-helpers";
import { brandIconAt, NITROTYPE_PATH, NITROTYPE_VB } from "./brand-icons";

const DEFAULT_W = 1100;
const DEFAULT_H = 340;

// typing-orbit: nitrotype panel on the LEFT, prism-variant rotating
// sphere on the RIGHT (amber icosa over a full-rainbow dot band with
// the Nitrotype "N" mark at center). Mirror of commits-orbit; together
// they read as a left/right pair when stacked in the README.

const Input = z.object({
  user: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_]+$/),
});
type Input = z.infer<typeof Input>;

type Data = { racer: NitrotypeRacer };

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
  // Prism icosa stroke (matches orbit?v=prism).
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

function tierLabel(t: number): string {
  switch (t) {
    case 5:
      return "DIAMOND";
    case 4:
      return "PLATINUM";
    case 3:
      return "GOLD";
    case 2:
      return "SILVER";
    case 1:
      return "BRONZE";
    default:
      return "UNRANKED";
  }
}

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const r = data.racer;
  // Sphere on the right.
  const sphereCx = width - SPHERE_R - 40;
  const sphereCy = height / 2;
  const sphereDots = buildSphereDots(sphereCx, sphereCy, "22s");
  const icosa = buildIcosa(sphereCx, sphereCy, SPHERE_R * 0.55, "14s");
  // Brand icon at the icosa center — Nitrotype "N" mark behind the
  // wireframe. Amber to match the prism palette's icosa stroke.
  const ntIcon = brandIconAt({
    cx: sphereCx,
    cy: sphereCy,
    size: 100,
    pathD: NITROTYPE_PATH,
    pathViewBox: NITROTYPE_VB,
    fill: "#fbbf24",
    opacity: 0.35,
  });

  const avgCount = buildCountUp(r.avgSpeed, 22);
  const peakCount = buildCountUp(r.highestSpeed, 22);
  const racesCount = buildCountUp(r.racesPlayed, 18);
  const display = r.displayName ?? r.username;

  // Prism palette tier stripe — diamond falls back to amber to match.
  const tierColor =
    r.leagueTier >= 5
      ? "#fde047"
      : r.leagueTier === 4
        ? "#e5e7eb"
        : r.leagueTier === 3
          ? "#fbbf24"
          : r.leagueTier === 2
            ? "#94a3b8"
            : r.leagueTier === 1
              ? "#a16207"
              : "#fbbf24";

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`typing + orbit banner for ${display}`)}">
  <defs>
    <radialGradient id="toBg" cx="80%" cy="50%" r="80%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.55"/>
      <stop offset="90%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="toSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0"/>
      <stop offset="50%" stop-color="#fbbf24" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/>
    </linearGradient>
    <style>
      .tName { font: 700 22px ui-sans-serif, system-ui, sans-serif; fill: ${theme.text}; }
      .tSub  { font: 500 12px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.textMuted}; letter-spacing: 0.06em; }
      .tHead { font: 800 140px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .tUnit { font: 700 32px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.textMuted}; }
      .tLbl  { font: 600 12px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.22em; text-transform: uppercase; }
      .tNum  { font: 700 24px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .tTier { font: 700 11px ui-sans-serif, system-ui, sans-serif; fill: ${tierColor}; letter-spacing: 0.22em; }
      .tFoot { font: 500 11px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.2em; }
      .tAccent { fill: #fbbf24; }
      .tName, .tSub, .tHead, .tUnit, .tLbl, .tNum, .tTier, .tFoot {
        opacity: 0; animation: tFade 600ms ease-out forwards;
      }
      .tName { animation-delay: 80ms; }
      .tSub  { animation-delay: 180ms; }
      .tHead { animation-delay: 300ms; }
      .tUnit { animation-delay: 380ms; }
      .tLbl  { animation-delay: 440ms; }
      .tNum  { animation-delay: 480ms; }
      .tTier { animation-delay: 540ms; }
      .tFoot { animation-delay: 600ms; }
      @keyframes tFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#toBg)" stroke="${theme.stroke}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#toSheen)">
    <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="5.4s" repeatCount="indefinite"/>
  </rect>
  ${ntIcon}
  ${icosa}
  ${sphereDots}

  <text class="tName" x="40" y="62">${esc(display)}</text>
  <text class="tSub"  x="40" y="84">@${esc(r.username)} · ${esc(tierLabel(r.leagueTier))} · nitrotype.com</text>

  <text class="tHead tAccent" x="40" y="232">${r.avgSpeed}<animate attributeName="textContent" values="${avgCount}" dur="1.6s" fill="freeze" begin="0.4s"/></text>
  <text class="tUnit" x="${40 + String(r.avgSpeed).length * 84 + 12}" y="232">WPM</text>
  <text class="tLbl"  x="40" y="262">AVG · LAST 10 RACES</text>

  <text class="tLbl"  x="40" y="${height - 56}">PEAK</text>
  <text class="tNum"  x="40" y="${height - 32}">${r.highestSpeed} <tspan font-size="14" fill="${theme.textMuted}">WPM</tspan><animate attributeName="textContent" values="${peakCount}" dur="1.4s" fill="freeze" begin="0.5s"/></text>

  <text class="tLbl"  x="180" y="${height - 56}">RACES</text>
  <text class="tNum"  x="180" y="${height - 32}">${fmtInt(r.racesPlayed)}<animate attributeName="textContent" values="${racesCount}" dur="1.4s" fill="freeze" begin="0.55s"/></text>

  <text class="tTier" x="320" y="${height - 32}">${esc(tierLabel(r.leagueTier))}</text>

  <text class="tFoot" x="${width - 28}" y="${height - 18}" text-anchor="end">NITROTYPE · LIVE · DYNIMAGE</text>
</svg>`,
  };
};

export const typingOrbitCard: Card<Input, Data> = {
  name: "typing-orbit",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input, cache) => ({
    racer: await nitrotypeRacer({ username: input.user }, cache),
  }),
  formats: {
    svg: renderSvg,
  },
  meta: {
    title: "Typing speed + orbit",
    description:
      "Nitrotype WPM panel on the left, prism-variant rotating sphere on the right with the Nitrotype N mark at the icosa center. Mirrors commits-orbit (which uses the neon palette + GitHub mark); pairs visually when both are stacked.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
