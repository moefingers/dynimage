import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

// ─────────────────────────────────────────────────────────────────────
// published_embeds store (spec §8). LIBRARY functions only — never a
// route or unguarded server action. The publish WRITE path is owned by
// deputy's gated publish action, which is the sole caller of the insert/
// update primitives (one insert path, no ungated publish). /i/<id> uses
// the read primitive. Row shape is schema.ts as-is (locked contract).
// ─────────────────────────────────────────────────────────────────────

export type PublishedEmbedRow = {
  id: string;
  ownerId: string;
  config: unknown; // a Scene v1 (validated by the caller before render)
  exposesPrivateData: boolean;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Read a published embed by id. Returns null if missing. The caller
 *  decides what to do with a `disabled` row (the /i route 404s it). */
export async function getPublishedEmbed(
  id: string,
): Promise<PublishedEmbedRow | null> {
  const rows = await db
    .select()
    .from(schema.publishedEmbeds)
    .where(eq(schema.publishedEmbeds.id, id))
    .limit(1);
  return (rows[0] as PublishedEmbedRow | undefined) ?? null;
}

/**
 * Insert one published embed. Returns false on an id collision (so the
 * caller can regenerate), true on success. `onConflictDoNothing` makes the
 * collision check atomic — no read-then-write race.
 */
export async function insertPublishedEmbed(args: {
  id: string;
  ownerId: string;
  config: unknown;
  exposesPrivateData: boolean;
}): Promise<boolean> {
  const inserted = await db
    .insert(schema.publishedEmbeds)
    .values({
      id: args.id,
      ownerId: args.ownerId,
      config: args.config,
      exposesPrivateData: args.exposesPrivateData,
    })
    .onConflictDoNothing({ target: schema.publishedEmbeds.id })
    .returning({ id: schema.publishedEmbeds.id });
  return inserted.length > 0;
}

/**
 * Update a published embed's config (editing a live embed — §6: the URL
 * stays stable, only what it resolves to changes). Owner-scoped: matches on
 * (id AND ownerId) so an owner can only edit their own. Returns whether a
 * row matched. `updatedAt` bumps so callers can derive a fresh cache-bust.
 */
export async function updatePublishedEmbed(args: {
  id: string;
  ownerId: string;
  config: unknown;
  exposesPrivateData: boolean;
}): Promise<boolean> {
  const updated = await db
    .update(schema.publishedEmbeds)
    .set({
      config: args.config,
      exposesPrivateData: args.exposesPrivateData,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.publishedEmbeds.id, args.id),
        eq(schema.publishedEmbeds.ownerId, args.ownerId),
      ),
    )
    .returning({ id: schema.publishedEmbeds.id });
  return updated.length > 0;
}
