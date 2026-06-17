import { requireUser, AuthError } from "@/lib/auth/session";
import { deleteCredential } from "@/lib/data/vault";

// Revoke a stored credential (spec §4 — user can revoke). Session-gated;
// deleteCredential is scoped to (userId, id) so one user can't delete
// another's token.
export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser(request);
    const { id } = await ctx.params;
    await deleteCredential({ userId: user.id, id });
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof AuthError)
      return new Response(e.message, { status: e.status });
    const msg = e instanceof Error ? e.message : "Request failed";
    return new Response(msg, { status: 400 });
  }
}
