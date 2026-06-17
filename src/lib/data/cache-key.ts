// Cache-key derivation — the load-bearing privacy primitive, kept in its
// OWN dependency-free module so it is unit-testable under `node --test`
// (which can't resolve the extensionless relative-import web that seam.ts
// pulls in). Pure function, no imports.

export type Scope = "public" | "private";

/**
 * Derive the L2 cache key + effective vantage for a read. A result is keyed
 * PRIVATE (owner-namespaced) iff the metric is statically private OR it's
 * vantageSensitive AND fetched with a non-app token (so the value may
 * include the owner's private data). Token-source alone decides it — a
 * private-inclusive value can NEVER land under the shared `:public` key,
 * where a public embedder would read it. (spec §3/§6/§14.5)
 */
export function deriveCacheKey(args: {
  provider: string;
  subject: string;
  metric: string;
  staticScope: Scope;
  vantageSensitive?: boolean;
  tokenSource: "app" | "pat";
  ownerId: string | null;
}): { key: string; effectivePrivate: boolean } {
  const base = `${args.provider}:${args.subject}:${args.metric}`;
  const effectivePrivate =
    args.staticScope === "private" ||
    (args.vantageSensitive === true && args.tokenSource !== "app");
  const key = effectivePrivate
    ? `${base}:private:${args.ownerId ?? "anon"}`
    : `${base}:public`;
  return { key, effectivePrivate };
}
