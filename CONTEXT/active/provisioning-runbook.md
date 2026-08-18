# Provisioning Runbook — dynimage (for Mo)

> Author: deputy. Updated 2026-06-18 — consolidated ALL remaining pending-Mo
> items into one batch you can do in a single sitting. **The Wave-1 core
> (Neon, Upstash, GitHub OAuth, Better Auth, PAT key) is already provisioned
> and live** — that's the reference appendix at the bottom. Only **Part A**
> below is outstanding.

## Setting env vars — three ways (pick one per var)
- **Dashboard:** Vercel → project **dynimage** → **Settings → Environment Variables** → Add (scope: Production [+ Preview]).
- **CLI:** `vercel env add <NAME> production` (paste value when prompted). CLI is installed + linked (`recanon/dynimage`).
- **REST (your secrets workflow):** `SetEnvironmentVariable` via the Vercel REST API.

Integration-injected vars (Neon/Upstash/Blob) appear automatically — you don't paste those.

---

# PART A — REMAINING (batch in one sitting)

| # | Item | Type | Blocks |
|---|---|---|---|
| A1 | Vercel **Blob** store → `BLOB_READ_WRITE_TOKEN` | dashboard (auto-injects) | live asset uploads (§10) |
| A2 | `REPORT_IP_SALT` | generate + set env | report IP-hash not precomputable (§11) |
| A3 | `ADMIN_USER_IDS` = your user id | find id + set env | admin-disable of abusive embeds (§11) |
| A4 | Swap `GITHUB_TOKEN` → dedicated public-read-only PAT | create token + replace env | rate-bucket + scope hygiene (Stab#11) |
| A5 | Rotate `VERCEL_SUPER_TOKEN` | mint new + revoke old | leaked to a log (Stab#22) |
| A6 | Value-gap leak-test fixture (`othermbzuiter`) | GitHub account setup | scout's number-gap QA (#11) |

Security-grade secrets: **A2, A4, A5** (and the existing `PAT_ENC_KEY`/`BETTER_AUTH_SECRET`). None are leak-active today; this is hygiene + enabling the last QA + assets.

## A1 — Vercel Blob store (`BLOB_READ_WRITE_TOKEN`)
1. Vercel → project **dynimage** → **Storage** → **Create Database** → **Blob** → **Create**.
2. Connect to **dynimage**, **all environments**. It auto-injects **`BLOB_READ_WRITE_TOKEN`** — nothing to paste.
3. (No region choice for Blob.) Done — builder-2's asset upload uses it.

## A2 — `REPORT_IP_SALT`
1. Generate a random value: `openssl rand -hex 16` (or `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`).
2. Set env var **`REPORT_IP_SALT`** = that value (Production [+ Preview]).
   - Why: without it, `/api/report` hashes reporter IPs with a known dev salt → precomputable. Any random value fixes it (no specific format).

## A3 — `ADMIN_USER_IDS` (= your Better Auth user id)
1. **Find your user id** (easiest): sign in to the deployed app, then open **`https://<prod-domain>/api/auth/get-session`** in the browser → copy `user.id` from the JSON.
   - Alt: in Neon SQL, `SELECT id FROM "user" WHERE email = '<your email>';`.
2. Set env var **`ADMIN_USER_IDS`** = that id (comma-separated if multiple admins).
   - Why: without it, **no one** can admin-disable a reported embed (the route fail-closes). The report→auto-flag still works regardless.

## A4 — Swap `GITHUB_TOKEN` → dedicated public-read-only PAT
> `GITHUB_TOKEN` is currently your **personal** PAT. No leak today (verified public-vantage), but a dedicated token = correct rate-bucket + minimal scope, and removes a latent edge (a personal token can see its owner's private contribs).
1. GitHub → **Settings → Developer settings → Fine-grained PAT** → **Generate new token**.
2. Resource owner = a dedicated/your account; **Repository access: Public repositories (read-only)**; no account permissions needed beyond default public read. (Classic alternative: `public_repo` / no scopes — public read.)
3. Replace env var **`GITHUB_TOKEN`** with the new token (Production [+ Preview]). Revoke the old personal one from the app's env (keep it for your own use).

## A5 — Rotate `VERCEL_SUPER_TOKEN`
> The token value leaked into a log (a `$`-var expanded in a shell message). Accepted-burned, low blast radius, but rotate when convenient.
1. Vercel → **Account Settings → Tokens** → create a **new** token (same scope as the old automation token) → copy.
2. Update wherever it's used (your automation / MCP config) + the env var **`VERCEL_SUPER_TOKEN`** if set.
3. **Revoke the old token** in the Vercel Tokens list.

## A6 — Value-gap leak-test fixture (`othermbzuiter`)
> For scout's number-gap QA (the security *mechanism* is already proven; this confirms the public-vs-private number delta). Earlier attempt showed 0 contributions — the commits didn't register.
1. On **`othermbzuiter`**: Settings → Public profile → **uncheck** "Include private contributions on my profile" → Save.
2. In the **private** repo, make **~5 commits on distinct days authored with an email VERIFIED on the othermbzuiter account** (GitHub only counts a contribution when the commit email matches a verified account email — this is why it showed 0 before). Push.
3. Wait a few minutes, then hand the **handle + its PAT** to scout (or deputy to re-verify the gap first). The fixture PAT already shared is fine to reuse, or reissue.

---

# PART B — ALREADY PROVISIONED (Wave-1 reference)

> ✅ Done + live. Kept for reference / re-provisioning. Names code targets:

| # | Resource | env var(s) | status |
|---|---|---|---|
| 1 | Neon Postgres | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | ✅ live (3 migrations applied) |
| 2 | Upstash Redis (KV integration) | `UPSTASH_DYNIMAGE_KV_REST_API_URL/_TOKEN` | ✅ live |
| 3 | GitHub OAuth App | `GITHUB_OAUTH_CLIENT_ID/_SECRET` | ✅ live |
| 4 | Better Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | ✅ set |
| 5 | PAT vault master key | `PAT_ENC_KEY`, `PAT_ENC_KEY_VERSION` | ✅ set |

Region for Neon/Upstash: **us-east-1 / iad1** (colocated). The detailed click-by-click for these is below.

---

## 1. Neon Postgres (system of record)

1. Vercel dashboard → project **dynimage** → **Storage** tab → **Create Database** (or **Browse Marketplace**).
2. Pick **Neon** → **Continue**. Plan: **Free** is fine to start (0.5 GB). Region: **AWS us-east-1**.
3. Name it (e.g. `dynimage-db`) → **Create**. Accept the Vercel↔Neon connection.
4. When prompted, **connect it to the `dynimage` project** and to **all environments** (Production + Preview + Development).
5. Neon's integration auto-injects env vars into the Vercel project. **Verify the names** are `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
   - ⚠️ If the integration instead injects `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING` (older naming), tell deputy — it's a 1-line alias in `lib/db/client.ts`, no schema change.
6. **Run the migration** (creates the 8 tables) once envs exist:
   ```bash
   vercel env pull .env.local        # pulls DATABASE_URL_UNPOOLED locally
   pnpm db:migrate                   # applies drizzle/0000_auth_foundation.sql
   ```
   (Preview branch DBs are auto-created by the Neon integration — no action.)

## 2. Upstash Redis (L2 cache + usage + locks)

1. Vercel → **Storage** → **Browse Marketplace** → **Upstash** → **Redis**.
2. Plan: **Free** is fine to start. Region/primary: **us-east-1**. Name e.g. `dynimage-redis`.
3. Connect to **dynimage**, all environments.
4. ✅ CONFIRMED (Mo's env): the Upstash-KV integration injects PREFIXED names — **`UPSTASH_DYNIMAGE_KV_REST_API_URL`** + **`UPSTASH_DYNIMAGE_KV_REST_API_TOKEN`**. `redis.ts` reads these (with a fallback to the generic `UPSTASH_REDIS_REST_*`). No action needed — already injected by the integration. (Also present, unused: `*_READ_ONLY_TOKEN`, and `UPSTASH_DYNIMAGE_KV_URL` / `UPSTASH_DYNIMAGE_REDIS_URL` rediss:// for the non-REST driver.)

## 3. GitHub OAuth App (primary private-data identity)

> This is NOT the same as `GITHUB_TOKEN`. It's a new OAuth application.

1. github.com → your avatar → **Settings** → **Developer settings** (bottom left) → **OAuth Apps** → **New OAuth App**.
2. Fill in:
   - **Application name:** `dynimage`
   - **Homepage URL:** `https://<your-prod-domain>` (e.g. the Vercel prod URL)
   - **Authorization callback URL:** `https://<your-prod-domain>/api/auth/callback/github`
3. **Register application.**
4. Add the **local dev callback** too: on the app page → **Add another callback URL** (or the "Callback URLs" list) → `http://localhost:3000/api/auth/callback/github`. Save.
   - (If your GitHub plan only allows ONE callback URL, register a **second** OAuth app named `dynimage-dev` with the localhost callback and use its creds in `.env.local`.)
5. Copy the **Client ID** → `GITHUB_OAUTH_CLIENT_ID`.
6. **Generate a new client secret** → copy immediately (shown once) → `GITHUB_OAUTH_CLIENT_SECRET`.
7. Set both in Vercel (see §6) and `.env.local`.

## 4. Better Auth secret + URL

1. Generate a secret (32 random bytes):
   ```bash
   openssl rand -base64 32
   # or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   → `BETTER_AUTH_SECRET`.
2. `BETTER_AUTH_URL` = the base URL per environment:
   - Production: `https://<your-prod-domain>`
   - Local dev: `http://localhost:3000`

## 5. PAT vault master key (encrypts user PATs at rest)

> 🔐 **Most sensitive secret.** It wraps the keys that encrypt every stored PAT.
> Generate a NEW, distinct value for production (do not reuse a dev key).

1. Generate 32 bytes, base64:
   ```bash
   openssl rand -base64 32
   ```
   → `PAT_ENC_KEY` (must decode to exactly 32 bytes — `openssl rand -base64 32` does).
2. Set `PAT_ENC_KEY_VERSION` = `1`.
3. ⚠️ **Store it somewhere safe (password manager).** If it's lost, every stored PAT becomes undecryptable (users just re-add their token — not catastrophic, but disruptive). Rotation later is supported (bump version, re-wrap) without re-encrypting secrets.

---

## 6. Setting env vars in Vercel

Per variable (CLI is fastest now that it's installed + linked):
```bash
vercel env add BETTER_AUTH_SECRET production      # paste value when prompted
vercel env add BETTER_AUTH_SECRET preview
vercel env add BETTER_AUTH_URL production
vercel env add GITHUB_OAUTH_CLIENT_ID production
vercel env add GITHUB_OAUTH_CLIENT_SECRET production
vercel env add PAT_ENC_KEY production
vercel env add PAT_ENC_KEY_VERSION production
# (Neon + Upstash vars are injected automatically by their integrations.)
```
Or via dashboard: project **dynimage** → **Settings** → **Environment Variables** → add each, scope to the right environments.

Then pull locally so dev matches:
```bash
vercel env pull .env.local
```

## 7. Verify (once everything is set)

```bash
vercel env pull .env.local
pnpm db:migrate          # tables created (idempotent; safe to re-run)
pnpm build               # no Better Auth "default secret"/"missing clientId" warnings now
pnpm dev                 # then visit /api/auth/sign-in/github → GitHub OAuth round-trips
```
End-to-end auth→render verification waits on the Wave-2 auth-wiring lane (deputy) —
this runbook just makes the resources + envs live.

## Full env var reference (also in `.env.example`)

| Var | Source | Secret? |
|---|---|---|
| `GITHUB_TOKEN` | existing shared app PAT | yes |
| `DATABASE_URL` | Neon integration (pooled) | yes |
| `DATABASE_URL_UNPOOLED` | Neon integration (direct, migrations) | yes |
| `UPSTASH_DYNIMAGE_KV_REST_API_URL` | Upstash-KV integration (auto) | no |
| `UPSTASH_DYNIMAGE_KV_REST_API_TOKEN` | Upstash-KV integration (auto) | yes |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth app | no |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app | yes |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | yes |
| `BETTER_AUTH_URL` | per-env base URL | no |
| `PAT_ENC_KEY` | `openssl rand -base64 32` (32 bytes) | yes 🔐 |
| `PAT_ENC_KEY_VERSION` | `1` | no |
| `NEXT_PUBLIC_BASE_URL` | per-env base URL (existing) | no |
