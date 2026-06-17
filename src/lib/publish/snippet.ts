// ─────────────────────────────────────────────────────────────────────
// Embed snippet (spec §8, funnel §2 stage 8). A full <a>-wrapped
// <picture> with a prefers-color-scheme theme split and a stable
// cache-bust. The permanent URL carries NO ?v= (that's the transient
// owner-triggered refresh) — only ?theme= for the split and ?cb= for
// camo freshness, which is stable per publish so the embed URL is stable.
// ─────────────────────────────────────────────────────────────────────

export type SnippetOptions = {
  id: string;
  /** absolute origin, e.g. https://dynimage.vercel.app */
  baseUrl: string;
  /** image format the snippet points at (svg keeps vector + animation). */
  format?: string;
  /** alt text on the fallback <img>. */
  alt?: string;
  /** <a> target. Defaults to the app origin. */
  href?: string;
  /** theme names for the dark/light split. */
  themes?: { dark: string; light: string };
  /** stable cache-bust token (e.g. publish/update epoch in base36). */
  cb?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the embed URL for a given theme (theme omitted → fallback img). */
export function embedUrl(o: {
  baseUrl: string;
  id: string;
  format: string;
  theme?: string;
  cb?: string;
}): string {
  const params = new URLSearchParams();
  if (o.theme) params.set("theme", o.theme);
  if (o.cb) params.set("cb", o.cb);
  const qs = params.toString();
  return `${o.baseUrl}/i/${o.id}.${o.format}${qs ? `?${qs}` : ""}`;
}

export function buildSnippet(o: SnippetOptions): string {
  const format = o.format ?? "svg";
  const themes = o.themes ?? { dark: "dark", light: "light" };
  const alt = esc(o.alt ?? "dynimage embed");
  const href = esc(o.href ?? o.baseUrl);
  const u = (theme?: string) =>
    esc(embedUrl({ baseUrl: o.baseUrl, id: o.id, format, theme, cb: o.cb }));

  return [
    `<a href="${href}">`,
    `  <picture>`,
    `    <source media="(prefers-color-scheme: dark)" srcset="${u(themes.dark)}" />`,
    `    <source media="(prefers-color-scheme: light)" srcset="${u(themes.light)}" />`,
    `    <img src="${u()}" alt="${alt}" />`,
    `  </picture>`,
    `</a>`,
  ].join("\n");
}
