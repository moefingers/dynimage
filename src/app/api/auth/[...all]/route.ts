import { auth } from "@/lib/auth/auth";
import { refuseOversizedAuthBody } from "@/lib/auth/body-limit";
import { toNextJsHandler } from "better-auth/next-js";

// Better Auth's catch-all handler — sign-in/up, OAuth callback
// (/api/auth/callback/github), session, sign-out. Node runtime (Better
// Auth + Neon + Web Crypto). This is the auth ENTRY POINT only; it does
// NOT touch the card render flow (dispatch.ts) — that wiring is Wave 2.
export const runtime = "nodejs";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;
// A body over the limit is refused before Better Auth reads any of it
// (lib/auth/body-limit.ts): its public POST endpoints parse unbounded arrays.
export const POST = refuseOversizedAuthBody(handlers.POST);
