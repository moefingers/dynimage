// Pure moderation helpers — no DB imports, so they're unit-testable under
// `node --test` (the DB-touching logic lives in reports.ts / admin.ts and
// is covered by the live smoke).

// Salted SHA-256 of a reporter IP → 32 hex chars. The raw IP is NEVER
// stored; this hash only dedupes one report per IP per embed and thresholds
// distinct reporters. Web Crypto (edge+node). The salt MUST be set in prod
// (REPORT_IP_SALT) so hashes aren't precomputable.
export async function hashIp(ip: string): Promise<string> {
  const salt = process.env.REPORT_IP_SALT ?? "dynimage-report-salt-dev";
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// v1 admin = an allowlist of Better Auth user ids in env ADMIN_USER_IDS
// (comma-separated). Fail-closed: env unset → no admins.
export function isAdmin(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}
