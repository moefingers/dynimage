import type { Scene } from "./scene-spec";
import type { Bind, Subject, SubjectKind } from "./types";

// ─────────────────────────────────────────────────────────────────────
// Presets — named bundles of {elements + knobs} that reconstruct a whole
// banner from the composable element set. This is the v1 Definition of
// Done: Mo's three README banners, rebuilt from elements (no monolithic
// card). `build(params)` returns a Scene that renders through the exact
// same /api/render pipeline as any hand-authored scene.
//
// Binds point at the live sources (github:*, nitrotype:*). For editor
// preview / offline proof, pass `sample` to substitute literal values for
// named metrics (§12: "preview reads cached/sample data") — the element
// graph is identical, only the bind source changes.
// ─────────────────────────────────────────────────────────────────────

export type PresetParams = {
  subject: Subject;
  theme?: string;
  // metric → literal display value, for preview/proof without upstream.
  sample?: Record<string, string>;
};

export type Preset = {
  name: string;
  title: string;
  description: string;
  // Subject kinds this preset's bindings accept (drives editor wiring).
  subjectKinds: ReadonlyArray<SubjectKind>;
  build: (params: PresetParams) => Scene;
};

// Build a bind for a metric: literal (from sample) when previewing,
// otherwise the live provider bind for the subject.
function metricBind(
  params: PresetParams,
  provider: string,
  metric: string,
): Bind {
  const sampled = params.sample?.[metric];
  if (sampled != null) return { provider: "literal", value: sampled };
  return { provider, subject: params.subject, metric };
}

// ── commits-orbit ────────────────────────────────────────────────────
// neon orbit + GitHub octocat caged at center + last-year headline +
// lifetime subline.
function buildCommitsOrbit(params: PresetParams): Scene {
  const handle = `@${params.subject.id}`;
  return {
    v: 1,
    canvas: { w: 1100, h: 340, theme: params.theme ?? "dark" },
    elements: [
      {
        id: "bg",
        type: "frame",
        transform: { x: 0, y: 0, w: 1100, h: 340, z: 0 },
        knobs: { wash: true, radius: 18 },
      },
      {
        id: "orb",
        type: "orbit",
        transform: { x: 20, y: 30, w: 280, h: 280, z: 1 },
        knobs: { treatment: "neon" },
      },
      {
        id: "mark",
        type: "logo",
        anchor: { to: "orb", slot: "center" },
        transform: { w: 104, h: 104, z: 3 },
        knobs: { icon: "github", fill: "#22d3ee", breathe: true },
      },
      {
        id: "name",
        type: "text",
        transform: { x: 340, y: 44, w: 720, h: 30, z: 2 },
        knobs: { text: handle, size: 22, align: "left", color: "text" },
      },
      {
        id: "headline",
        type: "stat",
        transform: { x: 340, y: 78, w: 720, h: 150, z: 2 },
        knobs: {
          label: "commits · last year",
          size: 120,
          mono: true,
          color: "#22d3ee",
        },
        bind: metricBind(params, "github", "commits-last-year"),
      },
      {
        id: "lifetime",
        type: "stat",
        transform: { x: 340, y: 250, w: 720, h: 40, z: 2 },
        knobs: {
          label: "all-time commits",
          size: 26,
          mono: true,
          color: "muted",
          countUp: false,
        },
        bind: metricBind(params, "github", "lifetime-commits"),
      },
      {
        id: "foot",
        type: "text",
        transform: { x: 360, y: 318, w: 720, h: 18, z: 2 },
        knobs: {
          text: "GITHUB · LIVE · DYNIMAGE",
          size: 11,
          weight: "medium",
          align: "right",
          color: "muted",
        },
      },
    ],
  };
}

