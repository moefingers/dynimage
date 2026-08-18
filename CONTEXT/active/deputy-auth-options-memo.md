# Auth / PAT-Storage / Rate-Limit — Options Memo

> Source: deputy read-only scouting, 2026-06-17. PRE-SPEC recon — no decisions, no branch.
> Triggered by lead PREP-AUTH: Mo's vision spec leads with accounts/auth/PAT-storage/rate-limit/usage.

## 1. Current state (audited)

- **No auth of any kind today.** No `middleware.ts`, no session/cookie code, no auth deps (no next-auth/clerk/jwt/bcrypt/oauth). Deps are only: next 16.2.6, react 19, zod 4, @octokit/graphql, sharp, @napi-rs/canvas.
- **One app-wide secret:** `GITHUB_TOKEN` (env) used by `src/lib/data/client.ts` for ALL GitHub GraphQL. Plus `NITROTYPE_API_BASE` (non-secret). No per-user tokens.
- **All consumers are anonymous GET** (camo-friendly image URLs). The `<user>` path segment is the GitHub *subject* being rendered, NOT the requester — there is no concept of "the logged-in user" anywhere.
- **No database / cache / KV** wired in. `.vercel/project.json` = project `dynimage` (team). Region not pinned in repo.
- **Runtime split matters for storage:** card routes are `runtime: "edge"`; `/api/render`, `/api/n/*`, `/api/meta` are `nodejs`. Anything read on the edge render path must be HTTP/fetch-reachable (no raw TCP).
- **Security note (existing):** a real fine-grained GitHub PAT currently sits in `.env.local` (gitignored → not in git; normal dev practice). Flagging only for rotation hygiene — it's the lone secret today. (Not pasted anywhere; not logged.)

## 2. What the spec implies we'll need

