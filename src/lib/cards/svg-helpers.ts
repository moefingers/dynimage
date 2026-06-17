// Minimal helpers for assembling SVG strings safely.
// We hand-template rather than use a DOM lib because SVG output is
// hot-path code and the template is small enough to read directly.

// Conservative entity escape for text content inserted into SVG.
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Format a large integer with thousands separators (locale-neutral).
export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
