import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { publishedEmbeds } from "@/lib/db/schema";

export { isAdmin } from "./util";

// Disable (or re-enable) a published embed. Disabling makes builder-2's
// /i/<id> serve 410 + a neutral placeholder (camo eventually drops it).
// Returns false if no such id.
export async function setEmbedDisabled(
  id: string,
  disabled: boolean,
): Promise<boolean> {
  const updated = await db
    .update(publishedEmbeds)
    .set({ disabled, updatedAt: new Date() })
    .where(eq(publishedEmbeds.id, id))
    .returning({ id: publishedEmbeds.id });
  return updated.length > 0;
}
