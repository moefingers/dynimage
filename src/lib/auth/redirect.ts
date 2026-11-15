// Where a sign-in returns to: the sign-in page's `?redirect=`, as the
// GitHub sign-in's `callbackURL` and the email sign-in's router.push.

/**
 * The longest return target a sign-in keeps whole. The editor sends its
 * whole scene in the target (`/editor?s=<base64url>`, Editor.tsx and
 * AssetPicker.tsx), about 1.9 KB for a stock preset and more as it grows;
 * the sign-in page's own URL can't pass Vercel's 14 KB limit anyway, so this
 * never cuts a real one. A longer target keeps its path alone (`/editor`,
 * whose draft also lives in localStorage).
 *
 * safeRedirect's result is plain ASCII with no `"`, `\` or control
 * characters (URL serialization percent-encodes everything else), so JSON
 * carries it one byte per character: a GitHub sign-in's body stays under
 * about 16.4 KB (see AUTH_BODY_LIMIT_BYTES in ./body-limit.ts).
 */
export const REDIRECT_MAX_CHARS = 16 * 1024;

const FALLBACK = "/account";

// Resolves root-relative targets when the page's origin isn't known (a
// server render); never returned.
const NO_ORIGIN = "https://redirect.invalid";

// Backslashes and control characters: URL parsing reads "/\evil.com" and
// "/<tab>/evil.com" as another host, so they are refused before parsing, as
// Better Auth's own callbackURL check does.
const UNSAFE = /[\\\u0000-\u001f\u007f]/;

/**
 * Open-redirect guard. Only a target on this site's own origin is kept,
 * never an off-site URL (post-auth open redirect, phishing). The result is
 * the target's path, query and hash, normalized by the URL parser; anything
 * else falls back to /account. `origin` is the page's own
 * (window.location.origin in the browser); without it only root-relative
 * paths pass.
 */
export function safeRedirect(raw: string | null, origin?: string): string {
  if (!raw || UNSAFE.test(raw)) return FALLBACK;
  if (!origin && !raw.startsWith("/")) return FALLBACK;
  const base = new URL(origin ?? NO_ORIGIN);
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== base.origin) return FALLBACK;
  const target = url.pathname + url.search + url.hash;
  if (target.length <= REDIRECT_MAX_CHARS) return target;
  return url.pathname.length <= REDIRECT_MAX_CHARS ? url.pathname : FALLBACK;
}
