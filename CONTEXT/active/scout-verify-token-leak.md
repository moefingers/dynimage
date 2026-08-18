# Scout — VERIFY-TOKEN: prod anon-render leak check (commits-orbit)

Question (lead #155): is the shared app token (`GITHUB_TOKEN` on Vercel) over-scoped —
does the anonymous public render leak moefingers' PRIVATE contribution count?

## Verdict: NO LEAK. Public path is clean. App token = public/foreign vantage.
**But this corrects my earlier #9 prediction and re-frames the BYO-PAT "gap."**

---

## What prod actually serves (fresh, uncached)

`GET https://dynimage.vercel.app/api/render?preset=commits-orbit&user=moefingers&format=svg`
→ headline **6,015 COMMITS · LAST YEAR**, subline **7,163 ALL-TIME**.
`X-L1: miss`, `X-Vercel-Cache: MISS`, and a cache-busted (`&v=`) repeat also MISS — so this is a
live app-token render, not a privileged render served from cache.

That's the **private-inclusive** number (~6,000), not the ~545 public-only number I predicted
in #9. So at first glance it looks like a leak. **It is not** — proof below.

## Why it's not a leak — GitHub already publishes this number

1. **Zero-token public calendar:** `curl` (no auth at all) of
   `github.com/users/moefingers/contributions` sums to **6,049** contributions in the last year.
   GitHub shows ~6,000 to *anonymous* visitors. moefingers has **"Include private contributions
   on my profile" = ON**, so GitHub folds his private contribution COUNTS (never repo
   names/details — `contributionsCollection` only ever exposes counts) into the public graph.
2. **Control subject (torvalds):** my `gh` token is *foreign* to torvalds (= public vantage).
   Foreign query → `totalCommitContributions=3162, restrictedContributionsCount=0`. Prod anon
   render of torvalds → **3,162**. Exact match. Confirms the prod app token renders the
   **public/foreign vantage**, not an all-seeing privileged one.

So the app token is serving exactly what GitHub serves the public. **No private data crosses
the public boundary.** The app token is NOT over-scoped on this evidence — no config fix needed
for a leak.

## The correction (important — re-frames #126/#127)

My #9 said "anonymous shared-token render shows ~545." **That assumed
`restrictedContributionsCount` is owner-only-visible. It isn't** — it's gated by the *target
user's* "include private contributions" setting, NOT by the viewer token's scope:

- Setting **ON** (moefingers): anonymous ALREADY sees ~6,015. **No public/authed gap** — BYO-PAT
  unlocks nothing extra for him.
- Setting **OFF**: anonymous sees public-only; the user's own PAT sees private-inclusive. **The
  gap (and Mo's A+C "BYO-PAT perk") only exists for setting-OFF users.**

## Architecture note for deputy (refines #127)

- `commits-last-year`/`lifetime` expose **counts only**, never private repo details — there is no
  detail-leak vector here regardless of token scope.
- The cache-namespacing risk in #127 is **real but only for setting-OFF subjects**, where
  anonymous(public-only) ≠ authed(private-inclusive). Owner-namespaced L2 keys remain **required**
  so a PAT render can't cache the higher number under a public key. moefingers (setting ON)
  **cannot exercise that path** — both vantages collapse to ~6,015.
- ⇒ **QA gap:** the flagship demo subject is the *worst* subject to prove owner-namespacing with.
  The real segment-(2) e2e leak test needs a subject with the setting **OFF** (or a genuinely
  viewer-scoped private metric like private-repo language bytes). I'll source one for that test.

## One residual hygiene check (not a leak)
I can't tell from outside whether `GITHUB_TOKEN` is a dedicated public-read-only token vs.
someone's personal PAT. It doesn't affect THIS leak result (both produce public-vantage numbers),
but a personal PAT as the shared service token = wrong rate-limit bucket + over-broad scope. Worth
a one-line config confirm with Mo. (Ties to LANE-TOS: prefer a dedicated public-read-only token /
GitHub App.)
