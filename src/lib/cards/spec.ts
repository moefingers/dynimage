import { z } from "zod";

// LayoutSpec: the JSON shape that a compound card's URL decodes to.
// Versioned so we can evolve the format without breaking embedded URLs
// already deployed in third-party READMEs. Hard caps on dimensions and
// card count are policy decisions enforced at the boundary.
export const LayoutSpec = z.object({
  v: z.literal(1),
  w: z.number().int().positive().max(4096),
  h: z.number().int().positive().max(4096),
  theme: z.string().optional(),
  cards: z
    .array(
      z.object({
        type: z.string(),
        input: z.record(z.string(), z.unknown()),
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        w: z.number().int().positive(),
        h: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(8), // hard cap — see "rate-limit safety" in architecture docs
});

export type LayoutSpec = z.infer<typeof LayoutSpec>;
