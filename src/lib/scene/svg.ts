// Shared SVG helpers for element modules. Reuses the card-system
// primitives (esc, fmtInt) so there's one escaping implementation.
export { esc, fmtInt } from "@/lib/cards/svg-helpers";

// Font stack: for LIVE svg we lean on the viewer's OS fonts (ui-sans-serif
// resolves client-side). For RASTER (png/webp/avif) the server has no such
// fonts, so the scene renderer embeds "Noto Sans" once at scene scope and
// elements prefer it — same approach `streak` uses for its rasterized SVG.
export function fontStack(raster: boolean): string {
  return raster
    ? `"Noto Sans", sans-serif`
    : `ui-sans-serif, system-ui, sans-serif`;
}

export function monoStack(raster: boolean): string {
  return raster
    ? `"Noto Sans", monospace`
    : `ui-monospace, SFMono-Regular, Menlo, monospace`;
}

// Resolve a small color keyword against the theme, or pass through a hex.
import type { Theme } from "@/lib/cards/types";
export function themeColor(
  theme: Theme,
  spec: string | undefined,
  fallback: keyof Theme,
): string {
  if (!spec) return theme[fallback] as string;
  if (/^#[0-9a-fA-F]{6}$/.test(spec)) return spec;
  switch (spec) {
    case "text":
      return theme.text;
    case "muted":
      return theme.textMuted;
    case "accent":
      return theme.accent;
    case "bg":
      return theme.bg;
    case "stroke":
      return theme.stroke;
    case "gradient":
      return theme.gradient;
    default:
      return theme[fallback] as string;
  }
}
