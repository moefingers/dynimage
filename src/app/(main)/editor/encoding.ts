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
// The chosen theme is appended as &theme= (a FIXED palette for all viewers,
// per design — see chosenTheme below); the embed is a single themed <img>.
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
  // For ?scene=/?c= the scene already carries canvas.theme; an explicit
  // &theme= mirrors/overrides it (render resolveSceneTheme honors the
  // param), and for the ?preset= Tier-0 path it's how the chosen theme
  // reaches the build.
  p.set("theme", theme);
  if (format !== "svg") p.set("format", format);
  return `/api/render?${p.toString()}`;
}

// The chosen theme (6-swatch) is FIXED — it renders for EVERY viewer in
// both color-scheme modes (design ruling: WYSIWYG; themed banners are
// self-contained and read on any GitHub appearance). It lives on the
// scene's canvas.theme; an explicit &theme= mirrors it so the ?preset=
// Tier-0 path also honors it. (BUG A: previously the light/dark TOGGLE
// name was passed as the theme, so ocean/ember/… never reached the URL.)
function chosenTheme(state: ConfigState): string {
  return state.scene.canvas.theme ?? "dark";
}

// A single preview URL (same-origin relative). Theme is the chosen palette,
// independent of the preview's light/dark PAGE-background toggle.
export async function previewUrl(
  state: ConfigState,
  format = "svg",
): Promise<string> {
  const { params } = await encodeConfigQuery(state);
  return withExtras(params, chosenTheme(state), format);
}

// The copy-paste embed snippet. Fixed-theme basic path → a single <img>
// (the chosen theme for everyone), matching real flagship-README usage
// (no <picture> split). An explicit "Adaptive" split is a deferred option.
export async function embedSnippet(
  state: ConfigState,
  origin: string,
  linkHref: string,
): Promise<{ snippet: string; tier: string }> {
  const { params, tier } = await encodeConfigQuery(state);
  const url = origin + withExtras(params, chosenTheme(state), "svg");
  const alt = `${state.presetName} — dynimage`;
  const snippet =
    `<a href="${linkHref}">\n` + `  <img src="${url}" alt="${alt}">\n` + `</a>`;
  return { snippet, tier };
}
