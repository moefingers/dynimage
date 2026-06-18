import { Ratelimit } from "@upstash/ratelimit";
import { redis, redisConfigured } from "@/lib/data/redis";
import { submitReport } from "@/lib/moderation/reports";

// Public abuse-report endpoint (spec §11). Rate-limited PER-IP — this is a
// DIRECT browser call (a "Report" button), NOT a camo embed, so per-IP is
// correct here (unlike embed rendering, where camo hides the viewer). Body:
// { publishedId, reason }. Records a report; the threshold/flag logic lives
// in moderation/reports.ts. Never leaks moderation state to the reporter.
export const runtime = "nodejs";

// 5 reports / 10 min / IP — enough for genuine reporting, throttles spam.
let _limiter: Ratelimit | null = null;
function limiter(): Ratelimit {
  if (!_limiter) {
    _limiter = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      prefix: "dyn:rl:report",
    });
  }
  return _limiter;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);

  // Rate-limit when Upstash is configured (degrade-open in local dev).
  if (redisConfigured()) {
    const { success } = await limiter().limit(ip);
    if (!success) {
      return new Response("Too many reports — try again later.", {
        status: 429,
      });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Body must be JSON.", { status: 400 });
  }
  const b = body as { publishedId?: unknown; reason?: unknown };
  const publishedId = typeof b.publishedId === "string" ? b.publishedId : "";
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!publishedId) {
    return new Response("`publishedId` is required.", { status: 400 });
  }
  if (!reason) {
    return new Response("A `reason` is required.", { status: 400 });
  }

  const result = await submitReport({ publishedId, reason, ip });
  if (result.status === "not_found") {
    return new Response("No such published embed.", { status: 404 });
  }
  // "recorded" and "duplicate" both succeed for the caller — we don't reveal
  // whether they'd already reported it, nor whether it's now flagged.
  return Response.json({ ok: true });
}
