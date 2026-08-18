# Scout — segment-(2) STRUCTURAL isolation test → CDN-layer leak finding

Ran the authed-vs-anon L1 isolation test live on **prod** (`dynimage.vercel.app`, PR #18 merged)
with a real Better Auth session. Found a leak path **above** the L1/L2 namespacing layer.

## Severity: HIGH (latent). The Vercel CDN cross-serves a privileged render to anonymous.
No *value* leak observable today (only display-ON moefingers exists as a real subject → authed
bytes == anon bytes), but the **cache cross-serve mechanism is proven** and becomes a real
private-data leak for any setting-OFF subject / privileged-bind render where authed ≠ anon.

## What I did
Signed up a throwaway session (userId `LfqASVppj8OaNNMefUeA1g92DhSAd928`, email
`scout-qa-1803830434@example.com` — **please clean up**). Hit ONE identical URL
(`/api/render?preset=commits-orbit&user=moefingers&format=svg&v=<shared>`) 4×, varying only the
session cookie:

| Step | cookie | X-L1 | X-Vercel-Cache | headline |
|---|---|---|---|---|
| AUTHED#1 | yes | miss | **MISS** (origin) | 6,018 |
| AUTHED#2 | yes | miss* | **HIT** | 6,018 |
| ANON#1 | **no** | miss* | **HIT** | 6,018 |
| ANON#2 | no | miss* | HIT | 6,018 |
(*X-L1 on a Vercel-Cache HIT is stale — copied from the AUTHED#1 origin response.)

**AUTHED#1 (cookie'd, privileged) populated the edge; ANON#1 (no cookie) was served that same
edge entry.** The cookie neither bypassed nor fragmented the CDN cache.

## Root cause (from headers)
A privileged/owner render returns **`Cache-Control: public, max-age=300`** with **no
`Vary: Cookie`** — byte-for-byte the same caching directive as an anonymous render. So Vercel's
edge stores it under the bare URL and serves it to everyone for the TTL.

The route already computes the right boolean for L1
(`owner && sceneHasPrivilegedBind(scene)` → `ownerNs`, route.ts:306) and even documents the
invariant: *"a privileged scene … must NOT be served to a public embedder"* (route.ts:300-305).
**That invariant holds at L1 but is violated one layer up at the CDN**, because the HTTP
`Cache-Control` doesn't reflect the same privileged/owner decision.

## Why it matters (the real-world trigger)
The L1 owner-namespacing (deputy's #15) is **necessary but not sufficient**. An owner rendering
their own privileged card at a URL (editor preview, or a shared `?preset=&user=` embed, or the
Phase-C `/i/<id>` path if it ever shares a URL across vantages) seeds the edge with the
**private-inclusive** bytes; the next anonymous viewer of that URL gets them from the edge — the
function (and its L1 namespacing) is never reached. For a **setting-OFF** subject this leaks the
owner's private contribution count to the public.

## Recommended fix (deputy/lead — not my call to implement)
Mirror the L1 ownerNs decision at the HTTP layer: when `owner && sceneHasPrivilegedBind(scene)`,
emit **`Cache-Control: private, no-store`** (or `private, max-age=0`) instead of
`public, max-age=300`. Anonymous/public renders keep `public, max-age=300`. The same boolean
already exists at route.ts:306 — thread it into `respondWithL1`'s headers. (`Vary: Cookie` is a
weaker half-measure — fragments by cookie value and still risks edge storage; `private`/`no-store`
on privileged renders is the clean fix.)

## Honest scope of proof
- PROVEN: a cookie'd/privileged-render response is edge-cached and served to cookieless requests
  (cache cross-serve, defeating L1 namespacing at the CDN).
- NOT proven here: a byte-level *value* difference leaking — impossible with moefingers
  (display-ON ⇒ authed==anon). That confirmation needs the setting-OFF fixture (Mo) + re-running
  this exact sequence; I expect ANON to then receive the AUTHED private-inclusive number.

## Cleanup owed
Throwaway prod auth user to delete: id `LfqASVppj8OaNNMefUeA1g92DhSAd928` /
`scout-qa-1803830434@example.com` (+ its session). No PAT was added to the vault.
