import { encodeToQuery, base64urlEncode } from "@/lib/encode/codec";
import type { Scene } from "@/lib/scene/scene-spec";

// ─────────────────────────────────────────────────────────────────────
// Shortest-encoding + embed-snippet generation (editor-b1-ux-spec §5).
// Runs in the browser — the codec is Web-API based (CompressionStream),
// so ?c= gzip works client-side.
//
// Encoding ladder (shortest that fits):
//   • untweaked preset → ?preset=<name>&user=<id>     (Tier-0, shortest)
//   • tweaked scene    → ?scene=<base64url(json)>      (Tier-1.5, readable)
//                        auto-promote to ?c=<…>&z=…     (Tier-2) when shorter
// Theme is appended per-variant (&theme=) so one config yields the
// <picture> light/dark split.
// ─────────────────────────────────────────────────────────────────────

export type ConfigState = {
  presetName: string;
  subject: string;
  scene: Scene;
  tweaked: boolean; // a knob (not subject/theme) was changed → can't use ?preset=
};

// The config portion of the query (no theme/format — appended per use).
export async function encodeConfigQuery(
  state: ConfigState,
): Promise<{ params: URLSearchParams; tier: "preset" | "scene" | "c" }> {
  if (!state.tweaked) {
    const p = new URLSearchParams();
    p.set("preset", state.presetName);
    p.set("user", state.subject || "your-handle");
    return { params: p, tier: "preset" };
  }

  // Tweaked: compare ?scene= (plain) vs ?c= (gzip) and take the shorter.
  const sceneEnc = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(state.scene)),
  );
  const scenePQ = new URLSearchParams();
  scenePQ.set("scene", sceneEnc);

  const cPQ = await encodeToQuery(state.scene); // c= (+ z=1 if gzipped)

  return scenePQ.toString().length <= cPQ.toString().length
    ? { params: scenePQ, tier: "scene" }
    : { params: cPQ, tier: "c" };
}

function withExtras(
  base: URLSearchParams,
  theme: string,
  format: string,
): string {
  const p = new URLSearchParams(base);
  // For ?scene=/?c= the scene already carries canvas.theme; a &theme= here
  // OVERRIDES it (render resolveSceneTheme honors an explicit param) — that's
  // exactly how the <picture> split serves the other mode from one config.
  p.set("theme", theme);
  if (format !== "svg") p.set("format", format);
  return `/api/render?${p.toString()}`;
}

// A single preview URL (same-origin relative) for the selected theme.
export async function previewUrl(
  state: ConfigState,
  theme: string,
  format = "svg",
): Promise<string> {
  const { params } = await encodeConfigQuery(state);
  return withExtras(params, theme, format);
}

// The copy-paste embed snippet: <a> wrapper + <picture> light/dark split.
// Absolute URLs (origin) so it works pasted into any README.
export async function embedSnippet(
  state: ConfigState,
  origin: string,
  linkHref: string,
): Promise<{ snippet: string; tier: string }> {
  const { params, tier } = await encodeConfigQuery(state);
  const dark = origin + withExtras(params, "dark", "svg");
  const light = origin + withExtras(params, "light", "svg");
  const alt = `${state.presetName} — dynimage`;
  const snippet =
    `<a href="${linkHref}">\n` +
    `  <picture>\n` +
    `    <source media="(prefers-color-scheme: dark)" srcset="${dark}">\n` +
    `    <source media="(prefers-color-scheme: light)" srcset="${light}">\n` +
    `    <img src="${dark}" alt="${alt}">\n` +
    `  </picture>\n` +
    `</a>`;
  return { snippet, tier };
}
