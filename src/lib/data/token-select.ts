import { getDecryptedSecret } from "./vault";

// Token selection — the mercy ladder (spec §7). Picks which token a given
// render's upstream calls use:
//
//   authenticated + has stored PAT → THEIR token  (their 5k/hr; their
//                                                   misses never burn ours)
//   otherwise                      → shared app token (our quota, gated by
//                                                       our rate limits)
//
// Anonymous front-line stays on the shared app token. The decrypted secret
// lives in memory for one render and is never logged/returned to a client.
//
// SCALING NOTE (scout ToS / spec §9): do NOT add a shared-token POOL to
// raise the anonymous ceiling — pooling PATs past 5k/hr is the ToS
// gray-to-red move. If we ever need anonymous headroom, the correct path
// is a GitHub App (installation tokens), not PAT rotation.

export type OwnerContext = { userId: string } | null; // null = anonymous

export type SelectedToken = {
  /** the bearer token to use upstream — NEVER log this. */
  token: string;
  source: "app" | "pat";
  ownerId: string | null;
  /** vault credential id when source="pat" (for last_used + per-PAT metering). */
  patId: string | null;
};

function appToken(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) {
    throw new Error(
      "GITHUB_TOKEN (shared app token) is not set — the anonymous/fallback " +
        "render path requires it.",
    );
  }
  return t;
}

/**
 * Select the upstream token for this render. `requirePat` (used for
 * private-scope reads) makes the absence of a user token a hard error
 * rather than silently falling back to the app token (which can't read
 * private data anyway).
 */
export async function selectToken(
  owner: OwnerContext,
  opts: { provider?: "github"; requirePat?: boolean } = {},
): Promise<SelectedToken> {
  const provider = opts.provider ?? "github";

  if (owner) {
    const cred = await getDecryptedSecret({ userId: owner.userId, provider });
    if (cred) {
      return {
        token: cred.secret,
        source: "pat",
        ownerId: owner.userId,
        patId: cred.id,
      };
    }
    // OAuth access tokens (Better Auth `account` table) are the primary
    // private-data path (spec §3) and a natural extension point here —
    // wired in Wave 2 alongside session resolution.
  }

  if (opts.requirePat) {
    throw new Error(
      "This read requires the owner's own token (private data), but none is " +
        "on file.",
    );
  }

  return {
    token: appToken(),
    source: "app",
    ownerId: owner?.userId ?? null,
    patId: null,
  };
}
