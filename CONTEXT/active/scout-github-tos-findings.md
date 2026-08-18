# Scout findings — GitHub shared-service-token ToS / rate-limit check (LANE-TOS)

De-risks spec §9 / §141 / mercy-ladder §7. Read-only research, 2026-06-17.

## Verdict

**SAFE AS-DESIGNED for the anonymous front-line tier (one shared service token, 5k/hr
as a *respected global ceiling*, behind subject-keyed L2 caching).** This is exactly the
compliant incumbent model. **One caveat with teeth: a service-token *pool* used to raise
the ceiling above 5k/hr is the ToS gray-to-red move — don't make it the primary scaling
lever.** Treat hitting the 5k ceiling as the trigger to push BYO-PAT/OAuth harder (already
our mercy ladder) and, if we genuinely need more anonymous headroom, prefer a **GitHub App
(installation tokens)** over a raw PAT-rotation pool.

## (a) Does ToS permit one token serving many anonymous readers?

**Yes, as designed.** The governing clause is:

> "You may not share API tokens to exceed GitHub's rate limitations."

Our anonymous path uses **one** service token, **stays under** that token's 5k/hr, and uses
caching to fan out — it *respects* the limit, doesn't exceed it. OAuth/GitHub-Apps exist
precisely to let one app serve many users' API reads; that's normal app usage, **not** the
prohibited "sharing tokens." The "a single login may not be shared by multiple people"
clause is about **human account login**, not an app's service token serving API reads.

Where it flips: **pooling/rotating multiple tokens specifically to get past 5k/hr** is the
literal target of the clause above. Stay single-token-per-quota unless you move to a
legitimately-higher-limit mechanism (GitHub App installation tokens, or BYO per-user PAT).

No ToS requirement for per-user attribution on automated read requests. Standing risk: GitHub
has **discretionary** authority over "abuse/excessive use" and can suspend (email warning
first, usually).

## (b) Secondary-rate-limit / abuse gotchas for high-fanout reads

Primary 5k/hr is the *headline* ceiling; the **secondary** limits are the ones high-fanout
serverless traffic actually trips first:

- **100 concurrent requests, max** — the real risk for us: a burst of cold serverless
  invocations all missing cache and firing upstream at once. **Mitigate:** L2 cache collapses
  fan-out (100 embeds of one subject → 1 upstream/TTL), plus **single-flight per cache key**
  so simultaneous misses coalesce into one upstream call. This is the single biggest lever.
- **900 points/min REST** (a GET = 1 pt) → ~15 req/s sustained before secondary trip. Smooth
  pacing matters more than the hourly number on bursty traffic.
- Secondary limits are **opaque, change without notice, no advance warning**. Honor
  `Retry-After`; if absent, back off ≥60s.
- **Conditional requests (ETag → 304) do NOT count against the primary limit.** Big win for a
  cache-heavy read service — store ETags, revalidate cheaply.

## (c) What the incumbent (github-readme-stats) actually does

- **Public instance:** aggressive long-TTL caching (24h stats / 6d top-langs / 10d pins; min
  user override 21,600s) **+ a multi-PAT rotation pool** — confirmed in source
  (`src/common/retryer.js` cycles `PAT_1..PAT_n`, advancing token on each rate-limit/cred
  error). So the incumbent *does* run a token pool on its public endpoint.
- It's openly **"best-effort and can be unreliable due to rate limits"** — they steer users to
  **self-host with their own PAT** (and "add PAT_2, PAT_3… for more requests") as the reliable
  path.
- **Takeaway:** our design is strictly better-aligned — caching + the mercy ladder that nudges
  BYO-PAT is the same defensive posture, *without* leaning on a pool as the default. If we ever
  add headroom, a GitHub App is the cleaner, attribution-correct, higher-limit route vs. raw
  PAT rotation.

## Sources
- GitHub ToS (token-sharing / single-login clauses) — site-policy/github-terms-of-service
- REST API rate limits (5k/hr primary; 100 concurrent, 900 pts/min secondary) — docs.github.com/rest/using-the-rest-api/rate-limits-for-the-rest-api
- OAuth-app rate limits (5k/hr per app/user; 15k Enterprise) — docs.github.com OAuth-apps rate-limits
- github-readme-stats source `src/common/retryer.js` (PAT_1..PAT_n rotation) + project readme (caching TTLs, self-host guidance)
