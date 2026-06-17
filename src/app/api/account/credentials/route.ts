import { requireUser, AuthError } from "@/lib/auth/session";
import { addCredential, listCredentials } from "@/lib/data/vault";

// PAT vault API (spec §4). All session-gated. The plaintext token enters
// ONLY via POST (encrypted immediately by the vault); it is never returned.
// Clients see label + last4 + scopes.
export const runtime = "nodejs";

function fail(e: unknown): Response {
  if (e instanceof AuthError) return new Response(e.message, { status: e.status });
  const msg = e instanceof Error ? e.message : "Request failed";
  return new Response(msg, { status: 400 });
}

// GET — list the user's credentials (never the secret).
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    const creds = await listCredentials(user.id);
    return Response.json({ credentials: creds });
  } catch (e) {
    return fail(e);
  }
}

// POST — add a credential. Validates the token live (validate-on-add),
// then envelope-encrypts + stores. Returns the stored view + what it
// unlocks (never the token).
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as {
      label?: unknown;
      token?: unknown;
    };
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const token = typeof body.token === "string" ? body.token : "";
    if (!label) return new Response("A label is required.", { status: 400 });
    if (!token) return new Response("A token is required.", { status: 400 });

    const { id, validation } = await addCredential({
      userId: user.id,
      provider: "github",
      label,
      secret: token,
    });
    return Response.json({
      id,
      label,
      last4: token.slice(-4),
      validation: {
        ok: validation.ok,
        login: validation.login,
        scopes: validation.scopes,
        unlocks: validation.unlocks,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
