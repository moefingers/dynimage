// Hardened GitHub OAuth user-info fetch (Stab#23). Better Auth's default
// github getUserInfo (@better-auth/core github.ts) fetches GET /user and, on
// ANY fetch error, returns null with NO retry → the callback then throws
// `unable_to_get_user_info` and 302s to /?error=…. A freshly-minted OAuth
// access token's FIRST /user call can transiently 401/5xx (GitHub token
// propagation lag) — which is exactly the "first OAuth errors, retry works"
// bug Mo hit. We override `options.getUserInfo` (a supported hook) with a
// version that RETRIES transient failures on both /user and /user/emails.
//
// /user/emails matters because most accounts (incl. moefingers) keep their
// email PRIVATE — /user returns email:null, so the verified email (which
// makes OAuth users email-verified → able to publish, §3) only comes from
// /user/emails. Making that fetch robust too prevents a private-email user
// from landing without a verified email.
//
// Pure (only global fetch) → unit-testable by stubbing fetch.

type GithubProfile = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
};

type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: "public" | "private" | null;
};

export type GithubUserInfo = {
  user: {
    // Stringified to match Better Auth's getUserInfo option type (it
    // stringifies the provider id internally anyway → identical value, so
    // account linking is unchanged vs the default provider).
    id: string;
    name: string;
    email: string | undefined;
    image: string;
    emailVerified: boolean;
  };
  data: GithubProfile;
} | null;

const GITHUB_API = "https://api.github.com";
const DEFAULT_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Exponential-ish backoff with a small floor: 150, 300, 600ms.
function backoffMs(attempt: number): number {
  return 150 * 2 ** attempt;
}

// A status is transient (worth retrying) if it's a 5xx, a rate-limit (429),
// or a 401/403 — the latter two cover a just-issued token not yet valid
// across GitHub's API and secondary-rate-limit blips. A 404/422 is NOT
// transient (real client error) → don't retry.
function isTransient(status: number): boolean {
  return status >= 500 || status === 429 || status === 401 || status === 403;
}

export async function ghFetchJson<T>(
  url: string,
  accessToken: string,
  retries = DEFAULT_RETRIES,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${accessToken}`,
          "user-agent": "dynimage",
          accept: "application/vnd.github+json",
        },
      });
      if (res.ok) return (await res.json()) as T;
      if (attempt < retries && isTransient(res.status)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return null; // non-transient, or retries exhausted
    } catch {
      // network error → retry until exhausted
      if (attempt < retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Better Auth `github.getUserInfo` override. Returns the same shape as the
 * default, but resilient to transient GitHub API failures and robust for
 * private-email accounts.
 */
export async function githubGetUserInfo(token: {
  accessToken?: string | null;
}): Promise<GithubUserInfo> {
  const accessToken = token?.accessToken;
  if (!accessToken) return null;

  const profile = await ghFetchJson<GithubProfile>(
    `${GITHUB_API}/user`,
    accessToken,
  );
  // No id ⇒ the callback would throw unable_to_get_user_info. After retries,
  // a genuine failure still returns null (same terminal behavior as before,
  // but only after real repeated failure — not a first-call blip).
  if (!profile || profile.id == null) return null;

  const emails =
    (await ghFetchJson<GithubEmail[]>(
      `${GITHUB_API}/user/emails`,
      accessToken,
    )) ?? [];

  // Private email ⇒ profile.email is null; recover the primary (prefer
  // verified) from /user/emails.
  let email: string | undefined = profile.email ?? undefined;
  if (!email && emails.length > 0) {
    email = (
      emails.find((e) => e.primary && e.verified) ??
      emails.find((e) => e.primary) ??
      emails[0]
    )?.email;
  }
  const emailVerified =
    emails.find((e) => e.email === email)?.verified ?? false;

  return {
    user: {
      id: String(profile.id),
      name: profile.name || profile.login || "",
      email,
      image: profile.avatar_url,
      emailVerified,
    },
    data: profile,
  };
}
