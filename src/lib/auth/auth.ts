import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db/client";
import { user, session, account, verification } from "@/lib/db/schema";

// Better Auth (spec §3) — canon across recanon/nitrotype. Identity model:
//   - GitHub OAuth = the PRIMARY private-data path (scoped, revocable, no
//     manual token). The OAuth access token lands in the `account` table.
//   - Email/password = a standard account path; manual PAT (the power-user
//     fallback) is stored separately in the credential vault (lib/data/vault.ts).
//
// Gating (spec §3): an account gates *construction/publish*, NEVER the raw
// anonymous public URL (the front line). "Email-verified to publish" is
// enforced at the publish route (Phase C) — email sending isn't provisioned
// in Wave 1, so requireEmailVerification stays off here for now.
//
// The db proxy is lazy (lib/db/client.ts), so importing this module does
// not require DATABASE_URL at build time — only handling a request does.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // flip on once an email sender is provisioned
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? "",
    },
  },
});

export type Auth = typeof auth;
