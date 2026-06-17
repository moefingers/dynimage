import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { credentialVault } from "@/lib/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { genId } from "@/lib/id";

// Per-user, per-provider credential vault (spec §4). The plaintext secret
// enters in addCredential (encrypted immediately) and leaves ONLY via
// getDecryptedSecret, in-memory, for the duration of a render. It is never
// logged, never returned to a client, never cached. Clients see label +
// last4 + scopes only.

export type CredentialView = {
  id: string;
  provider: string;
  label: string;
  last4: string | null;
  scopes: string[] | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type ValidationResult = {
  ok: boolean;
  login?: string;
  scopes?: string[];
  /** human-readable "what this unlocks" for the add-credential UI (spec §4). */
  unlocks?: string;
  reason?: string;
};

/**
 * Validate a GitHub token live (spec §4 "validate on add"). Confirms the
 * token authenticates and reports what it can see. The token's own scope
 * IS the authorization boundary (spec invariant §14.3) — we don't build
 * permission logic, we just surface what GitHub grants.
 */
export async function validateGitHubToken(
  token: string,
): Promise<ValidationResult> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "dynimage",
        accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) {
      // Never echo the response body — it can reflect the token. Status only.
      return { ok: false, reason: `GitHub rejected the token (${res.status})` };
    }
    const body = (await res.json()) as { login?: string };
    // Classic PATs expose scopes here; fine-grained PATs do not.
    const scopeHeader = res.headers.get("x-oauth-scopes");
    const scopes = scopeHeader
      ? scopeHeader
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return {
      ok: true,
      login: body.login,
      scopes,
      unlocks: scopes?.length
        ? `Authenticated as ${body.login}; scopes: ${scopes.join(", ")}`
        : `Authenticated as ${body.login} (fine-grained token; permissions not enumerable via API)`,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "network error" };
  }
}

/** Add a credential: validate live, then envelope-encrypt and store. */
export async function addCredential(args: {
  userId: string;
  provider: "github";
  label: string;
  secret: string;
}): Promise<{ id: string; validation: ValidationResult }> {
  const validation =
    args.provider === "github"
      ? await validateGitHubToken(args.secret)
      : { ok: true };
  if (!validation.ok) {
    throw new Error(`Token validation failed: ${validation.reason ?? "invalid"}`);
  }

  const enc = await encryptSecret(args.secret);
  const id = genId();
  await db.insert(credentialVault).values({
    id,
    userId: args.userId,
    provider: args.provider,
    label: args.label,
    ciphertext: enc.ciphertext,
    iv: enc.iv,
    wrappedDataKey: enc.wrappedDataKey,
    keyVersion: enc.keyVersion,
    last4: args.secret.slice(-4),
    scopes: validation.scopes ?? null,
  });
  return { id, validation };
}

/** List a user's credentials — never includes the secret. */
export async function listCredentials(
  userId: string,
): Promise<CredentialView[]> {
  const rows = await db
    .select({
      id: credentialVault.id,
      provider: credentialVault.provider,
      label: credentialVault.label,
      last4: credentialVault.last4,
      scopes: credentialVault.scopes,
      createdAt: credentialVault.createdAt,
      lastUsedAt: credentialVault.lastUsedAt,
    })
    .from(credentialVault)
    .where(eq(credentialVault.userId, userId));
  return rows;
}

export async function deleteCredential(args: {
  userId: string;
  id: string;
}): Promise<void> {
  await db
    .delete(credentialVault)
    .where(
      and(
        eq(credentialVault.id, args.id),
        eq(credentialVault.userId, args.userId),
      ),
    );
}

/**
 * Decrypt and return a user's secret for a provider — IN-MEMORY ONLY.
 * Caller (token selection) uses it for one render and discards it. Returns
 * null if the user has no credential for that provider. Best-effort
 * last_used bump. The returned `secret` must never be logged/persisted.
 */
export async function getDecryptedSecret(args: {
  userId: string;
  provider: "github";
}): Promise<{ id: string; secret: string } | null> {
  const rows = await db
    .select()
    .from(credentialVault)
    .where(
      and(
        eq(credentialVault.userId, args.userId),
        eq(credentialVault.provider, args.provider),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const secret = await decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    wrappedDataKey: row.wrappedDataKey,
    keyVersion: row.keyVersion,
  });
  return { id: row.id, secret };
}

/** Best-effort last-used timestamp bump (called after a successful PAT-backed fetch). */
export async function touchLastUsed(id: string): Promise<void> {
  try {
    await db
      .update(credentialVault)
      .set({ lastUsedAt: new Date() })
      .where(eq(credentialVault.id, id));
  } catch {
    // non-fatal — last_used is informational
  }
}
