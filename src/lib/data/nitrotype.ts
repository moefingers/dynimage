// Nitrotype racer atom. Wraps the nitrotype-api.vercel.app proxy that
// scrapes RACER_INFO from nitrotype.com (the public profile page embeds
// the full data blob inline). This is a separate atom so the orbit/typing
// banner cards can dedupe within one render the same way GitHub atoms do.
//
// The upstream proxy may sometimes return { error: "..." } with a 500 —
// that happens when nitrotype.com is rate-limiting or the username does
// not exist. We surface a typed error rather than a partial object.

import type { DedupeCache } from "./cache";
import type { FetchResult } from "./l2cache";

const NITROTYPE_API_BASE =
  process.env.NITROTYPE_API_BASE ?? "https://nitrotype-api.vercel.app";

export type NitrotypeRacer = {
  username: string;
  displayName: string | null;
  // Average WPM across the trailing 10 races.
  avgSpeed: number;
  // Highest WPM achieved at any point.
  highestSpeed: number;
  racesPlayed: number;
  // XP integer — proportional to total races + bonuses.
  experience: number;
  level: number;
  // Tier 1..5; 5 == top league.
  leagueTier: number;
  // Longest single race-session length, in races.
  longestSession: number;
  nitrosUsed: number;
  profileViews: number;
  // Unix seconds when the account was created.
  createdStamp: number;
};

async function fetchRacer(username: string): Promise<NitrotypeRacer> {
  // 300s revalidate matches the GitHub atoms — typing stats don't change
  // every minute, and overcalling the upstream proxy hurts nitrotype.com.
  const res = await fetch(`${NITROTYPE_API_BASE}/api/racer/${username}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(
      `nitrotype-api returned ${res.status} for username "${username}"`,
    );
  }
  const raw = (await res.json()) as Partial<NitrotypeRacer> & {
    error?: string;
  };
  if (raw.error) throw new Error(`nitrotype-api error: ${raw.error}`);
  if (typeof raw.username !== "string" || typeof raw.avgSpeed !== "number") {
    throw new Error(
      `nitrotype-api returned an unexpected payload for "${username}"`,
    );
  }
  // Coerce the fields we care about, defaulting to 0 where the API omits them
  // for low-tier accounts.
  return {
    username: raw.username,
    displayName: raw.displayName ?? null,
    avgSpeed: raw.avgSpeed ?? 0,
    highestSpeed: raw.highestSpeed ?? 0,
    racesPlayed: raw.racesPlayed ?? 0,
    experience: raw.experience ?? 0,
    level: raw.level ?? 0,
    leagueTier: raw.leagueTier ?? 0,
    longestSession: raw.longestSession ?? 0,
    nitrosUsed: raw.nitrosUsed ?? 0,
    profileViews: raw.profileViews ?? 0,
    createdStamp: raw.createdStamp ?? 0,
  };
}

export function nitrotypeRacer(
  params: { username: string },
  cache?: DedupeCache,
): Promise<NitrotypeRacer> {
  if (!cache) return fetchRacer(params.username);
  return cache.get(`nitrotype:${params.username}`, () =>
    fetchRacer(params.username),
  );
}

// ─── Seam fetchers (used by lib/data/atoms-seam.ts) ──────────────────
// nitrotype is a REST GET, so unlike the GitHub GraphQL atoms it can do
// conditional revalidation: store the upstream ETag and revalidate with
// If-None-Match — a 304 refreshes freshness WITHOUT a metered upstream
// fetch (scout). Provider "nitrotype" carries no upstream auth token.
// Exported (not wrapped in a seam atom here) so the seam deps don't enter
// the edge CARD bundle that imports this file.
export { fetchRacer };

function parseRacer(
  raw: Partial<NitrotypeRacer> & { error?: string },
  username: string,
): NitrotypeRacer {
  if (raw.error) throw new Error(`nitrotype-api error: ${raw.error}`);
  if (typeof raw.username !== "string" || typeof raw.avgSpeed !== "number") {
    throw new Error(
      `nitrotype-api returned an unexpected payload for "${username}"`,
    );
  }
  return {
    username: raw.username,
    displayName: raw.displayName ?? null,
    avgSpeed: raw.avgSpeed ?? 0,
    highestSpeed: raw.highestSpeed ?? 0,
    racesPlayed: raw.racesPlayed ?? 0,
    experience: raw.experience ?? 0,
    level: raw.level ?? 0,
    leagueTier: raw.leagueTier ?? 0,
    longestSession: raw.longestSession ?? 0,
    nitrosUsed: raw.nitrosUsed ?? 0,
    profileViews: raw.profileViews ?? 0,
    createdStamp: raw.createdStamp ?? 0,
  };
}

export async function conditionalFetchRacer(
  username: string,
  prevEtag: string | null,
): Promise<FetchResult<NitrotypeRacer>> {
  // cached:false equivalent — no Next revalidate; L2 is the sole governor.
  const res = await fetch(`${NITROTYPE_API_BASE}/api/racer/${username}`, {
    headers: prevEtag ? { "if-none-match": prevEtag } : undefined,
    cache: "no-store",
  });
  if (res.status === 304) return { notModified: true };
  if (!res.ok) {
    throw new Error(
      `nitrotype-api returned ${res.status} for username "${username}"`,
    );
  }
  const raw = (await res.json()) as Partial<NitrotypeRacer> & {
    error?: string;
  };
  return { data: parseRacer(raw, username), etag: res.headers.get("etag") };
}
