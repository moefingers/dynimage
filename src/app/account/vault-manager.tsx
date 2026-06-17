"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth/client";

export type Cred = {
  id: string;
  provider: string;
  label: string;
  last4: string | null;
  scopes: string[] | null;
};

type Validation = {
  ok: boolean;
  login?: string;
  scopes?: string[];
  unlocks?: string;
  reason?: string;
};

const input: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  fontSize: 13,
  boxSizing: "border-box",
};
const smallBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "none",
  background: "#7c3aed",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      style={{
        ...smallBtn,
        background: "transparent",
        color: "#71717a",
        border: "1px solid #e4e4e7",
      }}
      onClick={async () => {
        await signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

export function VaultManager({ initialCreds }: { initialCreds: Cred[] }) {
  const [creds, setCreds] = useState<Cred[]>(initialCreds);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Initial list comes from the server (SSR); refresh only after a mutation.
  async function refresh() {
    const res = await fetch("/api/account/credentials");
    if (res.ok) setCreds((await res.json()).credentials ?? []);
  }

  async function onValidate() {
    setErr(null);
    setValidation(null);
    if (!token) return setErr("Paste a token first.");
    setBusy(true);
    const res = await fetch("/api/account/credentials/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setBusy(false);
    if (!res.ok) return setErr(await res.text());
    setValidation((await res.json()) as Validation);
  }

  async function onSave() {
    setErr(null);
    if (!label) return setErr("Add a label.");
    if (!token) return setErr("Paste a token.");
    setBusy(true);
    const res = await fetch("/api/account/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, token }),
    });
    setBusy(false);
    if (!res.ok) return setErr(await res.text());
    setLabel("");
    setToken("");
    setValidation(null);
    refresh();
  }

  async function onDelete(id: string) {
    await fetch(`/api/account/credentials/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div>
      {creds.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
          {creds.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid #f4f4f5",
                fontSize: 13,
              }}
            >
              <span>
                <strong>{c.label}</strong>{" "}
                <code style={{ color: "#a1a1aa" }}>···{c.last4}</code>
                {c.scopes?.length ? (
                  <span style={{ color: "#71717a" }}> · {c.scopes.join(", ")}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#dc2626",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <input
          style={input}
          placeholder="Label (e.g. 'my fine-grained PAT')"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          style={input}
          type="password"
          placeholder="github_pat_…"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setValidation(null);
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={{ ...smallBtn, background: "#3f3f46" }}
            onClick={onValidate}
            disabled={busy}
          >
            Check what it unlocks
          </button>
          <button type="button" style={smallBtn} onClick={onSave} disabled={busy}>
            Save token
          </button>
        </div>
      </div>

      {validation && (
        <p
          style={{
            fontSize: 13,
            marginTop: 10,
            color: validation.ok ? "#16a34a" : "#dc2626",
          }}
        >
          {validation.ok
            ? `✓ ${validation.unlocks ?? `Authenticated as ${validation.login}`}`
            : `✗ ${validation.reason ?? "Invalid token"}`}
        </p>
      )}
      {err && (
        <p style={{ fontSize: 13, marginTop: 10, color: "#dc2626" }}>{err}</p>
      )}
    </div>
  );
}
