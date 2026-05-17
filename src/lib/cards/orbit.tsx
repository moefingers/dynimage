import { z } from "zod";
import type { Card, CardRenderer } from "./types";
import {
  DEFAULT_ORIENTATION,
  fibonacciSphere,
  ICOSA_EDGES,
  ICOSA_VERTICES,
  makeScene,
  buildKeyTimes,
} from "./sphere-math";
import { esc } from "./svg-helpers";

const DEFAULT_W = 480;
const DEFAULT_H = 480;

// Hardcoded preset: 50-point Fibonacci sphere + 12-vertex icosahedron
// wireframe inside. Transparent background, two counter-rotating shells.
//
// Why pre-baked keyframes vs CSS transforms? SVG 1.1 has no 3D transforms.
// To get convincing perspective foreshortening + depth-based opacity +
// per-point size scaling, we project every point through the rotation
// pipeline at N_KF samples and emit one `<animate>` per attribute. The
// browser interpolates between samples — keyframes cheaper than continuous
// JS, and works under camo (which strips <script>).

const Input = z.object({
  user: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/),
  // Visual variant. "basic" is the default sphere+icosa preset; other
  // values tweak the look without changing the data shape.
  v: z.enum(["basic", "neon", "mono", "prism"]).optional().default("basic"),
});
type Input = z.infer<typeof Input>;

type Data = { user: string };

const N_POINTS = 50;
const N_KF = 30;
const SPHERE_R = 160;
const POINT_R = 4.5;
const D_CAMERA = 4 * SPHERE_R;

