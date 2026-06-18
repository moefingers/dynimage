import { eq, count } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reports, publishedEmbeds } from "@/lib/db/schema";
import { genId } from "@/lib/id";
import { hashIp } from "./util";

// Abuse reports (spec §11), reactive v1. A report is recorded against a
// published embed; once distinct reports cross FLAG_THRESHOLD the embed is
// auto-`flagged` (queued for admin review). Disabling is a separate admin
// action (moderation/admin.ts) — a flag never auto-disables.
//
// Privacy: the raw reporter IP is NEVER stored. We keep a salted hash, only
// to (a) dedupe one report per IP per embed (the unique index) so a single
// IP can't inflate the count, and (b) threshold on distinct reporters.

const FLAG_THRESHOLD = 3;

export type ReportResult = {
  status: "recorded" | "duplicate" | "not_found";
};

export async function submitReport(args: {
  publishedId: string;
  reason: string;
  ip: string;
}): Promise<ReportResult> {
  // The embed must exist (don't accept reports for unknown ids).
  const rows = await db
    .select({ id: publishedEmbeds.id, flagged: publishedEmbeds.flagged })
    .from(publishedEmbeds)
    .where(eq(publishedEmbeds.id, args.publishedId))
    .limit(1);
  const embed = rows[0];
  if (!embed) return { status: "not_found" };

  const reporterIpHash = await hashIp(args.ip);
  // One report per (embed, IP) — the unique index makes this idempotent.
  const inserted = await db
    .insert(reports)
    .values({
      id: genId(),
      publishedId: args.publishedId,
      reason: args.reason.slice(0, 500),
      reporterIpHash,
    })
    .onConflictDoNothing()
    .returning({ id: reports.id });

  if (inserted.length === 0) return { status: "duplicate" };

  // Newly recorded → re-check the distinct-reporter count and auto-flag.
  if (!embed.flagged) {
    const totalRows = await db
      .select({ n: count() })
      .from(reports)
      .where(eq(reports.publishedId, args.publishedId));
    const total = totalRows[0]?.n ?? 0;
    if (total >= FLAG_THRESHOLD) {
      await db
        .update(publishedEmbeds)
        .set({ flagged: true, updatedAt: new Date() })
        .where(eq(publishedEmbeds.id, args.publishedId));
    }
  }
  return { status: "recorded" };
}
