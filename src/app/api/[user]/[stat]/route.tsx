import { dispatchCard } from "@/lib/cards/dispatch";
import { getEdgeCard } from "@/lib/cards/registry-edge";

// Edge runtime: handles all cards declaring `runtime: 'edge'` in the
// registry (commits, streak). Node-only cards (portrait) are rewritten
// to /api/n/* by next.config.ts before reaching here.
export const runtime = "edge";

// Force dynamic so we always re-evaluate the request and emit fresh
// Cache-Control headers; the upstream GitHub fetch is separately
// cached via next: { revalidate: 300 }.
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ user: string; stat: string }> },
) {
  const { user, stat } = await ctx.params;
  const url = new URL(request.url);
  return dispatchCard({
    user,
    statSegment: stat,
    searchParams: url.searchParams,
    runtime: "edge",
    ifNoneMatch: request.headers.get("if-none-match"),
    baseUrl: `${url.protocol}//${url.host}`,
    getCard: getEdgeCard,
  });
}
