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

// Build a CSS rule block for SVG <style>. When `responsive` is true we
// emit a light/dark pair guarded by @media (prefers-color-scheme).
// GitHub's camo proxy passes the SVG through unmodified, so the
// browser's media query resolves on the viewer's side. One URL,
// both themes — the right default for README embeds.
export function responsiveThemeStyle(opts: {
  light: { bg: string; text: string; textMuted: string; accent: string };
  dark: { bg: string; text: string; textMuted: string; accent: string };
}): string {
  const { light, dark } = opts;
  return `
    :root {
      --bg: ${light.bg};
      --text: ${light.text};
      --text-muted: ${light.textMuted};
      --accent: ${light.accent};
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: ${dark.bg};
        --text: ${dark.text};
        --text-muted: ${dark.textMuted};
        --accent: ${dark.accent};
      }
    }
  `;
}
