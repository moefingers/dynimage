import { dispatchCard } from "@/lib/cards/dispatch";
import { getCard } from "@/lib/cards/registry-all";

// Node runtime: handles cards needing native graphics (Skia, sharp,
// font reads via fs). Reached via next.config.ts rewrites — clients
// use /api/<user>/<stat> and the rewrite layer sends node-only cards
// here.
export const runtime = "nodejs";
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
    runtime: "nodejs",
    ifNoneMatch: request.headers.get("if-none-match"),
    baseUrl: `${url.protocol}//${url.host}`,
    getCard: getCard,
  });
}
