import { eq, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";
import { requireUser, AuthError, type SessionUser } from "./session";
import { getEntitlements } from "./entitlements";

// Upload auth-gate (spec §10) — the entitlements check for the asset-upload
// route (builder-2's lane calls this). Mirrors assertCanPublish: an account
// is required, and the per-owner maxAssets limit is enforced (full-access
// default = unlimited). mime/size validation is the upload route's job.
export async function assertCanUpload(
  request: Request,
): Promise<{ user: SessionUser }> {
  const user = await requireUser(request); // 401 if anonymous
  const ent = await getEntitlements(user.id);
  if (ent.maxAssets != null) {
    const rows = await db
      .select({ n: count() })
      .from(assets)
      .where(eq(assets.ownerId, user.id));
    const n = rows[0]?.n ?? 0;
    if (n >= ent.maxAssets) {
      throw new AuthError(403, `Asset limit reached (${ent.maxAssets}).`);
    }
  }
  return { user };
}
