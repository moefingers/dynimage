import { allCards } from "@/lib/cards/registry-all";
import { allElements } from "@/lib/scene/registry";
import { metricMatrix } from "@/lib/scene/bind";
import { z } from "zod";

// Introspection endpoint — the editor (and anyone curious) calls this
// to discover what card / element types exist, what params each accepts,
// and human-readable metadata. Source of truth is the Card / Element
// objects themselves; this endpoint just serializes them.
//
// `elements` is the scene/element model surface: each element serializes
// its `knobs` Zod schema to JSON-Schema (same pattern as cards' `input`)
// plus its bind affinity and exposed anchor slots. `metrics` is the
// metric ↔ subject-kind compatibility matrix so the editor never offers a
// metric on a subject kind it can't resolve. `cards` is retained for the
// existing card / preset surface during the transition.
export const runtime = "nodejs";
export const dynamic = "force-static";

// The eight geometric slots every element exposes (anchor.ts); an element
// module may publish additional custom slots.
const GEOMETRIC_SLOTS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export async function GET() {
  const cards = allCards().map((card) => ({
    name: card.name,
    runtime: card.runtime,
    defaultSize: card.defaultSize,
    formats: Object.keys(card.formats),
    // Zod 4 ships a JSON-Schema conversion helper; the editor uses
    // this to render a form per card type without hard-coding fields.
    inputSchema: z.toJSONSchema(card.input),
    meta: card.meta,
  }));

  const elements = allElements().map((el) => ({
    type: el.type,
    runtime: el.runtime,
    defaultSize: el.defaultSize,
    bind: el.bind,
    slots: [...GEOMETRIC_SLOTS, ...Object.keys(el.slots ?? {})].filter(
      (s, i, a) => a.indexOf(s) === i,
    ),
    knobsSchema: z.toJSONSchema(el.knobs),
    meta: el.meta,
  }));

  return Response.json(
    { v: 1, cards, elements, metrics: metricMatrix() },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
