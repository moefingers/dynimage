// ─────────────────────────────────────────────────────────────────────
// Embed snippet (spec §8, funnel §2 stage 8). A single <a>-wrapped <img>
// at the published config's chosen theme + a stable cache-bust.
//
// Design §3 is FIXED-CHOSEN-THEME, not adaptive: the user picks a theme in
// the editor and it's baked into the stored config (canvas.theme), so the
// embed must render THAT theme — not a prefers-color-scheme dark/light
// split that would override the user's choice. We therefore emit the bare
// /i/<id> URL with NO ?theme= (the stored theme is authoritative; appending
// ?theme= could override it). The permanent URL also carries NO ?v= (that's
// the transient owner-triggered refresh) — only ?cb= for camo freshness,
// stable per publish.
//
// The per-(id,theme) render machinery (render-embed.ts) is intentionally
// kept for ?theme= overrides + a future Adaptive option (design backlog);
// this snippet just doesn't emit a theme.
// ─────────────────────────────────────────────────────────────────────

export type SnippetOptions = {
  id: string;
  /** absolute origin, e.g. https://dynimage.vercel.app */
  baseUrl: string;
  /** image format the snippet points at (svg keeps vector + animation). */
  format?: string;
  /** alt text on the <img>. */
  alt?: string;
  /** <a> target. Defaults to the app origin. */
  href?: string;
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

/**
 * Build the embed image URL. `theme` is optional and normally OMITTED for
 * the published snippet (the stored config theme is authoritative); it
 * exists for ?theme= overrides / future Adaptive callers.
 */
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
  const alt = esc(o.alt ?? "dynimage embed");
  const href = esc(o.href ?? o.baseUrl);
  // No theme= — the stored config theme renders by default.
  const src = esc(embedUrl({ baseUrl: o.baseUrl, id: o.id, format, cb: o.cb }));

  return [
    `<a href="${href}">`,
    `  <img src="${src}" alt="${alt}" />`,
    `</a>`,
  ].join("\n");
}
