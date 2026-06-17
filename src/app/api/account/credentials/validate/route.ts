import { requireUser, AuthError } from "@/lib/auth/session";
import { validateGitHubToken } from "@/lib/data/vault";

// Validate-on-add PREVIEW (spec §4): test a token live and report what it
// unlocks ("can read X") WITHOUT storing it. The editor calls this before
// the user commits, so they see the value before pasting a secret to keep.
// Session-gated (only signed-in users connect tokens). The token is used
// for the live check and discarded — never stored here.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireUser(request);
    const body = (await request.json()) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return new Response("A token is required.", { status: 400 });
    const validation = await validateGitHubToken(token);
    return Response.json(validation);
  } catch (e) {
    if (e instanceof AuthError)
      return new Response(e.message, { status: e.status });
    const msg = e instanceof Error ? e.message : "Request failed";
    return new Response(msg, { status: 400 });
  }
}
