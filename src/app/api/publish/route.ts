import { after } from "next/server";
import { assertCanPublish } from "@/lib/auth/publish-gate";
import { AuthError } from "@/lib/auth/session";
import { publishEmbed, PublishError } from "@/lib/publish/publish";

// Publish action (funnel §7) — the AUTH-GATE that is the SOLE caller of
// builder-2's publishEmbed() (a library fn with no ungated route of its
// own). The gate (assertCanPublish): signed-in + email-verified + within
// maxPublished. publishEmbed validates the Scene, computes
// exposesPrivateData itself (sceneHasPrivilegedBind), inserts + pre-warms,
// and returns the embeddable {id,url,snippet}.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const { user } = await assertCanPublish(request);
    const body = (await request.json()) as {
      config?: unknown;
      href?: unknown;
      alt?: unknown;
    };
    if (body.config == null) {
      return new Response("A scene `config` is required.", { status: 400 });
    }
    const url = new URL(request.url);
    const result = await publishEmbed({
      config: body.config,
      ownerId: user.id,
      baseUrl: `${url.protocol}//${url.host}`,
      href: typeof body.href === "string" ? body.href : undefined,
      alt: typeof body.alt === "string" ? body.alt : undefined,
      waitUntil: (p) => after(p),
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof AuthError)
      return new Response(e.message, { status: e.status });
    if (e instanceof PublishError)
      return new Response(e.message, { status: 400 });
    return new Response(e instanceof Error ? e.message : "Publish failed", {
      status: 500,
    });
  }
}
