import { auth } from "@/lib/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Better Auth's catch-all handler — sign-in/up, OAuth callback
// (/api/auth/callback/github), session, sign-out. Node runtime (Better
// Auth + Neon + Web Crypto). This is the auth ENTRY POINT only; it does
// NOT touch the card render flow (dispatch.ts) — that wiring is Wave 2.
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
