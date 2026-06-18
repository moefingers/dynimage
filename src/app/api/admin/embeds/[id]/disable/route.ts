import { requireUser, AuthError } from "@/lib/auth/session";
import { isAdmin, setEmbedDisabled } from "@/lib/moderation/admin";

// Admin disable/enable a published embed (spec §11). Gated to the
// ADMIN_USER_IDS allowlist (fail-closed when unset). POST → disable (the
// moderation action: /i/<id> then 410s); DELETE → re-enable. Disabling is
// deliberate + admin-only — a report threshold only FLAGS for review.
export const runtime = "nodejs";

async function setDisabled(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
  disabled: boolean,
): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (!isAdmin(user.id)) throw new AuthError(403, "Admins only.");
    const { id } = await ctx.params;
    const ok = await setEmbedDisabled(id, disabled);
    if (!ok) return new Response("No such published embed.", { status: 404 });
    return Response.json({ ok: true, disabled });
  } catch (e) {
    if (e instanceof AuthError)
      return new Response(e.message, { status: e.status });
    return new Response(e instanceof Error ? e.message : "Failed", {
      status: 500,
    });
  }
}

export function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return setDisabled(request, ctx, true);
}

export function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return setDisabled(request, ctx, false);
}
