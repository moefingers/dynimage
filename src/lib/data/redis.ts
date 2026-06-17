import { Redis } from "@upstash/redis";

// Upstash Redis over REST — edge + node safe (no TCP). Carries the L2
// data cache (lib/data/l2cache.ts), the hot usage counters
// (lib/data/usage.ts), and single-flight locks. Lazy: importing this
// module never touches env; only first use does, so `next build` doesn't
// require Upstash creds.
//
// Env var names: Vercel's Upstash-KV integration injects them PREFIXED per
// store — for this project: UPSTASH_DYNIMAGE_KV_REST_API_URL / _TOKEN.
// We read those first, falling back to the generic UPSTASH_REDIS_REST_*
// names so local dev / a differently-named store still works. (Also
// present but unused here: *_READ_ONLY_TOKEN — read-only, not needed; and
// the rediss:// URLs UPSTASH_DYNIMAGE_KV_URL / _REDIS_URL for the non-REST
// driver — REST is the edge-safe path we use.)
let _redis: Redis | null = null;

function restUrl(): string | undefined {
  return (
    process.env.UPSTASH_DYNIMAGE_KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL
  );
}

function restToken(): string | undefined {
  return (
    process.env.UPSTASH_DYNIMAGE_KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function redis(): Redis {
  if (_redis) return _redis;
  const url = restUrl();
  const token = restToken();
  if (!url || !token) {
    throw new Error(
      "Upstash REST creds are not set. Expected " +
        "UPSTASH_DYNIMAGE_KV_REST_API_URL / UPSTASH_DYNIMAGE_KV_REST_API_TOKEN " +
        "(Vercel Upstash-KV integration) or the generic UPSTASH_REDIS_REST_URL / " +
        "UPSTASH_REDIS_REST_TOKEN.",
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

/** True when Upstash is configured — lets callers degrade gracefully if not. */
export function redisConfigured(): boolean {
  return Boolean(restUrl() && restToken());
}
