import { allCards } from "@/lib/cards/registry-all";
import { z } from "zod";

// Introspection endpoint — the editor (and anyone curious) calls this
// to discover what card types exist, what inputs each accepts, what
// formats it renders, and human-readable metadata. Source of truth is
// the Card objects themselves; this endpoint just serializes them.
export const runtime = "nodejs";
export const dynamic = "force-static";

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

  return Response.json(
    { v: 1, cards },
    {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
