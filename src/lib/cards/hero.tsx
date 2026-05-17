import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import {
  userOverview,
  userContributions,
  type UserOverview,
  type UserContributions,
} from "@/lib/data/atoms";
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

const DEFAULT_W = 1200;
const DEFAULT_H = 340;

// Hero compound banner: rotating sphere + icosahedron on the left,
// stats panel on the right (commits, repos, WPM, peak WPM, races).
// Mixes GitHub atom data with the nitrotype atom.
//
// The `nt` query param overrides the nitrotype username when it differs
// from the GitHub username — important when a user races as one handle
// and codes as another.

const Input = z.object({
  user: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/),
  nt: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_]+$/)
    .optional(),
});
type Input = z.infer<typeof Input>;

type Data = {
  overview: UserOverview;
  contrib: UserContributions;
  racer: NitrotypeRacer | null;
};

const N_POINTS = 44;
const N_KF = 28;
const SPHERE_R = 120;
const POINT_R = 4.0;
const D_CAMERA = 4 * SPHERE_R;

function buildSphereDots(
  cx: number,
  cy: number,
  dur: string,
  hueFn: (lat: number) => string,
): string {
  const scene = makeScene(D_CAMERA);
  const orient = DEFAULT_ORIENTATION;
  const points = fibonacciSphere(N_POINTS);
  const keyTimes = buildKeyTimes(N_KF);

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
      rs.push((POINT_R * (0.7 + 0.4 * front)).toFixed(2));
      ops.push((0.22 + 0.72 * front).toFixed(2));
    }
    const color = hueFn(p.lat);
    els.push(
      `<circle cx="${cxs[0]}" cy="${cys[0]}" r="${rs[0]}" fill="${color}" opacity="${ops[0]}">` +
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

  const lines: string[] = [];
  for (const [a, b] of ICOSA_EDGES) {
    const ta = tracks[a]!;
    const tb = tracks[b]!;
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const avg = (ta.depths[k]! + tb.depths[k]!) / 2;
      const norm = avg / radius;
      ops.push((0.16 + 0.56 * Math.max(0, (norm + 1) / 2)).toFixed(2));
    }
    lines.push(
      `<line x1="${ta.xs[0]}" y1="${ta.ys[0]}" x2="${tb.xs[0]}" y2="${tb.ys[0]}" stroke="${color}" stroke-width="1.3" stroke-linecap="round" opacity="${ops[0]}">` +
        `<animate attributeName="x1" values="${ta.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y1" values="${ta.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="x2" values="${tb.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y2" values="${tb.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `</line>`,
    );
  }
  return lines.join("");
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
  // Sphere centered in the left ~33% of the canvas.
  const sphereCenterX = width * 0.22;
  const sphereCenterY = height / 2;

  const sphereDots = buildSphereDots(
    sphereCenterX,
    sphereCenterY,
    "20s",
    (lat) => `hsl(${((lat / Math.PI + 0.5) * 360).toFixed(0)}, 78%, 62%)`,
  );
  const icosa = buildIcosa(
    sphereCenterX,
    sphereCenterY,
    SPHERE_R * 0.55,
    "#e5e7eb",
    "13s",
  );

  // Stats panel: 2 rows × 3 cells.
  const panelX = width * 0.42;
  const panelTitle = data.overview.name ?? data.overview.login;
  const panelSub = `@${data.overview.login}${data.racer ? ` · @${data.racer.username} (nitrotype)` : ""}`;

  type Cell = {
    x: number;
    y: number;
    label: string;
    value: number;
    suffix?: string;
  };
  const rowY1 = 130;
  const rowY2 = 240;
  const colW = (width - panelX - 40) / 3;
  const cellAt = (col: number, row: number) => ({
    x: panelX + col * colW + 8,
    y: row === 0 ? rowY1 : rowY2,
  });
  const cells: Cell[] = [
    {
      ...cellAt(0, 0),
      label: "COMMITS · 1Y",
      value: data.contrib.totalCommitsLastYear,
    },
    { ...cellAt(1, 0), label: "REPOS", value: data.overview.publicRepoCount },
    {
      ...cellAt(2, 0),
      label: "STREAK",
      value: data.contrib.currentStreak,
      suffix: "d",
    },
    {
      ...cellAt(0, 1),
      label: "AVG WPM",
      value: data.racer?.avgSpeed ?? 0,
    },
    {
      ...cellAt(1, 1),
      label: "PEAK WPM",
      value: data.racer?.highestSpeed ?? 0,
    },
    {
      ...cellAt(2, 1),
      label: "RACES",
      value: data.racer?.racesPlayed ?? 0,
    },
  ];

  const cellEls = cells
    .map((c, i) => {
      const countVals = buildCountUp(c.value, 16);
      return `<g class="cell c${i}">
        <text class="cellLbl" x="${c.x}" y="${c.y - 30}">${esc(c.label)}</text>
        <text class="cellNum" x="${c.x}" y="${c.y}">${fmtInt(c.value)}${c.suffix ? `<tspan font-size="20" dx="2" fill="${theme.textMuted}">${c.suffix}</tspan>` : ""}<animate attributeName="textContent" values="${countVals}" dur="1.4s" fill="freeze" begin="${0.2 + i * 0.07}s"/></text>
      </g>`;
    })
    .join("");

  const cellDelays = cells
    .map(
      (_, i) =>
        `.cell.c${i}{opacity:0;animation:hFade 500ms ease-out ${260 + i * 70}ms forwards;}`,
    )
    .join("");

  return {
    contentType: "image/svg+xml; charset=utf-8",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Hero banner for @${data.overview.login}`)}">
  <defs>
    <radialGradient id="hBg" cx="22%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${theme.gradient}" stop-opacity="0.55"/>
      <stop offset="80%" stop-color="${theme.bg}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="hSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${theme.accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </linearGradient>
    <style>
      .hName  { font: 800 36px ui-sans-serif, system-ui, -apple-system, sans-serif; fill: ${theme.text}; }
      .hSub   { font: 500 14px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.textMuted}; }
      .cellLbl{ font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.22em; }
      .cellNum{ font: 700 40px ui-monospace, SFMono-Regular, Menlo, monospace; fill: ${theme.text}; }
      .foot   { font: 500 11px ui-sans-serif, system-ui, sans-serif; fill: ${theme.textMuted}; letter-spacing: 0.2em; }
      .hName, .hSub, .foot { opacity: 0; animation: hFade 600ms ease-out forwards; }
      .hName{ animation-delay: 80ms; }
      .hSub { animation-delay: 200ms; }
      .foot { animation-delay: 600ms; }
      ${cellDelays}
      @keyframes hFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    </style>
  </defs>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#hBg)" stroke="${theme.stroke}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="18" ry="18" fill="url(#hSheen)">
    <animateTransform attributeName="transform" type="translate" from="${-width} 0" to="${width} 0" dur="4.8s" repeatCount="indefinite"/>
  </rect>
  ${icosa}
  ${sphereDots}
  <text class="hName" x="${panelX}" y="60">${esc(panelTitle)}</text>
  <text class="hSub"  x="${panelX}" y="84">${esc(panelSub)}</text>
  ${cellEls}
  <text class="foot" x="${width - 28}" y="${height - 16}" text-anchor="end">GITHUB · NITROTYPE · LIVE</text>
</svg>`,
  };
};

export const heroCard: Card<Input, Data> = {
  name: "hero",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input, cache) => {
    const ntUser = input.nt ?? input.user;
    const [overview, contrib, racer] = await Promise.all([
      userOverview({ login: input.user }, cache),
      userContributions({ login: input.user }, cache),
      // Tolerate the nitrotype lookup failing — show 0s rather than blowing
      // up the whole card if the upstream proxy is rate-limited or the
      // username doesn't exist.
      nitrotypeRacer({ username: ntUser }, cache).catch(() => null),
    ]);
    return { overview, contrib, racer };
  },
  formats: {
    svg: renderSvg,
  },
  meta: {
    title: "Hero banner — sphere + GitHub + nitrotype",
    description:
      "Wide hero combining the rotating sphere+icosahedron with a 6-cell stats panel (commits, repos, streak, WPM avg, WPM peak, races). Use ?nt=<racer> when the nitrotype handle differs from the GitHub user.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
