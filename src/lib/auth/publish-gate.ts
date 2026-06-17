import { db } from "@/lib/db/client";
import { publishedEmbeds } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { requireUser, AuthError, type SessionUser } from "./session";
import { getEntitlements } from "./entitlements";

// The publish AUTH-GATE (spec §3, funnel §2/§3). This is the ONLY thing
// that authorizes a write to published_embeds; builder-2's publishEmbed()
// is a library function called solely from behind this gate (no ungated
// route on their side). Honest gating: an account gates CONSTRUCTION /
// PUBLISH — never basic tuning or the anonymous public card.
//
// Checks, in order:
//   1. signed in            → else 401
//   2. email verified       → else 403 ("verify to publish", spec §3)
//   3. within maxPublished  → else 403 (entitlements; full-access = unlimited)

export async function assertCanPublish(
  request: Request,
): Promise<{ user: SessionUser }> {
  const user = await requireUser(request); // 401 if anonymous

  if (!user.emailVerified) {
    throw new AuthError(
      403,
      "Verify your email to publish. (GitHub sign-in verifies automatically.)",
    );
  }

  const ent = await getEntitlements(user.id);
  if (ent.maxPublished != null) {
    const rows = await db
      .select({ n: count() })
      .from(publishedEmbeds)
      .where(eq(publishedEmbeds.ownerId, user.id));
    const n = rows[0]?.n ?? 0;
    if (n >= ent.maxPublished) {
      throw new AuthError(
        403,
        `Published-embed limit reached (${ent.maxPublished}).`,
      );
    }
  }

  return { user };
}
