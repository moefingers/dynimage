import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

// ─────────────────────────────────────────────────────────────────────
// assets store (spec §10). Row shape is schema.ts as-is (deputy owns the
// table + migration). LIBRARY functions; the session-gated upload route
// (mine) is the sole writer. Deletes are owner-scoped and return the row
// so the caller can clean up the Blob.
// ─────────────────────────────────────────────────────────────────────

export type AssetRow = typeof schema.assets.$inferSelect;

export async function insertAsset(args: {
  id: string;
  ownerId: string;
  mime: string;
  size: number;
  blobUrl: string;
  blobPathname: string;
}): Promise<void> {
  await db.insert(schema.assets).values(args);
}

export async function getAsset(id: string): Promise<AssetRow | null> {
  const rows = await db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listOwnerAssets(ownerId: string): Promise<AssetRow[]> {
  return db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.ownerId, ownerId))
    .orderBy(desc(schema.assets.createdAt));
}

/** Count an owner's assets — feeds the maxAssets entitlement check. */
export async function countOwnerAssets(ownerId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.assets)
    .where(eq(schema.assets.ownerId, ownerId));
  return rows[0]?.n ?? 0;
}

/** Owner-scoped delete; returns the deleted row (for Blob cleanup) or null. */
export async function deleteAsset(
  id: string,
  ownerId: string,
): Promise<AssetRow | null> {
  const rows = await db
    .delete(schema.assets)
    .where(and(eq(schema.assets.id, id), eq(schema.assets.ownerId, ownerId)))
    .returning();
  return rows[0] ?? null;
}
