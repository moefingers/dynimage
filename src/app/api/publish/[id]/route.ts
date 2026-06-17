import { requireUser, AuthError } from "@/lib/auth/session";
import { updatePublishedEmbed } from "@/lib/publish/store";
import { Scene } from "@/lib/scene/scene-spec";
import { sceneHasPrivilegedBind } from "@/lib/scene/bind";

// Edit a published embed (funnel §5 — editing updates what /i/<id>
// resolves to; the URL stays stable, freshness lives behind the id).
// Gated: signed-in + email-verified. updatePublishedEmbed is owner-scoped
// on (id, ownerId), so a non-owner edit fails closed (→ 404). We validate
// the Scene and compute exposesPrivateData here (the update primitive takes
// it as an arg, unlike publishEmbed which computes it internally).
//
// No explicit L1 bust needed: builder-2's /i/<id> L1 key includes the
// config hash, so a changed config resolves to a fresh render automatically.
export const runtime = "nodejs";

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (!user.emailVerified) {
      throw new AuthError(403, "Verify your email to publish.");
    }
    const { id } = await ctx.params;
    const body = (await request.json()) as { config?: unknown };
    const parsed = Scene.safeParse(body.config);
    if (!parsed.success) {
      return new Response(`Invalid scene config: ${parsed.error.message}`, {
        status: 400,
      });
    }
    const ok = await updatePublishedEmbed({
      id,
      ownerId: user.id,
      config: parsed.data,
      exposesPrivateData: sceneHasPrivilegedBind(parsed.data),
    });
    if (!ok) {
      return new Response("Embed not found or not yours.", { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError)
      return new Response(e.message, { status: e.status });
    return new Response(e instanceof Error ? e.message : "Update failed", {
      status: 500,
    });
  }
}
