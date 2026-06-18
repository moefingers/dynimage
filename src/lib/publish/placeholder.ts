// ─────────────────────────────────────────────────────────────────────
// Neutral placeholder for a DISABLED embed (spec §11 moderation). A
// disabled /i/<id> returns 410 Gone with this image instead of the
// original — a plain "embed removed" card, NOT an error and NOT the
// config. Sized to the original canvas so the README layout doesn't shift
// when camo swaps it in. Leaks nothing about the original (no owner, no
// scene content).
// ─────────────────────────────────────────────────────────────────────

const MIN = 16;
const MAX = 4096;
const DEFAULT_W = 480;
const DEFAULT_H = 240;

function clampDim(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) && n >= MIN && n <= MAX
    ? Math.round(n)
    : fallback;
}

/** Pull canvas dimensions from a (trusted-but-untyped) stored config. */
export function placeholderSize(config: unknown): { w: number; h: number } {
  const canvas = (config as { canvas?: { w?: unknown; h?: unknown } } | null)
    ?.canvas;
  return {
    w: clampDim(canvas?.w, DEFAULT_W),
    h: clampDim(canvas?.h, DEFAULT_H),
  };
}

/** Neutral "embed removed" SVG at the given size. Static text — no escaping needed. */
export function disabledPlaceholderSvg(w: number, h: number): string {
  const fontSize = Math.max(11, Math.min(w, h) * 0.09);
  const radius = Math.min(16, Math.min(w, h) * 0.06);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}" role="img" aria-label="embed removed">` +
    `<rect width="${w}" height="${h}" rx="${radius.toFixed(1)}" fill="#1f2937"/>` +
    `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="system-ui, -apple-system, Segoe UI, sans-serif" ` +
    `font-size="${fontSize.toFixed(1)}" fill="#9ca3af">embed removed</text>` +
    `</svg>`
  );
}
