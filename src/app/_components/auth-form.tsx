"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signUp } from "@/lib/auth/client";

// Shared sign-in / sign-up form. CONTEXTUAL: honors ?redirect= so a gated
// action returns the user to their exact prior state (funnel §2/§7 — the
// editor draft is preserved by builder-1; this just routes back). GitHub
// OAuth is the primary private-data path (auto-verifies email → can
// publish); email/password is the standard fallback.

const wrap: React.CSSProperties = {
  maxWidth: 380,
  margin: "64px auto",
  padding: "0 20px",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginBottom: 10,
  borderRadius: 8,
  border: "1px solid #d4d4d8",
  fontSize: 14,
  boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "none",
  background: "#7c3aed",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
const ghBtn: React.CSSProperties = {
  ...btn,
  background: "#18181b",
  marginBottom: 14,
};

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const redirect = sp.get("redirect") || "/account";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "sign-up";

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = isSignUp
      ? await signUp.email({ name, email, password })
      : await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setErr(res.error.message ?? "Something went wrong.");
      return;
    }
    router.push(redirect);
  }

  async function onGitHub() {
    setErr(null);
    await signIn.social({ provider: "github", callbackURL: redirect });
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>
        {isSignUp ? "Create your account" : "Sign in"}
      </h1>
      <p style={{ color: "#71717a", fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        Accounts unlock saving, publishing, and your private numbers. The
        public card never needs one.
      </p>

      <button type="button" style={ghBtn} onClick={onGitHub}>
        Continue with GitHub
      </button>

      <div style={{ textAlign: "center", color: "#a1a1aa", fontSize: 12, margin: "0 0 14px" }}>
        or
      </div>

      <form onSubmit={onEmailSubmit}>
        {isSignUp && (
          <input
            style={input}
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <input
          style={input}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          style={input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        {err && (
          <p style={{ color: "#dc2626", fontSize: 13, margin: "2px 0 10px" }}>
            {err}
          </p>
        )}
        <button type="submit" style={btn} disabled={busy}>
          {busy ? "…" : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p style={{ fontSize: 13, color: "#71717a", marginTop: 16, textAlign: "center" }}>
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <a
          style={{ color: "#7c3aed" }}
          href={`${isSignUp ? "/sign-in" : "/sign-up"}?redirect=${encodeURIComponent(redirect)}`}
        >
          {isSignUp ? "Sign in" : "Sign up"}
        </a>
      </p>
    </div>
  );
}
