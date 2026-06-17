import { graphql } from "@octokit/graphql";

// Next's incremental fetch cache (the legacy per-request cache). The SEAM
// path (lib/data/seam.ts) deliberately opts OUT of this so the L2 cache is
// the SOLE upstream-rate governor (spec invariant §14.4) — double-caching
// would let one layer serve staler than the other expects. The legacy atom
// path keeps it for backward-compatible behavior with current cards.
const cachedFetch: typeof fetch = (input, init) =>
  fetch(input as RequestInfo, { ...init, next: { revalidate: 300 } });

export function appToken(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) {
    throw new Error(
      "GITHUB_TOKEN is not set. Create a fine-grained PAT with public " +
        "read access and add it to .env.local (and Vercel envs).",
    );
  }
  return t;
}

// GraphQL client. Backward compatible: `gh()` → app token + Next fetch
// cache (current behavior, used by the legacy atoms the cards still call).
// The seam passes an explicit per-render token (mercy ladder) and
// `cached: false` so L2 governs freshness alone.
export function gh(opts?: { token?: string; cached?: boolean }) {
  const fetchImpl = opts?.cached === false ? fetch : cachedFetch;
  return graphql.defaults({
    headers: { authorization: `bearer ${opts?.token ?? appToken()}` },
    request: { fetch: fetchImpl },
  });
}

export type Gh = ReturnType<typeof gh>;