// ── typing-orbit ─────────────────────────────────────────────────────
// prism orbit + Nitrotype "N" caged at center + typing-speed headline.
function buildTypingOrbit(params: PresetParams): Scene {
  const handle = `@${params.subject.id}`;
  return {
    v: 1,
    canvas: { w: 1100, h: 340, theme: params.theme ?? "dark" },
    elements: [
      {
        id: "bg",
        type: "frame",
        transform: { x: 0, y: 0, w: 1100, h: 340, z: 0 },
        knobs: { wash: true, radius: 18 },
      },
      {
        id: "orb",
        type: "orbit",
        transform: { x: 20, y: 30, w: 280, h: 280, z: 1 },
        knobs: { treatment: "prism" },
      },
      {
        id: "mark",
        type: "logo",
        anchor: { to: "orb", slot: "center" },
        transform: { w: 104, h: 104, z: 3 },
        knobs: { icon: "nitrotype", fill: "#fbbf24", breathe: true },
      },
      {
        id: "name",
        type: "text",
        transform: { x: 340, y: 44, w: 720, h: 30, z: 2 },
        knobs: { text: handle, size: 22, align: "left", color: "text" },
      },
      {
        id: "headline",
        type: "stat",
        transform: { x: 340, y: 78, w: 720, h: 150, z: 2 },
        knobs: {
          label: "wpm · average",
          size: 120,
          mono: true,
          color: "#fbbf24",
        },
        bind: metricBind(params, "nitrotype", "avg-wpm"),
      },
      {
        id: "best",
        type: "stat",
        transform: { x: 340, y: 250, w: 720, h: 40, z: 2 },
        knobs: {
          label: "best wpm",
          size: 26,
          mono: true,
          color: "muted",
          countUp: false,
        },
        bind: metricBind(params, "nitrotype", "highest-wpm"),
      },
      {
        id: "foot",
        type: "text",
        transform: { x: 360, y: 318, w: 720, h: 18, z: 2 },
        knobs: {
          text: "NITROTYPE · LIVE · DYNIMAGE",
          size: 11,
          weight: "medium",
          align: "right",
          color: "muted",
        },
      },
    ],
  };
}

// ── syndicate / recanon ──────────────────────────────────────────────
// counter-rotating lattice + wordmark + 3 service tiles.
function buildSyndicate(params: PresetParams): Scene {
  return {
    v: 1,
    canvas: { w: 900, h: 320, theme: params.theme ?? "dark" },
    elements: [
      {
        id: "bg",
        type: "frame",
        transform: { x: 0, y: 0, w: 900, h: 320, z: 0 },
        knobs: { radius: 20 },
      },
      {
        id: "lat",
        type: "lattice",
        transform: { x: 0, y: 0, w: 900, h: 320, z: 1 },
        knobs: { softenCenter: true },
      },
      {
        id: "tag",
        type: "text",
        transform: { x: 0, y: 28, w: 900, h: 28, z: 2 },
        knobs: {
          text: "A SUITE OF SERVICES · BROUGHT TOGETHER",
          size: 14,
          weight: "medium",
          align: "center",
          color: "muted",
        },
      },
      {
        id: "brand",
        type: "text",
        transform: { x: 0, y: 64, w: 900, h: 56, z: 2 },
        knobs: { text: "Recanon", size: 56, weight: "bold", align: "center" },
      },
      {
        id: "tiles",
        type: "tile-grid",
        transform: { x: 28, y: 130, w: 844, h: 162, z: 2 },
        knobs: {
          tiles: [
            { key: "software", title: "Software", sub: "Apps, Sites & Tools" },
            {
              key: "computer",
              title: "Computers",
              sub: "Workstations, IT & Setup",
            },
            {
              key: "portal",
              title: "Client Portal",
              sub: "Invoices, Documents & Pay",
            },
          ],
        },
      },
      {
        id: "foot",
        type: "text",
        transform: { x: 0, y: 304, w: 872, h: 16, z: 2 },
        knobs: {
          text: `recanon.com · @${params.subject.id}`,
          size: 11,
          weight: "medium",
          align: "right",
          color: "muted",
        },
      },
    ],
  };
}

const PRESETS: Record<string, Preset> = {
  "commits-orbit": {
    name: "commits-orbit",
    title: "Commits + orbit",
    description:
      "Neon orbit with the GitHub octocat caged at center, last-year commit headline + all-time subline.",
    subjectKinds: ["user"],
    build: buildCommitsOrbit,
  },
  "typing-orbit": {
    name: "typing-orbit",
    title: "Typing speed + orbit",
    description:
      "Prism orbit with the Nitrotype mark caged at center, average-WPM headline + best-WPM subline.",
    subjectKinds: ["user"],
    build: buildTypingOrbit,
  },
  syndicate: {
    name: "syndicate",
    title: "Recanon — services CTA",
    description:
      "Counter-rotating brand lattice, wordmark, and three service tiles.",
    subjectKinds: ["user"],
    build: buildSyndicate,
  },
};

export function getPreset(name: string): Preset | null {
  return PRESETS[name] ?? null;
}

export function allPresets(): ReadonlyArray<Preset> {
  return Object.values(PRESETS);
}
