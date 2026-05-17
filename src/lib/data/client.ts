import { graphql } from "@octokit/graphql";

// Wrap fetch with Next's incremental cache so repeated upstream queries
// within the revalidate window are served from the shared data cache.
// Edge and Node both honor this — we only touch the global fetch.
const cachedFetch: typeof fetch = (input, init) =>
  fetch(input as RequestInfo, { ...init, next: { revalidate: 300 } });

function token(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) {
    throw new Error(
      "GITHUB_TOKEN is not set. Create a fine-grained PAT with public " +
        "read access and add it to .env.local (and Vercel envs).",
    );
  }
  return t;
}

// Single shared GraphQL client. Atoms call this rather than constructing
// their own client each time so the auth + cache config lives in one
// place and any future change (e.g. swapping in a per-team token) is a
// single-file edit.
export function gh() {
  return graphql.defaults({
    headers: { authorization: `bearer ${token()}` },
    request: { fetch: cachedFetch },
  });
}
