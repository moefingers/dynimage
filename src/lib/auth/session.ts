import { auth } from "./auth";

// Server-side session helpers for API routes / server components. Thin
// wrappers over Better Auth's `auth.api.getSession`. NEVER throw on a
// missing session for read paths — anonymous is a valid state (the public
// front line). The route decides whether to 401.

export type SessionUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
};

/** Resolve the current user from the request, or null if anonymous. */
export async function getSessionUser(
  request: Request,
): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return null;
    const u = session.user;
    return {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      name: u.name ?? null,
      image: u.image ?? null,
    };
  } catch {
    return null;
  }
}

/** A typed 401/403 the route translates to a response. */
export class AuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/** Require a signed-in user (401 if not). For gated WRITE actions. */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new AuthError(401, "Sign in required.");
  return user;
}
