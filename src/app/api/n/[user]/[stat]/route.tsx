import { dispatchCard } from "@/lib/cards/dispatch";
import { getNodeCard } from "@/lib/cards/registry-node";

// Node runtime: handles cards needing native graphics (Skia, Sharp).
// Reached via next.config.ts rewrites — clients use /api/<user>/<stat>
// and the rewrite layer sends node-only cards here.
export const runtime = "nodejs";
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
    runtime: "nodejs",
    ifNoneMatch: request.headers.get("if-none-match"),
    baseUrl: `${url.protocol}//${url.host}`,
    getCard: getNodeCard,
  });
}
