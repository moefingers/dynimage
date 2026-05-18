import { gh } from "./client";
import type { DedupeCache } from "./cache";

// ─── Atom factory ────────────────────────────────────────────────────
//
// `atom()` turns a raw fetcher into a deduped query function. Every
// atom has a stable `name` used as part of the cache key. Cards
// call atoms with the optional `cache` arg; when present, in-flight
// duplicates collapse to one promise.

function atom<TParams, TData>(
  name: string,
  fetcher: (params: TParams) => Promise<TData>,
): (params: TParams, cache?: DedupeCache) => Promise<TData> {
  return (params, cache) => {
    if (!cache) return fetcher(params);
    const key = `${name}:${JSON.stringify(params)}`;
    return cache.get(key, () => fetcher(params));
  };
}

// ─── User-scoped atoms ───────────────────────────────────────────────

export type UserOverview = {
  login: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string;
  followers: number;
  following: number;
  publicRepoCount: number;
};

export const userOverview = atom(
  "userOverview",
  async ({ login }: { login: string }): Promise<UserOverview> => {
    const res = await gh()<{
      user: {
        login: string;
        name: string | null;
        bio: string | null;
        avatarUrl: string;
        followers: { totalCount: number };
        following: { totalCount: number };
        repositories: { totalCount: number };
      } | null;
    }>(
      `query($login: String!) {
        user(login: $login) {
          login
          name
          bio
          avatarUrl
          followers { totalCount }
          following { totalCount }
          repositories(ownerAffiliations: OWNER, privacy: PUBLIC) {
            totalCount
          }
        }
      }`,
      { login },
    );
    if (!res.user) throw new Error(`User "${login}" not found`);
    return {
      login: res.user.login,
      name: res.user.name,
      bio: res.user.bio,
      avatarUrl: res.user.avatarUrl,
      followers: res.user.followers.totalCount,
      following: res.user.following.totalCount,
      publicRepoCount: res.user.repositories.totalCount,
    };
  },
);

export type UserContributions = {
  login: string;
  totalCommitsLastYear: number;
  totalContributions: number;
  currentStreak: number;
  longestStreak: number;
  firstContribution: string | null;
};

export const userContributions = atom(
  "userContributions",
  async ({ login }: { login: string }): Promise<UserContributions> => {
    const res = await gh()<{
      user: {
        login: string;
        contributionsCollection: {
          totalCommitContributions: number;
          restrictedContributionsCount: number;
          contributionCalendar: {
            totalContributions: number;
            weeks: Array<{
              contributionDays: Array<{
                date: string;
                contributionCount: number;
              }>;
            }>;
          };
        };
      } | null;
    }>(
      `query($login: String!) {
        user(login: $login) {
          login
          contributionsCollection {
            totalCommitContributions
            restrictedContributionsCount
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }`,
      { login },
    );
    if (!res.user) throw new Error(`User "${login}" not found`);
    const c = res.user.contributionsCollection;

    const days = c.contributionCalendar.weeks
      .flatMap((w) => w.contributionDays)
      .sort((a, b) => a.date.localeCompare(b.date));

    let longestStreak = 0;
    let running = 0;
    let firstContribution: string | null = null;
    for (const d of days) {
      if (d.contributionCount > 0) {
        if (!firstContribution) firstContribution = d.date;
        running += 1;
        longestStreak = Math.max(longestStreak, running);
      } else {
        running = 0;
      }
    }
    let currentStreak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if ((days[i]?.contributionCount ?? 0) > 0) currentStreak += 1;
      else break;
    }

    return {
      login: res.user.login,
      totalCommitsLastYear:
        c.totalCommitContributions + c.restrictedContributionsCount,
      totalContributions: c.contributionCalendar.totalContributions,
      currentStreak,
      longestStreak,
      firstContribution,
    };
  },
);

export type UserLifetime = {
  login: string;
  /**
   * Sum of GitHub commit contributions (public + restricted) across all
   * yearly buckets from {@link yearsRange.start} to the current year.
   * Approximate: contributionsCollection's `from`/`to` window can't
   * exceed a year, so we batch one aliased query per year in a single
   * GraphQL request.
   */
  lifetimeCommits: number;
  yearsRange: { start: number; end: number };
};

export const userLifetime = atom(
  "userLifetime",
  async ({ login }: { login: string }): Promise<UserLifetime> => {
    const now = new Date();
    const endYear = now.getUTCFullYear();
    // 2016 is the floor — earlier years are diminishing returns for the
    // banner subtext, and adding more aliases bloats the response size.
    // GitHub-joining dates older than this will lose a small amount of
    // historical context, which we accept for the simpler query shape.
    const startYear = 2016;
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    // Aliased contributionsCollection queries — one per year, all in one
    // round trip. The Next fetch cache dedupes across requests.
    const aliases = years
      .map(
        (y) =>
          `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { totalCommitContributions restrictedContributionsCount }`,
      )
      .join("\n            ");

    type Bucket = {
      totalCommitContributions: number;
      restrictedContributionsCount: number;
    };
    const res = await gh()<{
      user: ({ login: string } & Record<string, Bucket>) | null;
    }>(
      `query($login: String!) {
        user(login: $login) {
          login
          ${aliases}
        }
      }`,
      { login },
    );
    if (!res.user) throw new Error(`User "${login}" not found`);
    let total = 0;
    for (const y of years) {
      const b = (res.user as unknown as Record<string, Bucket | undefined>)[
        `y${y}`
      ];
      if (b)
        total += b.totalCommitContributions + b.restrictedContributionsCount;
    }
    return {
      login: res.user.login,
      lifetimeCommits: total,
      yearsRange: { start: startYear, end: endYear },
    };
  },
);

export type UserTopLanguages = Array<{
  name: string;
  color: string | null;
  bytes: number;
}>;

export const userTopLanguages = atom(
  "userTopLanguages",
  async ({
    login,
    limit = 6,
  }: {
    login: string;
    limit?: number;
  }): Promise<UserTopLanguages> => {
    const res = await gh()<{
      user: {
        repositories: {
          nodes: Array<{
            languages: {
              edges: Array<{
                size: number;
                node: { name: string; color: string | null };
              }>;
            };
          }>;
        };
      } | null;
    }>(
      `query($login: String!) {
        user(login: $login) {
          repositories(
            first: 100
            ownerAffiliations: OWNER
            privacy: PUBLIC
            orderBy: { field: PUSHED_AT, direction: DESC }
          ) {
            nodes {
              languages(first: 5, orderBy: { field: SIZE, direction: DESC }) {
                edges {
                  size
                  node { name color }
                }
              }
            }
          }
        }
      }`,
      { login },
    );
    if (!res.user) throw new Error(`User "${login}" not found`);
    const totals = new Map<string, { color: string | null; bytes: number }>();
    for (const repo of res.user.repositories.nodes) {
      for (const edge of repo.languages.edges) {
        const prev = totals.get(edge.node.name);
        totals.set(edge.node.name, {
          color: edge.node.color,
          bytes: (prev?.bytes ?? 0) + edge.size,
        });
      }
    }
    return Array.from(totals.entries())
      .map(([name, v]) => ({ name, color: v.color, bytes: v.bytes }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, limit);
  },
);
