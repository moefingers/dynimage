// Where a sign-in returns to: the sign-in page's `?redirect=`, as the
// GitHub sign-in's `callbackURL` and the email sign-in's router.push.

/**
 * The longest `?redirect=` a sign-in honors. A real one is a path in this
 * app, a few hundred characters at most. Capping it bounds the largest body
 * a real sign-in sends to the auth route (see AUTH_BODY_LIMIT_BYTES in
 * ./body-limit.ts): without it, a URL at Vercel's 14 KB limit could make a
 * ~28.7 KB `/sign-in/social` body.
 */
export const REDIRECT_MAX_CHARS = 2048;

/**
 * Open-redirect guard. Only a root-relative path or a same-origin absolute
 * URL is allowed, never an off-site URL (post-auth open redirect, phishing),
 * and nothing longer than REDIRECT_MAX_CHARS. Anything else falls back to
 * /account. `origin` is the page's own (window.location.origin in the
 * browser); without it only root-relative paths pass.
 */
export function safeRedirect(raw: string | null, origin?: string): string {
  if (!raw || raw.length > REDIRECT_MAX_CHARS) return "/account";
  // root-relative (but NOT protocol-relative "//evil.com")
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (origin) {
    try {
      const u = new URL(raw, origin);
      if (u.origin === origin) return u.pathname + u.search + u.hash;
    } catch {
      /* malformed → fall through */
    }
  }
  return "/account";
}
