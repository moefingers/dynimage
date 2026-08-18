# Scout — leak-test fixture validation (othermbzuiter)

Validated Mo's fixture (envoy #8) with the PAT (owner vantage) + my `gh` (public/foreign
vantage), independent of the app. **Result: NOT READY — no number-gap exists yet.**

## What I found
| Check | Result |
|---|---|
| PAT identity | resolves → `othermbzuiter` (id 294648044), distinct from moefingers ✓ |
| Repo `dynimage-public` via PAT | **404 Not Found** — PAT has no access (or repo absent) |
| Commits in that repo | 404 (can't read) |
| contributionsCollection last-year — OWNER (PAT) | commits **0**, restricted **0**, calendar 1 |
| contributionsCollection last-year — PUBLIC (foreign gh) | commits **0**, restricted **0**, calendar 1 |
| **Gap (owner vs public)** | **none — both ~0.** Value-gap test cannot run. |

`restrictedContributionsCount = 0 on the owner's OWN token` ⇒ there are no private-repo
contributions registered at all. The fixture's private-commit step didn't land.

## What Mo needs to do (the gap = private commits the PAT can see but the public can't)
1. **Repo must exist + be PRIVATE.** `dynimage-public` 404s to the PAT. Create it (PRIVATE — the
   name says "public"; **double-check it's actually private**, else commits count as public →
   visible to anon → no gap).
2. **Grant the fine-grained PAT access to that repo** (Contents: Read, repo selected). The app's
   *authed* render uses THIS PAT — if it can't read the repo (currently 404), even the authed
   render sees 0 and there's still no gap.
3. **Push several commits** to it as othermbzuiter (a few distinct days ideal). Must be on the
   default branch and authored with an email tied to the account, or they won't count in
   contributionsCollection. (Currently 0.)
4. **Set "Include private contributions on my profile" = OFF.** This is what makes the PUBLIC
   vantage EXCLUDE them — creating owner(private-inclusive) > anon(public-only). (Can't verify the
   setting yet — no private contribs exist to test it against; set it OFF when adding commits.)

After Mo tweaks: I re-validate that owner-PAT formula > public formula BEFORE the app-level
value-gap run (which itself waits on deputy's CDN fix).

## Security
The fine-grained PAT was transmitted on the agent bus in cleartext. Treating it as a secret (not
echoed/stored here). **Recommend Mo rotate/revoke it once the value-gap test completes.**
