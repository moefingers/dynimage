import { dispatchCard } from "@/lib/cards/dispatch";
import { getEdgeCard } from "@/lib/cards/registry-edge";

// Edge runtime: handles all cards declaring `runtime: "edge"`.
// Node-only cards (streak, portrait) are rewritten to /api/n/* by
// next.config.ts before reaching here.
export const runtime = "edge";

// Force dynamic so we always re-evaluate the request and emit fresh
// Cache-Control headers; upstream GitHub fetch is separately cached
// via Next's fetch cache (see data/client.ts).
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ user: string; stat: string }> },
) {
  const { user, stat } = await ctx.params;
  const url = new URL(request.url);
  return dispatchCard({
    statSegment: stat,
    searchParams: url.searchParams,
    pathParams: { user },
    runtime: "edge",
    ifNoneMatch: request.headers.get("if-none-match"),
    baseUrl: `${url.protocol}//${url.host}`,
    getCard: getEdgeCard,
  });
}
