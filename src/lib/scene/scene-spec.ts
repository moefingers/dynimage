import { z } from "zod";
import { BindSchema } from "./bind";

// ─────────────────────────────────────────────────────────────────────
// Scene wire contract — the JSON a config/URL decodes to. Versioned so
// embedded URLs never break (§2). This is the evolution of LayoutSpec
// (cards/spec.ts): canvas + an ordered, z-layered, anchorable, bindable
// element list. The Tier-2 codec (builder-2) encodes/decodes THIS shape;
// Tier-0/1 (preset / readable params) are flat projections onto it.
// ─────────────────────────────────────────────────────────────────────

const TransformSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().positive().max(4096).optional(),
  h: z.number().positive().max(4096).optional(),
  z: z.number().int().optional(),
  rotate: z.number().min(-360).max(360).optional(),
});

const SlotNameSchema = z.enum([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

const AnchorSchema = z.object({
  to: z.string().min(1).max(64),
  slot: SlotNameSchema,
  dx: z.number().optional(),
  dy: z.number().optional(),
});

// An element entry. `knobs` is validated structurally here (an object)
// and fully against the element module's own Zod schema at render time —
// same two-phase boundary validation the card dispatcher uses.
export const ElementSpec = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "id must be [a-zA-Z0-9_-]"),
  type: z.string().min(1).max(64),
  transform: TransformSchema.optional(),
  anchor: AnchorSchema.optional(),
  knobs: z.record(z.string(), z.unknown()).optional(),
  bind: BindSchema.optional(),
  // Optional uploaded-asset override (spec §10). An EXTERNAL reference by
  // id — resolved centrally (SSRF-safe) to a data-URI at render time, like
  // `bind`. The id charset matches genId (base64url).
  asset: z
    .object({
      id: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9_-]+$/, "asset id must be [A-Za-z0-9_-]"),
    })
    .optional(),
});
export type ElementSpec = z.infer<typeof ElementSpec>;

export const Scene = z
  .object({
    v: z.literal(1),
    canvas: z.object({
      w: z.number().int().positive().max(4096),
      h: z.number().int().positive().max(4096),
      // Named theme (resolved via cards/theme.ts) and/or explicit bg hex.
      theme: z.string().optional(),
      bg: z
        .string()
        .regex(/^#?[0-9a-fA-F]{6}$/)
        .optional(),
    }),
    // Hard cap on element count — a rate-limit / compute safety boundary,
    // same rationale as LayoutSpec's card cap.
    elements: z.array(ElementSpec).min(1).max(16),
  })
  .superRefine((scene, ctx) => {
    // Ids must be unique so anchors resolve unambiguously.
    const seen = new Set<string>();
    for (const el of scene.elements) {
      if (seen.has(el.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate element id "${el.id}".`,
        });
      }
      seen.add(el.id);
    }
  });
export type Scene = z.infer<typeof Scene>;