Per-user accounts where each user stores their **own GitHub PAT** (so cards render against the requester's token → higher rate limits + private data), plus **per-user rate-limit + usage counters**. Two very different data shapes:

| Need | Shape | Access pattern |
|---|---|---|
| **PAT store** | secret, durable, low-write | read per render (per user), must be encrypted at rest |
| **Rate-limit / usage** | counter, high-write, TTL windows | atomic incr + read on every render |

## 3. Storage options (Next.js 16 on Vercel)

**A. Neon Postgres (Marketplace) — system of record.**
Relational accounts + `api_keys` (encrypted PAT ciphertext) + durable usage/audit. Strong consistency, SQL, migrations. Edge-reachable via `@neondatabase/serverless` (HTTP/WS driver) — the native `pg` TCP driver does NOT work on edge. Neon encrypts storage at rest, but that is NOT sufficient for a secret — PAT must be **app-encrypted before insert**. Best for durability/relations; not ideal as a hot per-render counter (write amplification).

**B. Upstash Redis (Marketplace) — rate-limit + usage counter.**
REST-over-HTTPS → works on edge AND node. `@upstash/ratelimit` gives sliding-window / token-bucket with atomic `INCR`/`EXPIRE`. Ideal hot path: per-user/per-IP limits + usage counters with TTL, globally replicated. Not a system of record for secrets. Could periodically flush aggregate usage → Neon for history/billing.

**C. Edge Config — read-heavy config only.**
Ultra-low-latency edge reads, but writes are slow/API-based. Good for global rate-limit policy, feature flags, allow/deny lists. NOT for per-user PATs (write frequency + secret material) or counters (no atomic incr).

**D. Vercel Blob — not a fit for this lane.**
For large binaries, not tiny secrets or counters. Defer — it pairs with render-output caching (my PERF hotspot #3a), a separate lane.

## 4. Security (PATs are secrets)

- **Envelope / app-level encryption.** Encrypt PAT with AES-256-GCM (Web Crypto `crypto.subtle` — works edge+node); store `ciphertext + iv` in Postgres. Start with a 32-byte master key in Vercel env (`PAT_ENC_KEY`); design the schema so we can upgrade to an external **KMS** (managed data-key, rotation, audit) without a data migration. DB-at-rest alone ≠ secret protection.
- **Decrypt only at use,** in-memory, on the render request. Never return the PAT to the client, never write it to Upstash/Edge Config/logs/cache.
- **Never log.** Audit error paths — `dispatch.ts`/`client.ts` currently surface raw upstream error messages (`errMessage`); ensure a PAT can never land in an error string.
- **Scope-min.** Default users to fine-grained, public-read PATs; request broader scope only for private-data cards. Store `created`/`last_used`; support user revoke (delete row).
- **Edge constraint:** AES-GCM via Web Crypto is edge-OK; if KMS is used, its endpoint must be HTTP-reachable from edge.

## 5. Recommendation

1. **Neon Postgres = system of record** (accounts + app-encrypted PAT + durable usage/audit), accessed via `@neondatabase/serverless` so both edge and node routes can read.
2. **Upstash Redis = hot-path rate limit + usage counter** via `@upstash/ratelimit` (atomic, edge-reachable, TTL); flush aggregates to Neon periodically.
3. **PAT crypto = app-level AES-256-GCM (Web Crypto), key in env now, schema ready for KMS.**
4. **Edge Config** only for global policy/flags (optional). **Blob** deferred to the caching lane.

**The load-bearing decision the lead flagged:** *do per-user PAT lookups happen on the EDGE render path?*
- **If yes** (keep cards edge, render against user PAT): store must be edge-reachable (Neon serverless driver / Upstash REST); accept one auth read per render; cache only the *encrypted* row short-TTL in Upstash, or decrypt per-request in-memory (never cross-request plaintext).
- **If no** (authenticated rendering moves to node routes only): relaxes the edge constraint, simplifies crypto/driver choice, but loses edge latency for logged-in users.
- **My lean:** keep render edge-capable, Neon serverless + Upstash, per-request in-memory decrypt only. Revisit once the spec sets whether anonymous rendering stays the default and auth is opt-in (it should — don't break the existing camo-URL contract for unauthenticated users).

*Final shape waits on Mo's spec; this primes the lane.*

## 6. Addendum — spec extensions (L2 subject cache + mercy ladder)

Lead confirmed the imminent spec extends this memo with two items; both slot onto Neon+Upstash.

**(a) Subject-keyed L2 data cache, 15–60min SWR.** Cache the GitHub *data* per rendered SUBJECT (the GitHub login on the URL), NOT per requester — public data is identical regardless of who asks, so many requesters rendering a popular subject share one fetch. This is L2 above the existing L1 `DedupeCache` (per-request) and supersedes/extends today's only cross-request cache (Next fetch cache, `revalidate: 300` = 5min, no explicit stale-serve window).
- **Insertion point:** the `atom()` factory in `data/atoms.ts` — wrap each atom with a read-through L2. Key = `atom:subject:JSON(params)` (e.g. `userOverview:octocat`), requester- and token-agnostic.
- **Carrier:** Upstash (edge+node reachable, explicit TTL + SWR, cross-region, observable) is the clean fit; alternatively bump the Next fetch-cache window. Recommend Upstash for control + because we're already adding it for rate-limit.
- **Privacy boundary (critical):** subject-keying is only safe for PUBLIC data. The moment a card fetches PRIVATE data via a requester's PAT, that result is requester-specific and must NOT enter the shared subject cache. Today all atoms are public → safe; the L2 key needs a `public|private` flag so private fetches bypass the shared cache (or cache per-key).

**(b) Mercy ladder — BYO-PAT renders don't burn our shared quota.** Two coupled pieces:
- **Token selection (per render):** ladder = (1) requester authenticated AND has a stored PAT → render with THEIR PAT (their GitHub quota); (2) else → shared app `GITHUB_TOKEN` (our quota), gated by our rate limits. Anonymous camo URLs stay on path (2), opt-in auth moves you to (1).
- **Per-key usage accounting (Upstash):** count actual UPSTREAM GitHub calls per key (each user PAT + the shared app token). Drives both the mercy ladder and per-user usage/rate-limit display.
- **Cache×ladder interaction (the win):** a cache HIT makes ZERO GitHub calls → counts against nobody. So usage must be metered on cache MISSES (real upstream calls), not on render requests. Popular subjects served from L2 cost no quota for anyone — the L2 cache is what makes the shared-token path survivable.

**Edge-vs-node placement of cache-key + token-selection.** Both must run before the atom fetch, on whichever runtime renders the card (mostly edge). Required primitives are all edge-safe: requester identity (cookie/session), encrypted-PAT lookup (Neon serverless HTTP driver), decrypt (Web Crypto AES-GCM), Upstash REST for cache + usage. Put it in one runtime-agnostic module the atom layer calls. Per-render order:
`identify requester → select token (PAT vs app) → build L2 key (subject+atom+params+privacy) → read-through L2 (hit ⇒ no quota cost) → on miss: fetch with selected token → meter usage against that token's key → write L2`.

## 7. Spec refinements (design, converged — PROVISIONAL pending Mo sign-off)

**(1) L2 key shape = `provider:subject:metric:SCOPE`.** `public` ⇒ globally shared (one entry serves all requesters). `private` ⇒ ALSO namespaced by owner: `provider:subject:metric:private:owner`. This is a cleaner expression of my privacy boundary: private data isn't *bypassed*, it's cached under an owner-scoped key so it never crosses owners — authenticated users still get cache benefit on their own private view with zero cross-owner leakage. Nuance to carry: private entries likely want a shorter TTL (access can be revoked / data is more volatile), and owner-namespacing also hides the *existence* of private data from other owners.

**(2) Two separate ledgers (do NOT conflate):**
- **(a) Upstream GitHub calls** = cache MISSES only = the quota / mercy-ladder meter. BYO-PAT misses bill THEIR token; only shared-token misses count against our shared quota.
- **(b) Render / compute count, per-OWNER** = a separate abuse meter. Note: this fires on EVERY render including L2 *data* cache hits (L2 caches data, not the rendered image), so it's orthogonal to ledger (a). This is exactly the cost an L3 render-output cache would relieve (ties to PERF hotspot #3a) — worth flagging when we lane caching.

**(3) GUARDRAIL — do NOT build a per-IP rate limiter for EMBEDS.** GitHub camo fetches every embed from camo's IPs with the viewer hidden, so per-IP throttling punishes camo, not abusers. Limit embeds by **subject + owner + cache**; reserve **per-IP for the interactive playground only**. (Supersedes the "per-user/per-IP" phrasing in §2/§4 above — for embeds it's subject+owner+cache, not IP.)
