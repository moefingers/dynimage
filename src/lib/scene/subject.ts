import { z } from "zod";
import type { Subject, SubjectKind } from "./types";

// Zod schema for a typed entity reference. The id shape is provider-
// specific (a GitHub login vs. an "owner/name" repo slug), so we validate
// only the envelope here; per-metric resolvers enforce finer rules.
export const SubjectSchema: z.ZodType<Subject> = z.object({
  kind: z.enum(["user", "org", "repo"]),
  id: z.string().min(1).max(120),
});

export const SUBJECT_KINDS: readonly SubjectKind[] = ["user", "org", "repo"];
