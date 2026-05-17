import type { CardFormat, AnyCard, Theme } from "./types";
import type { LayoutSpec } from "./spec";
import { DedupeCache } from "@/lib/data/cache";
import { getCard } from "./registry-all";
import { resolveTheme } from "./theme";

// Compound is a meta-card: it composes other cards into a single image.
// It deliberately is NOT registered in the card registry — instead it
// has its own dispatcher invoked by /api/render. This avoids the
// chicken-and-egg of "card whose data is a layout of other cards" and
// enforces the depth = 1 rule (no compound-inside-compound) at the
// type-system level (LayoutSpec.cards[].type is a string referring to
// the card registry, which doesn't contain compound).

type SubCardResult = {
  x: number;
  y: number;
  w: number;
  h: number;
  body: string | Uint8Array;
  contentType: string;
};

async function renderSubCards(
  spec: LayoutSpec,
  format: CardFormat,
  theme: Theme,
  baseUrl: string,
): Promise<SubCardResult[]> {
  const cache = new DedupeCache();
  return Promise.all(
    spec.cards.map(async (subSpec) => {
      const card: AnyCard | null = getCard(subSpec.type);
      if (!card) {
        throw new Error(`Unknown card type "${subSpec.type}"`);
      }
      const renderer = card.formats[format];
      if (!renderer) {
        const supported = Object.keys(card.formats).join(", ");
        throw new Error(
          `Card "${subSpec.type}" does not support format ".${format}" (supports: ${supported})`,
        );
      }
      const parsed = card.input.safeParse(subSpec.input);
      if (!parsed.success) {
        throw new Error(
          `Invalid input for "${subSpec.type}": ${parsed.error.message}`,
        );
      }
      const data = await card.resolve(parsed.data, cache);
      const rendered = await renderer({
        data,
        theme,
        width: subSpec.w,
        height: subSpec.h,
        baseUrl,
      });
      return {
        x: subSpec.x,
        y: subSpec.y,
        w: subSpec.w,
        h: subSpec.h,
        body: rendered.body,
        contentType: rendered.contentType,
      };
    }),
  );
}

// Compose sub-SVGs into a single outer SVG via nested <svg> elements
// at the specified positions. Nested <svg> elements are standard SVG
// (each has its own coordinate system), and crucially they preserve
// SMIL animations and CSS keyframes inside each sub-card.
function composeSvg(
  spec: LayoutSpec,
  theme: Theme,
  subs: SubCardResult[],
): string {
  const inner = subs
    .map((s) => {
      const body = typeof s.body === "string" ? s.body : "";
      // Strip the outermost <svg ...> tag and its closing </svg> so we
      // can re-wrap with positioning. Each sub-SVG's inner content
      // becomes the body of a positioned nested <svg>.
      const innerSvg = stripOuterSvg(body);
      return `<svg x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" overflow="visible">${innerSvg}</svg>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.w}" height="${spec.h}" viewBox="0 0 ${spec.w} ${spec.h}">
  <rect width="${spec.w}" height="${spec.h}" fill="${theme.bg}"/>
  ${inner}
</svg>`;
}

function stripOuterSvg(svg: string): string {
  const open = svg.indexOf(">");
  const close = svg.lastIndexOf("</svg>");
  if (open === -1 || close === -1 || close <= open) return svg;
  return svg.slice(open + 1, close);
}

// Compose sub-renders into a single PNG via sharp's composite(). Each
// sub-card's body is passed as a raw PNG buffer; sharp stacks them at
// the specified positions over a theme-bg base canvas.
async function composeRaster(
  spec: LayoutSpec,
  theme: Theme,
  subs: SubCardResult[],
  outFormat: "png" | "webp" | "avif",
): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  // Parse the bg hex into RGB for sharp's create.background.
  const bg = hexToRgb(theme.bg) ?? { r: 0, g: 0, b: 0 };
  const base = sharp({
    create: {
      width: spec.w,
      height: spec.h,
      channels: 4,
      background: { ...bg, alpha: 1 },
    },
  });
  const layers = subs.map((s) => {
    const buf =
      typeof s.body === "string"
        ? Buffer.from(s.body)
        : Buffer.from(s.body.buffer, s.body.byteOffset, s.body.byteLength);
    return { input: buf, top: s.y, left: s.x };
  });
  let pipe = base.composite(layers);
  if (outFormat === "png") pipe = pipe.png();
  else if (outFormat === "webp") pipe = pipe.webp({ quality: 90 });
  else if (outFormat === "avif") pipe = pipe.avif({ quality: 65 });
  const out = await pipe.toBuffer();
  return new Uint8Array(out);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export type CompoundRenderResult = {
  body: string | Uint8Array;
  contentType: string;
};

// Public entry — given a LayoutSpec + format, fetch all sub-cards (with
// dedup) and compose. Errors are thrown for the caller to translate to
// HTTP responses; the dispatcher at /api/render owns response shaping.
export async function renderCompound(
  spec: LayoutSpec,
  format: CardFormat,
  baseUrl: string,
  searchParams?: URLSearchParams,
): Promise<CompoundRenderResult> {
  // Cross-cutting theme resolution: searchParams (per-request overrides)
  // win over the spec's named theme, which wins over the default.
  const themeParams = new URLSearchParams(searchParams);
  if (spec.theme && !themeParams.has("theme"))
    themeParams.set("theme", spec.theme);
  const theme = resolveTheme(themeParams);

  const subRenderFormat: CardFormat = format === "svg" ? "svg" : "png";
  const subs = await renderSubCards(spec, subRenderFormat, theme, baseUrl);

  if (format === "svg") {
    return {
      body: composeSvg(spec, theme, subs),
      contentType: "image/svg+xml; charset=utf-8",
    };
  }
  const body = await composeRaster(spec, theme, subs, format);
  const contentType =
    format === "png"
      ? "image/png"
      : format === "webp"
        ? "image/webp"
        : "image/avif";
  return { body, contentType };
}
