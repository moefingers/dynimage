import { z } from "zod";
import type { Element, ResolvedBox, Point } from "../types";
import {
  DEFAULT_ORIENTATION,
  fibonacciSphere,
  ICOSA_EDGES,
  ICOSA_VERTICES,
  makeScene,
  buildKeyTimes,
} from "@/lib/cards/sphere-math";

// orbit — a Fibonacci sphere of dots with a counter-rotating icosahedron
// wireframe inside. Decomposition of orbit.tsx / the sphere in the
// *-orbit flagships. The curated `neon`/`prism` palettes are now a
// `treatment` KNOB (Stab #6) rather than a hidden card variant, and the
// element honors that treatment directly (no prefers-color-scheme @media,
// which was camo-fragile and theme-ignoring).
//
// Exposes a custom `center` slot at the sphere's center so a logo/icon
// (the octocat, the Nitrotype N) anchors exactly there and stays put as
// the orbit resizes — the README's "mark caged by a spinning wireframe".

const TREATMENTS = {
  neon: {
    icosaEdge: "#22d3ee",
    icosaVert: "#f472b6",
    rimGlow: "#a855f7",
    spherePoint: (lat: number) =>
      `hsl(${(((lat + Math.PI / 2) / Math.PI) * 80 + 270).toFixed(0)}, 95%, 60%)`,
  },
  prism: {
    icosaEdge: "#fbbf24",
    icosaVert: "#fde047",
    rimGlow: "#f59e0b",
    spherePoint: (lat: number) =>
      `hsl(${(((lat + Math.PI / 2) / Math.PI) * 360).toFixed(0)}, 85%, 55%)`,
  },
} as const;

const Knobs = z.object({
  treatment: z.enum(["neon", "prism"]).default("neon"),
  points: z.coerce.number().int().min(8).max(120).optional().default(50),
  icosa: z.coerce.boolean().optional().default(true),
  verts: z.coerce.boolean().optional().default(true),
  rim: z.coerce.boolean().optional().default(true),
  sphereDur: z.coerce.number().min(2).max(120).optional().default(22),
  icosaDur: z.coerce.number().min(2).max(120).optional().default(14),
  // Sphere radius as a fraction of the box's shorter half-dimension.
  scale: z.coerce.number().min(0.3).max(1).optional().default(0.82),
});
type Knobs = z.infer<typeof Knobs>;

const N_KF = 30;

function geom(box: ResolvedBox, knobs: Knobs) {
  const cx = box.w / 2;
  const cy = box.h / 2;
  const sphereR = (Math.min(box.w, box.h) / 2) * knobs.scale;
  return { cx, cy, sphereR, dCam: 4 * sphereR };
}

function sphereDots(
  cx: number,
  cy: number,
  R: number,
  dCam: number,
  points: number,
  hue: (lat: number) => string,
  dur: string,
  raster: boolean,
): string {
  const scene = makeScene(dCam);
  const orient = DEFAULT_ORIENTATION;
  const pts = fibonacciSphere(points);
  const keyTimes = buildKeyTimes(N_KF);
  const pointR = R * 0.028;

  const initial = pts.map((p) => {
    const x0 = R * Math.cos(p.lat) * Math.sin(p.lon);
    const y0 = R * Math.sin(p.lat);
    const z0 = R * Math.cos(p.lat) * Math.cos(p.lon);
    return { p, depth0: scene.project(x0, y0, z0, orient).depth };
  });
  initial.sort((a, b) => a.depth0 - b.depth0);

  const els: string[] = [];
  for (const { p } of initial) {
    const cxs: string[] = [];
    const cys: string[] = [];
    const rs: string[] = [];
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const lon = p.lon + (k / N_KF) * 2 * Math.PI;
      const x3 = R * Math.cos(p.lat) * Math.sin(lon);
      const y3 = R * Math.sin(p.lat);
      const z3 = R * Math.cos(p.lat) * Math.cos(lon);
      const pr = scene.project(x3, y3, z3, orient);
      const norm = pr.depth / R;
      const front = Math.max(0, (norm + 1) / 2);
      cxs.push((cx + pr.x).toFixed(1));
      cys.push((cy + pr.y).toFixed(1));
      rs.push((pointR * (0.75 + 0.35 * front)).toFixed(2));
      ops.push((0.2 + 0.8 * front).toFixed(2));
    }
    const color = hue(p.lat);
    const anim = raster
      ? ""
      : `<animate attributeName="cx" values="${cxs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${cys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="r" values="${rs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>`;
    els.push(
      `<circle cx="${cxs[0]}" cy="${cys[0]}" r="${rs[0]}" fill="${color}" opacity="${ops[0]}">${anim}</circle>`,
    );
  }
  return els.join("");
}

