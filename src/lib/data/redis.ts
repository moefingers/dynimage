import { Redis } from "@upstash/redis";

// Upstash Redis over REST — edge + node safe (no TCP). Carries the L2
// data cache (lib/data/l2cache.ts), the hot usage counters
// (lib/data/usage.ts), and single-flight locks. Lazy: importing this
// module never touches env; only first use does, so `next build` doesn't
// require Upstash creds.
let _redis: Redis | null = null;

export function redis(): Redis {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. " +
        "Provision Upstash Redis (Vercel Marketplace) and pull the REST creds.",
    );
  }
  _redis = new Redis({ url, token });
  return _redis;
}

/** True when Upstash is configured — lets callers degrade gracefully if not. */
export function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}
