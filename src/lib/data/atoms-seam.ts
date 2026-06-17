import { gh } from "./client";
import { defineAtom } from "./seam";
import {
  fetchUserOverview,
  fetchUserContributions,
  fetchUserLifetime,
  fetchUserTopLanguages,
  type UserOverview,
  type UserContributions,
  type UserLifetime,
  type UserTopLanguages,
} from "./atoms";
import {
  fetchRacer,
  conditionalFetchRacer,
  type NitrotypeRacer,
} from "./nitrotype";

// ─────────────────────────────────────────────────────────────────────
// The SEAM atom registry — token-aware (mercy ladder), L2-cached,
// metered-on-miss versions of every data atom (spec §6/§7). This is the
// standalone callable the Wave-2 dispatch wiring will use.
//
// Kept in its OWN module (not atoms.ts / nitrotype.ts) on purpose: it
// imports the seam, which pulls Neon + Upstash + drizzle. The cards import
// atoms.ts / nitrotype.ts directly, so keeping the seam out of those files
// keeps those heavy deps OUT of the edge card bundle (hotspot #2 / the
// registry-runtime bundle discipline).
//
// Per-metric TTLs (spec §6): lifetime → hours; contributions/streak →
// ~15m (the volatile one); overview/languages → ~30m–hours.
// ─────────────────────────────────────────────────────────────────────

const MIN = 60_000;

export const githubAtoms = {
  userOverview: defineAtom<{ login: string }, UserOverview>({
    provider: "github",
    metric: "user-overview",
    ttlMs: 30 * MIN,
    subjectOf: (p) => p.login,
    fetch: (p, token) =>
      fetchUserOverview(p.login, gh({ token: token.token, cached: false })),
  }),
  userContributions: defineAtom<{ login: string }, UserContributions>({
    provider: "github",
    metric: "user-contributions",
    ttlMs: 15 * MIN,
    subjectOf: (p) => p.login,
    // contributionsCollection includes the owner's PRIVATE contributions on
    // their own token (totalCommitsLastYear via restrictedContributionsCount;
    // streaks/total via the private-inclusive calendar). Vantage-sensitive.
    vantageSensitive: true,
    fetch: (p, token) =>
      fetchUserContributions(
        p.login,
        gh({ token: token.token, cached: false }),
      ),
  }),
  userLifetime: defineAtom<{ login: string }, UserLifetime>({
    provider: "github",
    metric: "user-lifetime",
    ttlMs: 6 * 60 * MIN,
    subjectOf: (p) => p.login,
    // Aggregates contributionsCollection across years → also private-inclusive
    // on the owner's token. Vantage-sensitive.
    vantageSensitive: true,
    fetch: (p, token) =>
      fetchUserLifetime(p.login, gh({ token: token.token, cached: false })),
  }),
  userTopLanguages: defineAtom<
    { login: string; limit?: number },
    UserTopLanguages
  >({
    provider: "github",
    metric: "user-top-languages",
    ttlMs: 6 * 60 * MIN,
    subjectOf: (p) => p.login,
    fetch: (p, token) =>
      fetchUserTopLanguages(
        p.login,
        gh({ token: token.token, cached: false }),
        p.limit,
      ),
  }),
};

export const nitrotypeAtoms = {
  racer: defineAtom<{ username: string }, NitrotypeRacer>({
    provider: "nitrotype",
    metric: "racer",
    ttlMs: 30 * MIN,
    subjectOf: (p) => p.username,
    // nitrotype carries no token; conditionalFetch (ETag-aware) is the
    // real path, `fetch` is the non-conditional fallback.
    fetch: (p) => fetchRacer(p.username),
    conditionalFetch: (p, _token, prevEtag) =>
      conditionalFetchRacer(p.username, prevEtag),
  }),
};