function icosaTracks(cx: number, cy: number, R: number, dCam: number) {
  const scene = makeScene(dCam);
  const orient = DEFAULT_ORIENTATION;
  const tracks = ICOSA_VERTICES.map(() => ({
    xs: [] as string[],
    ys: [] as string[],
    depths: [] as number[],
  }));
  for (let k = 0; k <= N_KF; k++) {
    const theta = -(k / N_KF) * 2 * Math.PI; // icosa counter-rotates
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    for (let i = 0; i < ICOSA_VERTICES.length; i++) {
      const v = ICOSA_VERTICES[i]!;
      const x = (v[0] * c + v[2] * s) * R;
      const y = v[1] * R;
      const z = (-v[0] * s + v[2] * c) * R;
      const pr = scene.project(x, y, z, orient);
      tracks[i]!.xs.push((cx + pr.x).toFixed(1));
      tracks[i]!.ys.push((cy + pr.y).toFixed(1));
      tracks[i]!.depths.push(pr.depth);
    }
  }
  return tracks;
}

function icosaEdges(
  tracks: ReturnType<typeof icosaTracks>,
  R: number,
  stroke: string,
  dur: string,
  raster: boolean,
): string {
  const keyTimes = buildKeyTimes(N_KF);
  const out: string[] = [];
  for (const [a, b] of ICOSA_EDGES) {
    const ta = tracks[a]!;
    const tb = tracks[b]!;
    const ops: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const norm = (ta.depths[k]! + tb.depths[k]!) / 2 / R;
      ops.push((0.18 + 0.62 * Math.max(0, (norm + 1) / 2)).toFixed(2));
    }
    const anim = raster
      ? ""
      : `<animate attributeName="x1" values="${ta.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y1" values="${ta.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="x2" values="${tb.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="y2" values="${tb.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>`;
    out.push(
      `<line x1="${ta.xs[0]}" y1="${ta.ys[0]}" x2="${tb.xs[0]}" y2="${tb.ys[0]}" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" opacity="${ops[0]}">${anim}</line>`,
    );
  }
  return out.join("");
}

function icosaVerts(
  tracks: ReturnType<typeof icosaTracks>,
  R: number,
  fill: string,
  dur: string,
  raster: boolean,
): string {
  const keyTimes = buildKeyTimes(N_KF);
  const out: string[] = [];
  for (let i = 0; i < ICOSA_VERTICES.length; i++) {
    const t = tracks[i]!;
    const ops: string[] = [];
    const rs: string[] = [];
    for (let k = 0; k <= N_KF; k++) {
      const front = Math.max(0, (t.depths[k]! / R + 1) / 2);
      ops.push((0.25 + 0.65 * front).toFixed(2));
      rs.push((R * 0.015 + R * 0.007 * front).toFixed(2));
    }
    const anim = raster
      ? ""
      : `<animate attributeName="cx" values="${t.xs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${t.ys.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="r" values="${rs.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="${ops.join(";")}" keyTimes="${keyTimes}" dur="${dur}" repeatCount="indefinite"/>`;
    out.push(
      `<circle cx="${t.xs[0]}" cy="${t.ys[0]}" r="${rs[0]}" fill="${fill}" opacity="${ops[0]}">${anim}</circle>`,
    );
  }
  return out.join("");
}

export const orbitElement: Element<Knobs> = {
  type: "orbit",
  runtime: "edge",
  defaultSize: { width: 340, height: 340 },
  knobs: Knobs,
  bind: { accepts: "none" },
  slots: {
    // The sphere is centered in the box; expose it explicitly so anchors
    // read intent ("the orbit's center") rather than relying on geometry.
    center: (box: ResolvedBox): Point => ({
      x: box.x + box.w / 2,
      y: box.y + box.h / 2,
    }),
  },
  meta: {
    title: "Orbit — sphere + icosahedron",
    description:
      "Fibonacci sphere of dots with a counter-rotating icosahedron wireframe. neon/prism treatments. Exposes a center slot for a caged logo.",
    supportsAnimation: true,
  },
  render: ({ knobs, box, raster }) => {
    const { cx, cy, sphereR, dCam } = geom(box, knobs);
    const t = TREATMENTS[knobs.treatment];
    const dots = sphereDots(
      cx,
      cy,
      sphereR,
      dCam,
      knobs.points,
      t.spherePoint,
      `${knobs.sphereDur}s`,
      raster,
    );
    const icosaR = sphereR * 0.55;
    let icosa = "";
    if (knobs.icosa) {
      const tracks = icosaTracks(cx, cy, icosaR, dCam);
      icosa =
        icosaEdges(tracks, icosaR, t.icosaEdge, `${knobs.icosaDur}s`, raster) +
        (knobs.verts
          ? icosaVerts(
              tracks,
              icosaR,
              t.icosaVert,
              `${knobs.icosaDur}s`,
              raster,
            )
          : "");
    }
    const rim = knobs.rim
      ? `<defs><radialGradient id="rim" cx="50%" cy="50%" r="50%">` +
        `<stop offset="60%" stop-color="${t.rimGlow}" stop-opacity="0"/>` +
        `<stop offset="85%" stop-color="${t.rimGlow}" stop-opacity="0.18"/>` +
        `<stop offset="100%" stop-color="${t.rimGlow}" stop-opacity="0"/>` +
        `</radialGradient></defs>` +
        `<circle cx="${cx}" cy="${cy}" r="${(sphereR + sphereR * 0.14).toFixed(1)}" fill="url(#rim)"/>`
      : "";
    // Paint order: rim glow, icosa (inside the shell), dots on top.
    return rim + icosa + dots;
  },
};
