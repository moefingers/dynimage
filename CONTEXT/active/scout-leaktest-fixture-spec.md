# Scout — segment-(2) authed-PAT leak-test fixture spec

The real owner-namespacing e2e leak test (lead #155/#165) needs a subject that actually
exposes a public-vs-authed GAP. **moefingers can't** (setting ON → anon already == authed).
This spec defines the fixture deputy should provision alongside the login work.

## Why a stranger won't work (must be a PAT-owned account)
The leak path is: `anon render (public-only)` < `authed render (private-inclusive)` for the SAME
subject. That gap exists only when the subject **(i)** has "Include private contributions on my
profile" = **OFF** AND **(ii)** has real private-repo commit contributions. From outside you
**cannot confirm (ii) when (i) is true** — if the setting is OFF, a foreign token sees the
private count as 0, so you can't tell a stranger even HAS a gap to leak. ⇒ the subject must be an
account we hold the PAT for (deputy's test/login account).

## Codebase reality (verified)
Only ONE vantage-sensitive metric exists today: `commits-last-year` / `lifetime-commits`
(`atoms.ts` — `totalCommitContributions + restrictedContributionsCount`). Every repo/language
query is explicitly `privacy: PUBLIC`, so there's **no viewer-scoped-private metric** to test
instead. The setting-OFF construction below is therefore the path (until/unless a private-reading
metric is added, which would be a cleaner anon=0/authed>0 vector).

## Fixture: configure the test account
1. **Setting OFF:** GitHub → Settings → Public profile → **uncheck** "Include private
   contributions on my profile." (Verify — don't assume.)
2. **Create the gap:** a **private** repo under that account, push **several commits on distinct
   days** → `restrictedContributionsCount` > 0 for the owner's own token, while the public/app-
   token vantage sees only public commits.
3. **PAT:** a token for that account that can see its own private contributions
   (`contributionsCollection` requires the owner's token; fine-grained with the account's repos,
   or classic `read:user`+`repo`).

## The test (once login lands — I'll drive it)
Let `N_pub` = anon render (app token) of `subject=testacct`; `N_priv` = authed render with
testacct's PAT. **Provision so `N_priv > N_pub`** (that's the whole point).

Assertions:
- **authed→anon:** render authed (caches `N_priv`), then anon → must STILL return `N_pub`, never
  `N_priv`. (no private bleed to the public key)
- **anon→authed:** render anon (caches `N_pub`), then authed → must return `N_priv`, not a stale
  `N_pub`. (public cache must not suppress the authed number)
- **two owners:** owner-A authed never sees owner-B's private number, and vice-versa.
- **key inspection:** the authed render's L2/L1 key is owner-namespaced (private scope), provably
  distinct from the anon public key (`provider:subject:metric:public`).
- (bonus) busting one vantage's cache (`&v=`) doesn't perturb the other.

## What I need from deputy when ready
preview/prod URL with the login live · the test account handle · its PAT (or a throwaway I can
use) · confirmation the setting is OFF + the private repo has commits. Then I run the matrix and
report pass/fail per assertion.
