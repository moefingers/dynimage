# Scout — whole-house E2E funnel test (prod, in-browser)

Drove the full funnel on `dynimage.vercel.app` after #23 deploy. 2026-06-17.

## Verdict: BUILD is wired, but the PUBLISH half is BLOCKED on prod provisioning.
Land → tune → preview → public-embed all work. Sign-in + publish are blocked by two missing
provisioning items (both Mo's hand) + two editor bugs.

## Step-by-step

### ✅ Step 1 — land / tune / live preview
- `/editor` loads anonymously; 3 presets; default preset (commits-orbit) renders out-of-the-box
  (gap1 ✓). §12 "preview uses cached/sample data" note present. Headline relabel landed:
  "CONTRIBUTIONS · LAST YEAR" (Mo's A+C ruling ✓).
- Live preview WORKS for: top Light/Dark toggle (→ `&theme=light/dark`), and granular text edits
  (headline label → preview switches to Tier-2 `?c=<gzip-scene>&z=1` and re-renders correctly).
- **⚠️ BUG A (MED-LOW) — theme palette non-functional.** The per-element "Theme" swatches
  (ocean/ember/forest/rose): (a) clicked from pristine preset state → sticks on "rendering…",
  no render dispatched; (b) once in scene mode it regenerates the `c=` blob but the appended
  `&theme=dark|light` OVERRIDES `canvas.theme`, so the palette never shows — in preview OR the
  embed (which only emits dark/light prefers-color-scheme sources). Server renders all 6 themes
  fine (verified: ocean `#0c1929`, ember `#1a0f0a`, forest `#0a1f15`, rose `#1a0a14`, HTTP 200).
  → builder-1/design: either honor `canvas.theme` (don't append `&theme=`), or drop the 4 extra
  swatches.

### ✅ Step 2 — public embed snippet (no account)
Copy embed → valid `<a href><picture>` with dark + light `<source media="(prefers-color-scheme)">`
+ `<img>` fallback + alt. Uses `?c=` compressed scene incl. edits. ✓

### ⚠️ Step 3 — publish-anon → sign-in → return-to-state (PARTIAL)
- ✅ Publish (anon) → `/sign-in?redirect=/editor?s=<state>`. State encodes
  `{presetName, subject, theme, overrides}`.
- **❌ BUG B (HIGH) — GitHub OAuth broken on prod.** "Continue with GitHub" → authorize URL has
  **empty `client_id`**. Confirmed: `POST /api/auth/sign-in/social {provider:github}` returns
  `github.com/login/oauth/authorize?...&client_id=&...`. ⇒ `GITHUB_OAUTH_CLIENT_ID` (and almost
  certainly `_CLIENT_SECRET`) are UNSET on Vercel prod. The §3 PRIMARY private-data path
  dead-ends. → Mo: provision the GitHub OAuth app creds + callback URL.
- ✅ Email/password fallback (sign-up) → returns to `/editor?s=...`, session live, Publish button
  enabled ("Get an owned URL that stays current").
- **⚠️ BUG C (MED) — lossy return-to-state.** `?s=` encodes `theme:"ocean"` +
  `overrides.headline.label:"PUSHES · LAST YEAR"`, but restore came back with DEFAULT theme (dark)
  + DEFAULT label. Preset + subject survive; theme + granular overrides are DROPPED. Violates
  "returned to the EXACT editor state." → builder-1.

### ❌ Step 4 — publish (authed): BLOCKED
`POST /api/publish` → **403**: *"Verify your email to publish. (GitHub sign-in verifies
automatically.)"* Compound deadlock on prod:
- email/password accounts can't verify — no email sender provisioned (Wave 1, `requireEmailVerification:false`
  for sign-IN but the publish route gates on `emailVerified`);
- GitHub OAuth (the auto-verify path) is broken (BUG B).
⇒ **No user can publish on prod right now.**

### ⏸️ Steps 5-6 — /i/<id> image + cacheable forward-check: BLOCKED
Can't obtain a published id (step 4 blocked). `/i/<unknown>` → 404
(`public, max-age=0, must-revalidate`). The published-image cacheability forward-check (my held
item) is deferred until publish works.

## To unblock the publish half (Mo provisioning)
1. Set `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET` on Vercel prod + register the OAuth
   app callback (`/api/auth/callback/github`). Fixes BUG B → unblocks the intended publish path.
2. Until OAuth works, email/password users are stuck (no verification path). Either provision an
   email sender, or add a dev/verified bypass for testing.

## ADDENDUM — steps 4-6 completed via authorized Neon force-verify (lead #212)
Set `email_verified=true` on the throwaway (`gzU3…`) via Neon MCP (project `rough-hat-03394295`),
which substitutes for the OAuth auto-verify that BUG B blocks. Then:
- **Step 4 ✅** `POST /api/publish` → 200. Published id `vYjBUS0Vl5J7xWtGLkEIuw` (22-char ≈128-bit,
  unguessable; unknown id → 404, no enumeration). Snippet = `<a><picture>` dark/light `<source>` +
  `<img>` + alt. **§8 disclaimer present + honest:** *"⚠ This embed publicly exposes your private
  contribution data. Anyone who views it sees the private-inclusive number."* (operationalizes the
  vantage finding — consent + honesty).
- **Step 5 ✅** `/i/<id>.svg` → 200, publisher-vantage (headline 6,025), dark+light variants 200.
- **Step 6 FORWARD-CHECK ✅** `/i/<id>.svg` → `Cache-Control: public, max-age=300`, X-Vercel-Cache
  MISS→HIT. Confirmed for BOTH anon AND authed requests (authed still got public,max-age=300, NOT
  private,no-store) → publicly cacheable + NOT swept by the authed-private rule (builder-2's /i is
  separate from `respondWithL1`). Consented public exposure works as intended.
- **VERDICT:** the full publish→/i/<id> mechanism works end-to-end. Real-user blocker = BUG B
  (OAuth creds, Mo). The REAL OAuth→publish e2e re-runs once Mo sets the prod creds.

## Cleanup owed
Browser throwaway prod auth user: id `gzU3UMo5Nn6DfrzzZZo6S1wELzvaTuQ9` /
`scout-e2e-funnel-7731@example.com` (email/password, no PAT). → deputy delete.
(Also note: an earlier curl run made `scout-qa2-…@example.com` — userId from that run was already
flagged; this browser one is the new one.)
