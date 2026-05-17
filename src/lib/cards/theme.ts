import type { Theme } from "./types";

// Hex palettes — chosen for adequate contrast on dark/light backgrounds.
// We use hex (not oklch) because Satori's CSS parser handles hex reliably
// across versions; oklch support in Satori has been added but is uneven.
// SVG output accepts both, but we keep one source of truth.
const THEMES: Record<string, Theme> = {
  dark: {
    name: "dark",
    bg: "#0a0a0a",
    accent: "#a855f7",
    text: "#fafafa",
    textMuted: "#a1a1aa",
    gradient: "#6d28d9",
    stroke: "#27272a",
  },
  light: {
    name: "light",
    bg: "#fafafa",
    accent: "#7c3aed",
    text: "#18181b",
    textMuted: "#52525b",
    gradient: "#c4b5fd",
    stroke: "#e4e4e7",
  },
  ocean: {
    name: "ocean",
    bg: "#0c1929",
    accent: "#38bdf8",
    text: "#f1f5f9",
    textMuted: "#94a3b8",
    gradient: "#0369a1",
    stroke: "#1e293b",
  },
  ember: {
    name: "ember",
    bg: "#1a0f0a",
    accent: "#fb923c",
    text: "#fef3c7",
    textMuted: "#fde68a",
    gradient: "#c2410c",
    stroke: "#431407",
  },
  forest: {
    name: "forest",
    bg: "#0a1f15",
    accent: "#4ade80",
    text: "#f0fdf4",
    textMuted: "#86efac",
    gradient: "#166534",
    stroke: "#14532d",
  },
  rose: {
    name: "rose",
    bg: "#1a0a14",
    accent: "#fb7185",
    text: "#fff1f2",
    textMuted: "#fda4af",
    gradient: "#9f1239",
    stroke: "#4c0519",
  },
};

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
function readColor(sp: URLSearchParams, key: string): string | null {
  const raw = sp.get(key);
  if (!raw) return null;
  if (!HEX_RE.test(raw)) return null;
  return raw.startsWith("#") ? raw : `#${raw}`;
}

export function resolveTheme(sp: URLSearchParams): Theme {
  const named = sp.get("theme") ?? "dark";
  const base = THEMES[named] ?? THEMES.dark;
  if (!base) throw new Error("internal: dark theme missing");
  return {
    ...base,
    bg: readColor(sp, "bg") ?? base.bg,
    accent: readColor(sp, "accent") ?? base.accent,
    text: readColor(sp, "text") ?? base.text,
    textMuted: readColor(sp, "text-muted") ?? base.textMuted,
    gradient: readColor(sp, "gradient") ?? base.gradient,
    stroke: readColor(sp, "stroke") ?? base.stroke,
  };
}

export function listThemes(): readonly Theme[] {
  return Object.values(THEMES);
}
