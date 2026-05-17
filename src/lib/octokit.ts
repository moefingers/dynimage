import { graphql } from "@octokit/graphql";

// Wrap fetch with Next's incremental cache so repeated upstream queries
// within the revalidate window are served from the shared data cache.
// Works on both Edge and Node runtimes because we only touch fetch.
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

export function gh() {
  return graphql.defaults({
    headers: { authorization: `bearer ${token()}` },
    request: { fetch: cachedFetch },
  });
}

// ── Card data shapes ──────────────────────────────────────────────────

export type CommitsData = {
  login: string;
  name: string | null;
  avatarUrl: string;
  totalCommitsLastYear: number;
  publicRepoCount: number;
};

const COMMITS_QUERY = `
  query($login: String!) {
    user(login: $login) {
      login
      name
      avatarUrl
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
      }
      repositories(ownerAffiliations: OWNER, privacy: PUBLIC) {
        totalCount
      }
    }
  }
`;

export async function fetchCommits(login: string): Promise<CommitsData> {
  const res = await gh()<{
    user: {
      login: string;
      name: string | null;
      avatarUrl: string;
      contributionsCollection: {
        totalCommitContributions: number;
        restrictedContributionsCount: number;
      };
      repositories: { totalCount: number };
    } | null;
  }>(COMMITS_QUERY, { login });
  if (!res.user) throw new Error(`User "${login}" not found`);
  const c = res.user.contributionsCollection;
  return {
    login: res.user.login,
    name: res.user.name,
    avatarUrl: res.user.avatarUrl,
    totalCommitsLastYear:
      c.totalCommitContributions + c.restrictedContributionsCount,
    publicRepoCount: res.user.repositories.totalCount,
  };
}

// ── Streak ────────────────────────────────────────────────────────────

export type StreakData = {
  login: string;
  currentStreak: number;
  longestStreak: number;
  totalContributions: number;
  firstContribution: string | null;
};

// We fetch the user's full contribution calendar via GraphQL.
// contributionsCollection without args defaults to the past year; for a
// true lifetime streak we'd need to walk year-by-year — left as a
// follow-up. For v0 the streak is computed over the past year.
const STREAK_QUERY = `
  query($login: String!) {
    user(login: $login) {
      login
      createdAt
      contributionsCollection {
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
  }
`;

export async function fetchStreak(login: string): Promise<StreakData> {
  const res = await gh()<{
    user: {
      login: string;
      createdAt: string;
      contributionsCollection: {
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
  }>(STREAK_QUERY, { login });
  if (!res.user) throw new Error(`User "${login}" not found`);

  const days = res.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .sort((a, b) => a.date.localeCompare(b.date));

  let currentStreak = 0;
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
  // Current streak = trailing run of consecutive days with contributions,
  // ending at the last day in the calendar.
  for (let i = days.length - 1; i >= 0; i--) {
    if ((days[i]?.contributionCount ?? 0) > 0) currentStreak += 1;
    else break;
  }

  return {
    login: res.user.login,
    currentStreak,
    longestStreak,
    totalContributions:
      res.user.contributionsCollection.contributionCalendar.totalContributions,
    firstContribution,
  };
}

// ── Portrait ──────────────────────────────────────────────────────────

export type PortraitData = {
  login: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string;
  publicRepoCount: number;
  followers: number;
  following: number;
  topLanguages: Array<{ name: string; color: string | null; bytes: number }>;
};

const PORTRAIT_QUERY = `
  query($login: String!) {
    user(login: $login) {
      login
      name
      bio
      avatarUrl
      followers { totalCount }
      following { totalCount }
      repositories(
        first: 100
        ownerAffiliations: OWNER
        privacy: PUBLIC
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        totalCount
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
  }
`;

export async function fetchPortrait(login: string): Promise<PortraitData> {
  const res = await gh()<{
    user: {
      login: string;
      name: string | null;
      bio: string | null;
      avatarUrl: string;
      followers: { totalCount: number };
      following: { totalCount: number };
      repositories: {
        totalCount: number;
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
  }>(PORTRAIT_QUERY, { login });
  if (!res.user) throw new Error(`User "${login}" not found`);

  const langTotals = new Map<string, { color: string | null; bytes: number }>();
  for (const repo of res.user.repositories.nodes) {
    for (const edge of repo.languages.edges) {
      const prev = langTotals.get(edge.node.name);
      langTotals.set(edge.node.name, {
        color: edge.node.color,
        bytes: (prev?.bytes ?? 0) + edge.size,
      });
    }
  }
  const topLanguages = Array.from(langTotals.entries())
    .map(([name, v]) => ({ name, color: v.color, bytes: v.bytes }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 6);

  return {
    login: res.user.login,
    name: res.user.name,
    bio: res.user.bio,
    avatarUrl: res.user.avatarUrl,
    publicRepoCount: res.user.repositories.totalCount,
    followers: res.user.followers.totalCount,
    following: res.user.following.totalCount,
    topLanguages,
  };
}
