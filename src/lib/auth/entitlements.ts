import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { entitlements } from "@/lib/db/schema";

// Entitlements (spec §9). Limits are READ from here, never hardcoded — so
// dialing tiers later is a data change, not a migration. Everyone defaults
// to FULL ACCESS (the ratchet exists in the schema but stays wide open
// until we choose to monetize). `null` limit = unlimited.

export type Entitlements = {
  tier: string;
  rateBudgetPerHour: number | null;
  maxPublished: number | null;
  maxAssets: number | null;
  privateDataAllowed: boolean;
  badgeEnabled: boolean;
};

// The default everyone gets until/unless a row dials them back.
export const FULL_ACCESS: Entitlements = {
  tier: "full",
  rateBudgetPerHour: null,
  maxPublished: null,
  maxAssets: null,
  privateDataAllowed: true,
  badgeEnabled: false,
};

/** Read a user's entitlements, falling back to FULL_ACCESS when no row exists. */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const rows = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return FULL_ACCESS;
  return {
    tier: row.tier,
    rateBudgetPerHour: row.rateBudgetPerHour,
    maxPublished: row.maxPublished,
    maxAssets: row.maxAssets,
    privateDataAllowed: row.privateDataAllowed,
    badgeEnabled: row.badgeEnabled,
  };
}

/** Persist the default entitlements row for a user (idempotent). */
export async function ensureEntitlements(userId: string): Promise<void> {
  await db
    .insert(entitlements)
    .values({ userId, tier: FULL_ACCESS.tier })
    .onConflictDoNothing();
}
