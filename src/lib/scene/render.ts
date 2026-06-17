import { readFileSync } from "node:fs";
import path from "node:path";
import type { CardFormat, Theme } from "@/lib/cards/types";
import { resolveTheme } from "@/lib/cards/theme";
import { DedupeCache } from "@/lib/data/cache";
import type { Scene } from "./scene-spec";
import { getElement } from "./registry";
import { resolveBind } from "./bind";
import { resolveBoxes, type PlacedElement } from "./anchor";
import type {
  AnyElement,
  BoundValue,
  RenderedScene,
  ResolvedBox,
} from "./types";

// ─────────────────────────────────────────────────────────────────────
// Scene renderer — composes registered elements into one image.
//
// Pipeline (mirrors the card dispatcher's boundary discipline):
//   1. Resolve the theme once (canvas theme/bg + request overrides).
//   2. Per element: look up the module, validate `knobs` against its Zod
//      schema, resolve its `bind` (if any) via the bind layer.
//   3. Resolve every box in dependency order (transform + anchor/slots).
//   4. Render each element to a LOCAL-coord SVG fragment, NAMESPACE its
//      ids per element id (fixes compound id-collisions — Stabilization
//      #2), position via a nested <svg> (+ rotate), z-order, compose.
//   5. svg → return; png/webp/avif → rasterize the composed SVG once.
// ─────────────────────────────────────────────────────────────────────

// Lazily-cached embedded font for server-side rasterization (same trick
// as streak.ts — Vercel's node runtime ships no fonts).
let fontDataUriCached: string | null = null;
function fontDataUri(): string {
  if (fontDataUriCached) return fontDataUriCached;
  const buf = readFileSync(
    path.join(process.cwd(), "src/lib/cards/fonts/NotoSans-Regular.ttf"),
  );
  fontDataUriCached = `data:font/ttf;base64,${buf.toString("base64")}`;
  return fontDataUriCached;
}

// Prefix every internal id (and its references) in an element's fragment
// with a per-element namespace so two instances of the same element type
// can never collide on a <defs> id like "wash". THIS is the model-level
// fix for compound id-collisions.
function namespaceIds(fragment: string, ns: string): string {
  return fragment
    .replace(/\bid="([^"]+)"/g, `id="${ns}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${ns}$1)`)
    .replace(/(\bhref|\bxlink:href)="#([^"]+)"/g, `$1="#${ns}$2"`);
}

type Prepared = {
  id: string;
  element: AnyElement;
  knobs: unknown;
  bound: BoundValue | null;
  z: number;
};

async function prepareElements(
  scene: Scene,
  cache: DedupeCache,
): Promise<{ prepared: Prepared[]; placed: PlacedElement[] }> {
  const prepared: Prepared[] = [];
  const placed: PlacedElement[] = [];

  for (const spec of scene.elements) {
    const element = getElement(spec.type);
    if (!element) {
      throw new Error(`Unknown element type "${spec.type}".`);
    }
    const parsed = element.knobs.safeParse(spec.knobs ?? {});
    if (!parsed.success) {
      throw new Error(
        `Invalid knobs for element "${spec.id}" (${spec.type}): ${parsed.error.message}`,
      );
    }
    // Validate bind compatibility with the element's affinity.
    let bound: BoundValue | null = null;
    if (spec.bind) {
      if (element.bind.accepts === "none") {
        throw new Error(
          `Element "${spec.id}" (${spec.type}) does not accept a data bind.`,
        );
      }
      bound = await resolveBind(spec.bind, cache);
    }
    prepared.push({
      id: spec.id,
      element,
      knobs: parsed.data,
      bound,
      z: spec.transform?.z ?? 0,
    });
    placed.push({
      id: spec.id,
      element,
      transform: spec.transform,
      anchor: spec.anchor,
    });
  }
  return { prepared, placed };
}

function wrapFragment(fragment: string, box: ResolvedBox, ns: string): string {
  const namespaced = namespaceIds(fragment, ns);
  const inner = `<svg x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" viewBox="0 0 ${box.w.toFixed(2)} ${box.h.toFixed(2)}" overflow="visible">${namespaced}</svg>`;
  if (!box.rotate) return inner;
  const cx = (box.x + box.w / 2).toFixed(2);
  const cy = (box.y + box.h / 2).toFixed(2);
  return `<g transform="rotate(${box.rotate} ${cx} ${cy})">${inner}</g>`;
}

async function composeSvg(
  scene: Scene,
  theme: Theme,
  baseUrl: string,
  raster: boolean,
): Promise<string> {
  const cache = new DedupeCache();
  const { prepared, placed } = await prepareElements(scene, cache);
  const boxes = resolveBoxes(placed);

  // z-order: stable sort by z (ties keep declaration order).
  const order = prepared
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.z - b.p.z || a.i - b.i);

  const layers: string[] = [];
  for (const { p } of order) {
    const box = boxes.get(p.id)!;
    const fragment = await p.element.render({
      knobs: p.knobs,
      theme,
      box,
      bound: p.bound,
      baseUrl,
      raster,
    });
    layers.push(wrapFragment(fragment, box, `${p.id}__`));
  }

  const { w, h } = scene.canvas;
  const fontFace = raster
    ? `<style>@font-face{font-family:"Noto Sans";src:url("${fontDataUri()}") format("truetype");font-weight:100 900;font-style:normal;}</style>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>${fontFace}</defs>` +
    `<rect width="${w}" height="${h}" fill="${theme.bg}"/>` +
    layers.join("") +
    `</svg>`
  );
}

function resolveSceneTheme(scene: Scene, overrides?: URLSearchParams): Theme {
  const sp = new URLSearchParams(overrides);
  // Scene-declared theme/bg are the base; explicit request overrides win.
  if (scene.canvas.theme && !sp.has("theme"))
    sp.set("theme", scene.canvas.theme);
  if (scene.canvas.bg && !sp.has("bg")) {
    const bg = scene.canvas.bg.startsWith("#")
      ? scene.canvas.bg
      : `#${scene.canvas.bg}`;
    sp.set("bg", bg.slice(1));
  }
  return resolveTheme(sp);
}

// Public entry — render a validated Scene to the requested format.
export async function renderScene(
  scene: Scene,
  format: CardFormat,
  baseUrl: string,
  overrides?: URLSearchParams,
): Promise<RenderedScene> {
  const theme = resolveSceneTheme(scene, overrides);
  const raster = format !== "svg";
  const svg = await composeSvg(scene, theme, baseUrl, raster);

  if (format === "svg") {
    return { body: svg, contentType: "image/svg+xml; charset=utf-8" };
  }

  const sharp = (await import("sharp")).default;
  const pipeline = sharp(Buffer.from(svg), { density: 144 }).resize(
    scene.canvas.w,
    scene.canvas.h,
    { fit: "fill" },
  );
  if (format === "png") {
    const out = await pipeline.png().toBuffer();
    return { body: new Uint8Array(out), contentType: "image/png" };
  }
  if (format === "webp") {
    const out = await pipeline.webp({ quality: 90 }).toBuffer();
    return { body: new Uint8Array(out), contentType: "image/webp" };
  }
  const out = await pipeline.avif({ quality: 65 }).toBuffer();
  return { body: new Uint8Array(out), contentType: "image/avif" };
}
