import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth/auth";
import { getEntitlements } from "@/lib/auth/entitlements";
import { listCredentials } from "@/lib/data/vault";
import { VaultManager, SignOutButton } from "./vault-manager";

export const metadata: Metadata = { title: "Account" };
export const runtime = "nodejs";

const page: React.CSSProperties = {
  maxWidth: 640,
  margin: "48px auto",
  padding: "0 20px",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  color: "#18181b",
};
const card: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in?redirect=/account");
  const user = session.user;
  const [ent, creds] = await Promise.all([
    getEntitlements(user.id),
    listCredentials(user.id),
  ]);
  const initialCreds = creds.map((c) => ({
    id: c.id,
    provider: c.provider,
    label: c.label,
    last4: c.last4,
    scopes: c.scopes,
  }));

  return (
    <div style={page}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 26, margin: 0 }}>Account</h1>
        <SignOutButton />
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Profile</h2>
        <p style={{ margin: "4px 0", fontSize: 14 }}>{user.email}</p>
        <p style={{ margin: "4px 0", fontSize: 13, color: "#71717a" }}>
          Email{" "}
          {user.emailVerified ? (
            <span style={{ color: "#16a34a" }}>verified</span>
          ) : (
            <span style={{ color: "#d97706" }}>
              not verified — verify to publish (GitHub sign-in verifies
              automatically)
            </span>
          )}
        </p>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Plan</h2>
        <p style={{ margin: "4px 0", fontSize: 14 }}>
          Tier: <strong>{ent.tier}</strong>
        </p>
        <ul style={{ fontSize: 13, color: "#52525b", margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Published embeds: {ent.maxPublished ?? "unlimited"}</li>
          <li>Uploaded assets: {ent.maxAssets ?? "unlimited"}</li>
          <li>Private data: {ent.privateDataAllowed ? "allowed" : "no"}</li>
        </ul>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>GitHub tokens</h2>
        <p style={{ fontSize: 13, color: "#71717a", marginTop: 0 }}>
          Connect a fine-grained PAT to render your private-inclusive
          numbers. It is encrypted at rest, never shown again, and never
          logged — we store only a label and the last 4 characters.
        </p>
        <VaultManager initialCreds={initialCreds} />
      </div>
    </div>
  );
}