// Build the sphere dots animation. Each dot has fixed (lat, lon) on the
// sphere; spinning the sphere around the Y axis sweeps lon over [0, 2π).
// At each keyframe we project the 3D position and emit (cx, cy, r, opacity).
function buildSphereDots(
  cx: number,
  cy: number,
  hue: (lat: number) => string,
  dur: string,
  reverse: boolean,
): string {
  const scene = makeScene(D_CAMERA);
  const orient = DEFAULT_ORIENTATION;
  const points = fibonacciSphere(N_POINTS);

  const els: string[] = [];
  const keyTimes = buildKeyTimes(N_KF);

  // Z-sort by initial depth so closer points paint over farther ones. The
  // depth changes during animation but the painter's-algorithm sort at
  // t=0 is "good enough" — SVG has no per-frame z-buffer anyway, and
  // we compensate by fading rear points via opacity.
  const initial = points.map((p) => {
    const x0 = SPHERE_R * Math.cos(p.lat) * Math.sin(p.lon);
    const y0 = SPHERE_R * Math.sin(p.lat);
    const z0 = SPHERE_R * Math.cos(p.lat) * Math.cos(p.lon);
    const proj0 = scene.project(x0, y0, z0, orient);
    return { p, depth0: proj0.depth };
  });
  initial.sort((a, b) => a.depth0 - b.depth0);

  for (const { p } of initial) {
    const cxs: string[] = [];
    const cys: string[] = [];
    const rs: string[] = [];
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const dir = reverse ? -1 : 1;
      const theta = dir * (k / N_KF) * 2 * Math.PI;
      const lon = p.lon + theta;
      const x3 = SPHERE_R * Math.cos(p.lat) * Math.sin(lon);
      const y3 = SPHERE_R * Math.sin(p.lat);
      const z3 = SPHERE_R * Math.cos(p.lat) * Math.cos(lon);
      const pr = scene.project(x3, y3, z3, DEFAULT_ORIENTATION);
      // Depth fade: depth in roughly [-R, +R]. Front = +R, back = -R.
      // Map [-1, 1] → [0.2, 1.0] opacity for a soft horizon falloff.
      const norm = pr.depth / SPHERE_R;
      const op = 0.2 + 0.8 * Math.max(0, (norm + 1) / 2);
      const r = POINT_R * (0.75 + 0.35 * Math.max(0, (norm + 1) / 2));
      cxs.push((cx + pr.x).toFixed(1));
      cys.push((cy + pr.y).toFixed(1));
      rs.push(r.toFixed(2));
      ops.push(op.toFixed(2));
    }
    const color = hue(p.lat);
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

// Build the icosahedron wireframe. Same rotation pipeline as dots, but
// applied to the 12 fixed vertices; for each edge we emit a <line> with
// (x1, y1, x2, y2) animations.
function buildIcosa(
  cx: number,
  cy: number,
  radius: number,
  stroke: string,
  dur: string,
  reverse: boolean,
): string {
  const scene = makeScene(D_CAMERA);
  const orient = DEFAULT_ORIENTATION;
  const keyTimes = buildKeyTimes(N_KF);

  // Pre-project all vertices at every keyframe so edges can reuse the
  // shared per-vertex tracks instead of recomputing twice per edge.
  type Track = { xs: string[]; ys: string[]; depths: number[] };
  const tracks: Track[] = ICOSA_VERTICES.map(() => ({
    xs: [],
    ys: [],
    depths: [],
  }));
  for (let k = 0; k <= N_KF; k++) {
    const dir = reverse ? -1 : 1;
    const theta = dir * (k / N_KF) * 2 * Math.PI;
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
    // Edge opacity follows the AVERAGE of its two endpoints' depths: when
    // both vertices are behind the sphere, the edge fades almost out;
    // when both are in front, it's full strength.
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const avg = (ta.depths[k]! + tb.depths[k]!) / 2;
      const norm = avg / radius;
      const op = 0.18 + 0.62 * Math.max(0, (norm + 1) / 2);
      ops.push(op.toFixed(2));
    }
    lines.push(
      `<line x1="${ta.xs[0]}" y1="${ta.ys[0]}" x2="${tb.xs[0]}" y2="${tb.ys[0]}" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" opacity="${ops[0]}">` +
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

// Vertex glyphs — small circles at icosahedron corners so the wireframe
// reads as a "thing" rather than just lines.
function buildIcosaVerts(
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  dur: string,
  reverse: boolean,
): string {
  const scene = makeScene(D_CAMERA);
  const orient = DEFAULT_ORIENTATION;
  const keyTimes = buildKeyTimes(N_KF);
  const els: string[] = [];
  for (let i = 0; i < ICOSA_VERTICES.length; i++) {
    const v = ICOSA_VERTICES[i]!;
    const xs: string[] = [];
    const ys: string[] = [];
    const ops: string[] = [];
    const rs: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const dir = reverse ? -1 : 1;
      const theta = dir * (k / N_KF) * 2 * Math.PI;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const x = (v[0] * c + v[2] * s) * radius;
      const y = v[1] * radius;
      const z = (-v[0] * s + v[2] * c) * radius;
      const pr = scene.project(x, y, z, orient);
      xs.push((cx + pr.x).toFixed(1));
      ys.push((cy + pr.y).toFixed(1));
      const norm = pr.depth / radius;
      ops.push((0.25 + 0.65 * Math.max(0, (norm + 1) / 2)).toFixed(2));
      rs.push((2.4 + 1.1 * Math.max(0, (norm + 1) / 2)).toFixed(2));
    }
    els.push(
      `<circle cx="${xs[0]}" cy="${ys[0]}" r="${rs[0]}" fill="${fill}" opacity="${ops[0]}">` +
        `<animate attributeName="cx" values="${xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="r" values="${rs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `</circle>`,
    );
  }
  return els.join("");
}

type Palette = {
  spherePoint: (lat: number) => string;
  // CSS-var-based colors so the same SVG adapts to GitHub light/dark via
  // a prefers-color-scheme media query in the emitted <style>. Values are
  // CSS variable names (e.g. "var(--orb-icosa-edge)") that are defined
  // in `styleBlock` for both color schemes.
  icosaEdge: string;
  icosaVert: string;
  text: string;
  textAccent: string;
  rimGlow?: string;
};

// Per-variant CSS variable definitions. Dark colors apply by default
// (and to dark-mode GitHub); light-mode overrides via the media query.
// The transparent background means BOTH modes have to read — pale
// near-white on light = invisible, so the icosa wireframe and text
// labels both adapt.
function styleBlock(variant: Input["v"], themeAccent: string): string {
  const blocks: Record<
    NonNullable<Input["v"]>,
    { dark: string; light: string }
  > = {
    basic: {
      dark: `--orb-icosa-edge:#e4e4e7;--orb-icosa-vert:#fafafa;--orb-text:#f1f5f9;`,
      light: `--orb-icosa-edge:#3f3f46;--orb-icosa-vert:#18181b;--orb-text:#18181b;`,
    },
    neon: {
      dark: `--orb-icosa-edge:#22d3ee;--orb-icosa-vert:#f472b6;--orb-text:#f5f3ff;`,
      light: `--orb-icosa-edge:#0e7490;--orb-icosa-vert:#be185d;--orb-text:#1e1b4b;`,
    },
    mono: {
      dark: `--orb-icosa-edge:${themeAccent};--orb-icosa-vert:${themeAccent};--orb-text:#e5e7eb;`,
      light: `--orb-icosa-edge:${themeAccent};--orb-icosa-vert:${themeAccent};--orb-text:#18181b;`,
    },
    prism: {
      dark: `--orb-icosa-edge:#fbbf24;--orb-icosa-vert:#fde047;--orb-text:#fafafa;`,
      light: `--orb-icosa-edge:#b45309;--orb-icosa-vert:#92400e;--orb-text:#18181b;`,
    },
  };
  const v = blocks[variant];
  return `:root{${v.dark}}@media (prefers-color-scheme: light){:root{${v.light}}}`;
}

function palette(variant: Input["v"], themeAccent: string): Palette {
  // The sphere-point hue function stays per-variant (saturated colors
  // read on both light and dark). Only edges/verts/text need CSS vars.
  const common: Pick<Palette, "icosaEdge" | "icosaVert" | "text"> = {
    icosaEdge: "var(--orb-icosa-edge)",
    icosaVert: "var(--orb-icosa-vert)",
    text: "var(--orb-text)",
  };
  switch (variant) {
    case "neon":
      return {
        ...common,
        spherePoint: (lat) => {
          const hue = ((lat + Math.PI / 2) / Math.PI) * 80 + 270;
          return `hsl(${hue.toFixed(0)}, 95%, 60%)`;
        },
        textAccent: "#06b6d4",
        rimGlow: "#a855f7",
      };
    case "mono":
      return {
        ...common,
        spherePoint: () => themeAccent,
        textAccent: themeAccent,
      };
    case "prism":
      return {
        ...common,
        spherePoint: (lat) => {
          const hue = ((lat + Math.PI / 2) / Math.PI) * 360;
          return `hsl(${hue.toFixed(0)}, 85%, 55%)`;
        },
        textAccent: "#d97706",
      };
    case "basic":
    default:
      return {
        ...common,
        spherePoint: (lat) => {
          const hue = (lat / Math.PI + 0.5) * 360;
          return `hsl(${hue.toFixed(0)}, 78%, 55%)`;
        },
        textAccent: themeAccent,
      };
  }
}

const renderSvg: CardRenderer<Data> = async ({
  data,
  theme,
  width,
  height,
}) => {
  const variant = (data as Data & { v: Input["v"] }).v ?? "basic";
  const pal = palette(variant, theme.accent);

  const cx = width / 2;
  const cy = height / 2;
  const sphereDur = "22s";
  const icosaDur = "14s";

  const sphereDots = buildSphereDots(cx, cy, pal.spherePoint, sphereDur, false);
  // Icosahedron is ~0.55 of the sphere radius — sits inside without
  // poking through.
  const icosaR = SPHERE_R * 0.55;
  const icosaEdges = buildIcosa(cx, cy, icosaR, pal.icosaEdge, icosaDur, true);
  const icosaVerts = buildIcosaVerts(
    cx,
    cy,
    icosaR,
    pal.icosaVert,
    icosaDur,
    true,
  );

  // Subtle rim glow underlay — pure SVG primitive, single static element,
  // no animation cost. Only emitted for `neon`/`prism` variants.
  const rim = pal.rimGlow
    ? `<defs><radialGradient id="rimGlow" cx="50%" cy="50%" r="50%"><stop offset="60%" stop-color="${pal.rimGlow}" stop-opacity="0"/><stop offset="85%" stop-color="${pal.rimGlow}" stop-opacity="0.18"/><stop offset="100%" stop-color="${pal.rimGlow}" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${SPHERE_R + 22}" fill="url(#rimGlow)"/>`
    : "";

  const username = data.user;

  // Hue-cycle the username text on the prism/neon variants — pure CSS
  // keyframes on `filter`, smooth loop.
  const hueAnimStyle =
    variant === "prism" || variant === "neon"
      ? `.u-label{animation:hue-cycle 8s linear infinite;}@keyframes hue-cycle{0%{filter:hue-rotate(0deg);}100%{filter:hue-rotate(360deg);}}`
      : "";

  const css = `<style>${styleBlock(variant, theme.accent)}${hueAnimStyle}</style>`;

  return {
    contentType: "image/svg+xml; charset=utf-8",
    // Paint order: rim glow underneath, then the icosahedron (which lives
    // INSIDE the sphere shell), then the sphere dots on top so they read
    // as passing in front of the icosa rather than getting occluded by
    // it. Z-depth opacity on the dots still fades back-facing ones.
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(`Rotating 50-point sphere with icosahedron for ${username}`)}">${css}${rim}${icosaEdges}${icosaVerts}${sphereDots}<g class="u-label" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" text-anchor="middle"><text x="${cx}" y="${height - 24}" font-size="18" font-weight="700" fill="${pal.text}" letter-spacing="2">@${esc(username).toUpperCase()}</text><text x="${cx}" y="${height - 8}" font-size="9" fill="${pal.textAccent}" letter-spacing="3" opacity="0.85">D50 · ICOSA · ${variant.toUpperCase()}</text></g></svg>`,
  };
};

export const orbitCard: Card<Input, Data & { v: Input["v"] }> = {
  name: "orbit",
  runtime: "edge",
  defaultSize: { width: DEFAULT_W, height: DEFAULT_H },
  input: Input,
  resolve: async (input) => ({ user: input.user, v: input.v }),
  formats: {
    svg: renderSvg,
  },
  meta: {
    title: "Orbit — sphere + icosahedron",
    description:
      "50-point Fibonacci sphere with a wireframe icosahedron counter-rotating inside. Transparent background, four visual variants (basic | neon | mono | prism). Pure SVG primitives — no external data fetch.",
    dimensions: ["user"],
    supportsAnimation: true,
  },
};
