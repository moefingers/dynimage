// How large a request body Better Auth's route reads. `/api/auth/*` is
// public, and Better Auth validates a body before any of its own code runs:
// better-call parses it, and zod builds one issue per failing element of an
// array schema with no maximum, which `/sign-in/social`'s `scopes` is (about
// 240 MB and a second of CPU per 0.5 MB of body, measured on marcan; no
// better-auth version bounds it). zod's fix (GHSA-mrhx-c7xc-m3w5) helps only
// arrays that have a maximum, and neither Better Auth nor Next offers a size
// limit on this handler. So the route refuses here, before Better Auth reads
// anything.
//
// The body is read only up to the limit, counting the bytes as they arrive,
// whatever `content-length` says, and Better Auth is handed a request rebuilt
// from those bytes. A request with no body passes as it came.
//
// Ported from OutlastSite's OUT-1513 (lib/auth-body-limit.ts,
// lib/net/read-body-up-to.ts).

/**
 * The most Better Auth's route reads of a request's body: 32 KiB.
 *
 * The largest body a real dynimage page sends is `/sign-in/social` from
 * auth-form.tsx, whose `callbackURL` is the page's own `?redirect=`, capped
 * at REDIRECT_MAX_CHARS (lib/auth/redirect.ts). At worst every character is
 * a control character that JSON writes as `\u0001` (6 bytes): about 12.3 KB
 * of body (the test computes it). Real sign-ins are under 1 KB. Sign-up and
 * email sign-in carry a name, an email and a password, far smaller. So this
 * is about 2.6 times the largest real body.
 *
 * A body at this size that fails every element of an unbounded array still
 * costs something, which is why `scopes` is refused outright (below).
 */
export const AUTH_BODY_LIMIT_BYTES = 32 * 1024;

// better-call's own test for a JSON body (better-call dist/utils.mjs), so
// the scopes check below sees every body Better Auth would parse as JSON.
// Form and multipart bodies are parsed into flat strings, never arrays.
const JSON_CONTENT_TYPE = /^application\/([a-z0-9.+-]*\+)?json/i;

/**
 * Whether a JSON body carries a top-level `scopes` field. dynimage never
 * sends one (it calls signIn.social with a provider and a callbackURL, and
 * never linkSocial), and Better Auth validates `scopes` on `/sign-in/social`
 * and `/link-social` as an array with no maximum, building one zod issue per
 * failing element. A body that doesn't parse passes on: Better Auth answers
 * it with a single 400.
 */
function carriesScopes(request: Request, bytes: Uint8Array): boolean {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!JSON_CONTENT_TYPE.test(type)) return false;
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return false;
  }
  return (
    typeof body === "object" && body !== null && Object.hasOwn(body, "scopes")
  );
}

export type BodyUpTo =
  | { readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly failed: "tooLarge" | "unreadable" };

/**
 * Reads a request's body whole, up to `limitBytes`, counting the bytes as
 * they arrive: `content-length` can be absent or wrong, so it's the stream
 * that counts. Past the limit the reading stops, the stream is cancelled and
 * the rest is never held.
 */
export async function readBodyUpTo(
  request: Request,
  limitBytes: number,
): Promise<BodyUpTo> {
  if (request.body === null) return { bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limitBytes) {
        await reader.cancel("over the limit").catch(() => undefined);
        return { failed: "tooLarge" };
      }
      chunks.push(value);
    }
  } catch {
    return { failed: "unreadable" };
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes };
}

type Handler = (request: Request) => Promise<Response>;

// Over the limit: in Better Auth's error shape, and logged by path alone,
// since nothing real should ever reach it.
function tooLarge(request: Request): Response {
  console.warn("[auth-body-limit] refused a body over the limit", {
    path: new URL(request.url).pathname,
    limitBytes: AUTH_BODY_LIMIT_BYTES,
  });
  return Response.json(
    { code: "BODY_TOO_LARGE", message: "This request is too large." },
    { status: 413 },
  );
}

/**
 * `handler`, refusing before it runs a request whose body passes
 * `AUTH_BODY_LIMIT_BYTES` (413) or whose JSON body carries `scopes` (400).
 */
export function refuseOversizedAuthBody(handler: Handler): Handler {
  return async (request) => {
    if (request.body === null) return handler(request);
    if (Number(request.headers.get("content-length")) > AUTH_BODY_LIMIT_BYTES) {
      await request.body
        .cancel("over the auth route's limit")
        .catch(() => undefined);
      return tooLarge(request);
    }
    const read = await readBodyUpTo(request, AUTH_BODY_LIMIT_BYTES);
    if ("failed" in read) {
      return read.failed === "tooLarge"
        ? tooLarge(request)
        : Response.json(
            {
              code: "BODY_UNREADABLE",
              message: "This request could not be read.",
            },
            { status: 400 },
          );
    }
    if (carriesScopes(request, read.bytes)) {
      return Response.json(
        {
          code: "SCOPES_NOT_ALLOWED",
          message: "This sign-in does not accept requested scopes.",
        },
        { status: 400 },
      );
    }
    // Rebuilt from its parts. Never `new Request(request, ...)`: Next hands a
    // route a Proxy of the request, which has no Request brand, so the
    // constructor reads it as a URL and throws, failing every POST.
    return handler(
      new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: read.bytes,
        signal: request.signal,
      }),
    );
  };
}
