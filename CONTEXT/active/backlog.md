# dynimage — ordered backlog (the lead's queue)

> **Single ordered list, worked top-down. Order = blast radius (what it blocks), not feel.**
> Promotion is the only move: an item rises only as far as what it provably blocks.
> The list drains to empty — or to items blocked by something the work cannot reach.
> Nothing noticed is dropped: every item here is either *in a lane*, *queued*, or *recorded*.
> Per Zcanon: [the-whole-house], [total-effect], [confidence-is-not-evidence].
>
> Source of truth for *what we're building*: `design-vision-spec.md` (LOCKED, Mo-signed).
> This file is *what's done / in-flight / owed*, kept current by scribe on every merge.

Status legend: **LANE** (assigned, in flight) · **QUEUED** (sequenced, deps noted) · **RECORDED** (noticed, not yet laned) · **DONE** (merged).

> **WHOLE-HOUSE BUILD (Mo-directed, [the-whole-house]):** build the **full product**, not a chosen lane.
> (The lead's earlier A/B/C/D phase framing was corrected to whole-house per Mo.)
>
> **🏠✅ STATUS (2026-06-18): v1 BUILD + UX FULLY COMPLETE.** Every spec lane + every QA gap closed —
> **all PRs #5–#37 merged, 0 open build items.** The funnel is REAL-USER PROVEN end-to-end on prod (Mo
> published `/i/64F-HwM8WPA8l8RjsDH_4g`; Stab #17 PASS, server-side leak-clean Stab #12 ✅). Done: scene/
> element model, encoding tiers, decompose+presets, L0/L1/L2 caching, mercy ladder, auth+PAT vault, publish
> lifecycle, accounts, full editor B1+B2, assets UX, moderation, recanon tagline. **The ONLY remaining
> things: (1)** the **Mo provisioning batch** (Blob, salts, admin-ids, region, preview vars) — the one gap
> to **fully-live**; **(2)** the **DEFERRED/OWED** QA below (all non-blocking, Mo-deferred or owner-tracked).
> **Caveat:** first-OAuth needs a retry (Stab #23, fix merged, live-retest deferred). *(Mo directed: QA
> deferred, kept tracked loudly.)*

## ⚠️ DEFERRED / OWED (Mo-directed — do NOT bury; each tracked till closed)

| # | Item | Owner | Why safe-to-defer |
|---|---|---|---|
| Stab #25 | **design deploy re-verify** — §8 disclaimer render-at-publish + published-snippet look (neither eyeballed live) | design (on deploy) | verify in code/UI later; copy + snippet exist, just not visually confirmed |
| Stab #23 | first-OAuth `unable_to_get_user_info` — **FIX MERGED** (PR #26), **pending live re-test** | Mo/scout (retest on deploy) | fix in + 66/66; only the live first-OAuth retry confirm is deferred |
| Stab #22 | rotate **`VERCEL_SUPER_TOKEN`** (leaked to bus log #223) | Mo | Mo accepted-burned; no active exploit, low blast radius |
| #11 | **value-gap** authed leak test (number-half) | Mo (fixture) | mechanism already proven; needs `othermbzuiter` = verified-email commits + private-contribs OFF |
| Stab #11 | swap **`GITHUB_TOKEN`** → dedicated public-read-only PAT | Mo | no leak today (verified public-vantage); rate-bucket + hygiene only |
| ~~Stab #24~~ | ~~publish snippet `<picture>` vs design §3~~ → **CLOSED** (PR #27, single themed `<img>`) | — | done; design re-verify folded into Stab #25 |

*(Queued, not owed-QA: Phase-C **#14 assets — now LANE (builder-2, §10 raster-only)** / #15 report; B2 canvas editor.)*

---

## In flight — Wave 1 (3 independent tracks, no shared-file collision) — ALL DONE (Phase A core)

1. **scene/element model — keystone** · `scene-element-model` · builder-1 · **DONE** (PR #5, shepherd@0ce688f)
   - Blast radius: HIGHEST — blocks the editor (the moat), encoding integration, decompose, presets, and the v1 Definition of Done (rebuild Mo's README from elements+presets).
   - Contract-first PR (Scene/Element/anchor/registry/`/api/meta` matrix) before any decompose. Lead reviews closely.
   - **Acceptance is OUTCOME, not inventory:** the contract PR must demonstrate ≥1 real element rendering through the new pipeline at an unchanged URL — not just "types compile."
   - Landed: per-element-id `<defs>` namespacing (resolves Stab #2), the `/api/meta` subject-kind matrix (Queued #6), proven empirically (`bg__wash`/`orb__wash`).

2. **auth/storage/crypto foundation + atom() seam** · `auth-foundation` · deputy · **DONE** (PR #7, shepherd@8972dc8)
   - Blast radius: HIGH — blocks accounts, publish, private data, per-owner metering, mercy ladder.
   - Owns `data/*` + crypto + auth + tables. Atom-seam = standalone callable (token-select + L2 + meter); dispatch wiring is QUEUED (item 4) to avoid colliding with builder-1.
   - Landed: Better Auth + AES-256-GCM envelope crypto (8 committed tests) + Neon schema + atom L2 seam. Lead verified merged build + tests + boundary. (Was bounced once for missing crypto tests + rebase; re-submitted and merged.)
   - Coded against interfaces; live verification still needs provisioning (see PROVISIONING below).

3. **encoding codec** · `encoding-codec` · builder-2 · **DONE** (PR #6 — module shepherd@d6aa993 + route cap shepherd@37c9469)
   - Blast radius: MEDIUM — blocks editor blob output + `/api/render` integration. **Carried the [SEC] decompression-bomb fix** (Stab #1, now closed).
   - base64url + gzip-by-size + `v:1` envelope; `MAX_DECODED_BYTES` cap on decode + tests. Route wiring (`decodeParam` → `inflateCapped`) caps BOTH `?spec=` + `?scene=` transports.

---

## Queued — Wave 2 (dependency-ordered; each unblocks when its dep merges)

4. **auth → dispatch entry-wiring** · **DONE** (PR #15, shepherd@6074393) — `RenderContext` threaded through the render path; `deriveCacheKey` leak-proof vantage scoping; mercy-ladder metering on render; **L1 + L2 owner-namespacing for privileged scenes**; falsifiable leak test; **edge routes untouched**. Lead security-review + builder-1 contract-review both PASS. *(Authed-PAT HTTP e2e still owed → #11, gated on Phase C login.)*
5. **decompose README elements + 3 flagship presets** · **DONE** (PR #10, shepherd@bed4951) — **v1 Definition of Done CODE-COMPLETE; lead visual-check PASS.** **DoD QA COMPLETE — full pass:** design-fidelity = CLEAN FULL PASS (teal = raster artifact, not fidelity loss; SMIL fires; no-collision holds), scout data = PASS (typing-orbit exact 150/175). Two findings reclassified, neither a DoD fail: Stab #8 (sheen) → POLISH, Stab #9 (commits vantage) → product/security follow-ups. **Remaining for DoD-USABLE (embeddable) = the `?preset=` transport (#10, in flight).** NOTE: presets aren't README-embeddable until the `?preset=` transport (#10) lands. Added elements `orbit`/`lattice`/`tile-grid` + the 3 flagship presets; folded in Stab #5 + #6 (both DONE below).
   - Namespacing edge-cases (surfaced by #5) — **both CLOSED** in this PR:
     - (a) `namespaceIds` now rewrites SMIL bare-id refs ✓ (`begin="x.end"` handled).
     - (b) `__` separator replaced with an **index-prefix** scheme ✓ (ambiguous-collision risk gone).
6. **`/api/meta` metric↔subject-kind matrix** · **DONE** — landed inside #5 (PR #5, shepherd@0ce688f).
7. **publish → embed lifecycle + pre-warm + snippet gen** (§8) · **DONE** (PR #17, shepherd@ee00116) — `/i/<id>` render-by-id (image-only, never config JSON; 128-bit unguessable; publisher-vantage owner-namespaced; disabled = 404, indistinguishable from missing). Transactional `publishEmbed` (library-only, sole caller = deputy's gated action) + pre-warm L1/L2 across snippet theme variants + `<a>`/`<picture>` snippet gen with stable `?cb=`. Lead build + security review PASS, 60/60.
8. **L1/L3 render-output cache** (§6 L1) · **DONE** (PR #12, shepherd@0e8ae47) — caches rendered bytes per (config, presentation, format); read-through + single-flight render lock + meter-on-miss + graceful degrade (bypasses if Upstash down). Relieves the per-owner render meter → **Stabilization #3 (PERF) resolved.**
9. **editor — B1 (basic)** (§12) · **DONE** (PR #19, shepherd@2b37d09) — meta-driven 3-zone editor, debounced preview, shortest-encoding copy-embed, additive `/api/meta` presets. **Design UX PASS** (public flow e2e, meta-driven proven). Two MED gaps to land **before ship** (builder-1): Stab #13 (preset-switch subject → 500) + Stab #14 (broken-img on load/error). (B2 canvas/advanced tier follows post-funnel.)
10. **Tier-0 `?preset=` URL transport** (§2) · **DONE** (PR #14, shepherd@261f4c1) — `GET /api/render?preset=<name>&user=<id>&theme=…` → `getPreset(name).build({subject})` → Scene → `renderScene` (same L1 path; byte-identical to `?scene=`); validations included. **v1 DoD is now CODE-COMPLETE + QA-PASSED + EMBEDDABLE.**
11. **authed-PAT HTTP e2e verification of the vantage/leak path** · **MECHANISM DONE** (PR #18; deputy live-verified owner-namespaced key + ledger isolation through HTTP) — **NUMBER-GAP half = BLOCKED-ON-FIXTURE (non-blocking, Mo).** Belt-and-suspenders (mechanism proven); NOT a ship gate. Needs a real **setting-OFF subject** whose private number actually diverges from public. Fixture status: Mo's `othermbzuiter` shows **0 contributions on both tokens** (deputy verified) → no gap to measure yet; likely commit author-email not attributed (+ confirm setting OFF + commits pushed) — **routed to Mo** (non-urgent). *(ties to Stab #9/#10/#12-check-4.)*
12. **Phase C — accounts live** (§3/§4/§9/§10/§11) · **DONE** (PR #18, shepherd@811c8a8) — Better Auth UI + PAT vault (plaintext never returned) + `assertCanPublish` gate + entitlements; honest gating. Foundation (#2) made user-facing. *(Assets upload + `/api/report` may be follow-ons if not in this PR — verify when laned.)*
13. **funnel convergence wiring** · **DONE** — **(a)** gated `/api/publish` route ✅ (PR #20, dd20b12); **(b)** editor publish-call ✅ (PR #23, shepherd@c874d05: editor → `/api/publish` → snippet) + **(c)** sign-in-return-to-state ✅ (PR #23). Bundled GAP1/GAP2 fixes (Stab #13/#14) + favicon. **🏠 THE WHOLE HOUSE IS BUILT — full funnel wired: land → tune → sign-in → publish → embed.** *(e2e funnel test in flight, scout.)*
14. **assets upload** (§10) · **DONE (build)** — full UX built: PR #28 schema + PR #29 upload backend + PR #33 logo-element integration + PR #34 inspector asset-picker (upload/pick image for logo element). **Only live exercise is gated on Blob provisioning** (Mo batch, `BLOB_READ_WRITE_TOKEN` — Provisioning (e)).
15. **`/api/report` moderation** (§11) · **DONE — fully wired end-to-end** (PR #30 `74b49ef` + PR #32 `d0f9741`): `POST /api/report` → salted-hash dedup → threshold flag → admin-disable → `/i` 410 + neutral placeholder. Secure (allowlist fail-closed, salted-IP-hash); 69 tests + live-smoked. *(Prod env still owed → Provisioning (f) `REPORT_IP_SALT` / (g) `ADMIN_USER_IDS`.)*
16. **editor — B2 (canvas / advanced tier)** (§12) · **DONE** (PR #31, shepherd@8fca658) — **full v1 editor (B1+B2) COMPLETE**: lossless eject (B1→canvas), 4-zone canvas, undo/redo, publish-from-canvas. *Deferred B2 polish (noted, non-blocking): drag-reorder, marquee select, slot-ghosts, inspector asset-picker (builder-1 follow-up after asset integration).*
17. **recanon tagline** · **DONE** (PR #35, shepherd@9f03de5) — **"THE SITE THEY SEE · THE SOFTWARE BEHIND IT"** in both spots (`presets.ts` syndicate preset tag + `cards/syndicate.tsx` `.tag`).

---

## Stabilization — defects found in recon (fix or recorded; blast-radius ordered)

1. **[SEC] decompression bomb on decode** — gunzip on attacker-controlled input, no size cap → DoS. **DONE** (PR #6, shepherd@37c9469). `/api/render`'s unified `decodeParam` now calls `inflateCapped` (caps to `MAX_DECODED_BYTES` *before* `JSON.parse`) for BOTH `?spec=` + `?scene=`. Lead verified the diff; builder-2 live-verified all four cases. Was highest severity (exploitable, public endpoint).
2. **[CORRECTNESS] compound SVG `id` collisions** — defs ids were per-card-*type*, so duplicate cards in one render made `url(#id)` resolve to the first match → visibly broken. **DONE** (fixed in PR #5, shepherd@0ce688f). Per-element-id `<defs>` namespacing in the scene renderer; proven empirically (two same-type elements → `bg__wash`/`orb__wash` namespaced). *Follow-up edge-cases (SMIL bare-id refs; `__` separator) tracked under decompose lane #5.*
3. **[PERF] no compute caching** — ETag computed post-render → every hit re-renders. **DONE** (PR #12, shepherd@0e8ae47) — L1 render-output cache (item #8): a hit serves stored bytes with no Satori/Skia/sharp work.
4. **[OPS] node-card runtime coupling across 3 files** — `next.config` regex + registry-edge exclude + registry-all include; miss one → 404 or broken edge build. **RECORDED.** Candidate: a guard/test folded into #1's registry work.
5. **[QUALITY] SVG↔Satori render drift** — commits bg-gradient, bar track-opacity, metric letter-spacing. **DONE** (PR #10, bed4951) — shared constants single-sourced (`TRACK_OPACITY`, `LABEL_LETTER_SPACING_EM`, `BG_GRADIENT_OPACITY`) so SVG + Satori read one value, per the design ruling (parity not pixels). *(Cross-path font drift was a separate observation, not part of this fix.)*
6. **[DESIGN-CALL] `orbit.tsx` ignores `?theme=`** + dead `responsiveThemeStyle()`. **DONE** (PR #10, bed4951) — dead `responsiveThemeStyle()` deleted; `orbit` re-landed as a scene element. Per the design ruling, curated neon/prism are "treatment" defaults that theme/overrides compose on top of (spec §1).
7. **[CLEANUP] `commits.tsx` stale `@media` comment** (L34, comment only, behavior correct). **RECORDED.** Trivial.
8. **[FIDELITY] commits sheen not decomposed** — the original commits card's decorative SHEEN sweep is absent from the decomposed `commits-orbit` preset; it's a card-level flourish not yet turned into an element. Fix options: an optional `sheen` element, or a sheen knob on `frame`. **POLISH** (design ruling: ACCEPTABLE for v1, **NOT a DoD fail**). Low blast radius (one decorative flourish on one preset); pick up post-v1.
9. **[DATA-VANTAGE — SECURITY + PRODUCT] commits-orbit headline is private + vantage-dependent** — the "6,011 COMMITS" headline is mostly `restrictedContributionsCount` (private, ~5,467; only ~545 real commits) and is **token-vantage-dependent** (anonymous shared-token render shows ~545, not 6,011). Two threads: **(1) PRODUCT/COPY** — design formulating options (honest "CONTRIBUTIONS" label / public-only headline / BYO-PAT perk framing) → Mo via envoy. **(2) ARCHITECTURE** — this metric is **PRIVATE-VANTAGE: its L2 cache key MUST be owner-namespaced** (else a private total leaks via the public shared cache — invariant §14.5); folded into deputy's auth-wiring **scope-on-`MetricDef`** (#4). **Status:** thread (1) PRODUCT/COPY — **RESOLVED** (Mo ruled **A+C**: honest **"contributions"** label + **BYO-PAT perk** framing — *the public/full gap IS the feature*). Execution lane items: commits-orbit **relabel** ✅ DONE (PR #16, shepherd@afd3fc9 — `'commits'`→`'contributions'`); optional **metric-id rename** (deputy's call, open); **editor-perk UX** (folds into editor B1, #9, open). thread (2) ARCHITECTURE — **DONE** (PR #15, shepherd@6074393): vantage isolation shipped — `deriveCacheKey` owner-namespaces private-vantage scenes in L1+L2, leak-proof (falsifiable test). Found via DoD data-QA, which itself = **PASS**. **MODEL REFINEMENT (Stab #10):** the gap is gated by the **target user's profile setting** (include-private-contribs), not viewer token — so it exists **only for setting-OFF subjects**; the BYO-PAT perk is real only for them, and owner-namespacing is still required for that case.
10. **[SEC — VERIFY] app token (`GITHUB_TOKEN`) vantage** — **RESOLVED: NO LEAK** (scout proved via a `torvalds` foreign-token control = exact match → the app token serves **PUBLIC vantage**, not all-seeing). **KEY MODEL REFINEMENT:** `restrictedContributionsCount` is gated by the **TARGET user's "include private contributions in profile" setting**, NOT the viewer token scope. So the public/private gap exists **only for setting-OFF subjects**; setting-ON users (e.g. Mo) have **anon == authed (no gap)**. **FULLY RESOLVED** — residual confirmed (`GITHUB_TOKEN` *is* Mo's personal PAT) and now tracked as its own item, **Stab #11** below (not open/forgotten).
11. **[OPS/HARDENING] swap `GITHUB_TOKEN` to a dedicated fine-grained PUBLIC-READ-ONLY PAT** — `GITHUB_TOKEN` is currently **Mo's personal PAT**. **RECORDED, pending-Mo** (he creates the token; set on Vercel via REST API per his secrets rule). **Priority LOW-MED, not urgent, NO leak today.** Why: (1) **correct rate-limit bucket** — a personal PAT shares Mo's 5k/hr across all his usage; (2) **minimal-scope hygiene**; (3) **latent edge** — with a personal PAT as the app token, if that token's owner flips their OWN profile "private contributions" to OFF, their *anonymous* card would still render their private number (the token sees its owner's private data); a dedicated public-only token eliminates this.
12. **[SEC-HIGH] CDN edge-cache cross-serve leak** — privileged **session-owner** renders on `/api/render` emit `Cache-Control: public` with **no `Vary: Cookie`** → the **Vercel edge CDN (a layer ABOVE L1)** caches the authed-populated, private-inclusive bytes and serves them to **anonymous** viewers. The L1/L2 owner-namespacing (PR #15) holds *below* the edge, so it doesn't catch this. **Proven LIVE** by scout (`X-Vercel-Cache: HIT` on a cookieless request; memo `scout-structural-cdn-leak.md`). **STATUS: FIX MERGED — PENDING SCOUT PROD DEPLOY-CONFIRM** (PR #21, shepherd@23e0534: authed ⇒ `private, no-store` on a broader scope; anon stays `public`; `/i/<id>` + compound stay public; **+ bundled open-redirect guard**). **CLOSED ✅** — scout prod re-verify (PR #21): **checks 1–3 PASS** (cross-serve eliminated / no perf regression / scoping correct). The funnel is leak-clean. *(value-gap (check 4 = #11) stays belt-and-suspenders, fixture-deferred, non-blocking.)* *(Cleanup tail: 2 scout throwaway prod auth users pending deputy deletion.)*
13. **[EDITOR-MED] preset-switch carries prior subject → 500** — **DONE** (PR #23, shepherd@c874d05): `defaultSubject` is now meta-driven and loaded on preset select.
14. **[EDITOR-MED] failed/loading preview shows a broken `<img>`** (violated spec non-negotiable #6) — **DONE** (PR #23, shepherd@c874d05): probe-img / never-broken-image with graceful loading + error.
15. **[EDITOR-MINOR] editor console 404 cleanup** — **RECORDED → builder-1**. Trivial.
16. **[POLISH] editor `<a>` link-to field** — per-banner canonical link (e.g. github / nitrotype / recanon.com) so the embed wraps the publisher's chosen target. **POLISH backlog.** *(BYO-PAT nudge intentionally deferred to the connect-token wiring — not a gap.)*
17. **[SEC — FORWARD-CHECK] published `/i/<id>` embed must stay publicly cacheable** — **DONE / PASS** (confirmed on a **REAL published id** `/i/64F-HwM8WPA8l8RjsDH_4g`): returns 200 SVG, `public, max-age=300`, `X-Vercel-Cache HIT`, image-only / no config leak, **NOT** swept by the authed-private `no-store` rule (Stab #12). Consented public embeds stay camo-cacheable. ✅
18. **[EDITOR-POLISH] editor draft-schema versioning** — a stale `localStorage` draft from a prior build can desync subject-vs-render. **DONE** (PR #24, shepherd@5935167): draft schema versioned, stale drafts discarded on load.
19. **[BUG B — SEC/CONFIG-HIGH] GitHub OAuth broken on prod** — `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` were **UNSET on Vercel** (only local) → email-verified gate unmeetable → publishing impossible. **CLOSED** — creds set on Vercel (prod+preview) via REST super token per Zcanon `vercel-env.md` (CLIENT_ID encrypted, SECRET sensitive/never echoed), prod redeployed, **VERIFIED** the authorize-URL `client_id` is now populated (was empty). **Real-user publish UNBLOCKED on prod.**
20. **[BUG C — EDITOR-MED] lossy return-to-state** — restore dropped theme + overrides → violated the exact-state non-negotiable. **DONE** (PR #25, shepherd@ecb80b9): WYSIWYG restore (full state).
21. **[BUG A — EDITOR-MED-LOW] theme palette swatches non-functional** — **DONE** (PR #25, shepherd@ecb80b9): theme now **drives the preview + embed URL** per design §3 — **single themed `<a><img>`** (not `<picture>` split, matches Mo's README), fixed palette both modes (6 swatches kept), light/dark toggle = page-bg preview. **Editor complete** (60/60). ⚠️ Basic-tier embed model changed: `<picture>` split → single themed `<img>`.
22. **[OWED — SEC] rotate `VERCEL_SUPER_TOKEN`** — the token value **leaked into the bus log** (bash expansion of the `$`-var in lead msg #223). **PENDING-MO, do not bury:** Mo to mint a new token + **revoke the old** at Vercel + re-persist via `SetEnvironmentVariable`. **Mo deferred (ROTATE LATER), accepted burned.** *(Lesson: never pass `$`-vars / backticks unescaped through a bash bus-send — they expand.)*
23. **[BUG — OAUTH-RELIABILITY-MED] first GitHub OAuth attempt errors before completing happy path** — first-pass callback errored **`unable_to_get_user_info`** (Better Auth). **FIX MERGED** (PR #26, shepherd@f405847): hardened `githubGetUserInfo` — transient-retry + private-email resolve via `/user/emails`; 66/66. **Status: FIX-MERGED — PENDING LIVE RE-TEST** (deferred to deploy per Mo's QA-defer; Mo/scout to retry the first-OAuth on prod).
24. **[COHERENCE-MED] publish `snippet.ts` emits `<picture>` split, contradicting design §3** — **DONE** (PR #27, shepherd@84e139a): publish snippet is now a **single themed `<a><img>`** matching the editor (§3, WYSIWYG end-to-end). *(Design owes a published-snippet re-verify on deploy — see Stab #25.)*
25. **[VERIFY] design deploy re-verify — §8 disclaimer + published-snippet** — two visual confirms owed by **design on deploy**: (a) the spec-§8 "publicly exposes your private total" disclaimer renders at publish (not yet eyeballed live); (b) the now-single-themed published snippet (Stab #24 / PR #27) looks right end-to-end. **DEFERRED** (Mo-directed QA defer).
26. **[MOD-MED] disabled `/i/<id>` embed returns 410 + neutral placeholder** — **DONE** (PR #32, shepherd@d0f9741): disabled embed now serves **410 + a neutral placeholder** (§11) so camo drops the cached bytes. **Moderation is fully wired end-to-end**: report → salted-hash dedup → threshold flag → admin-disable → 410 + placeholder.
27. **[B2-HIGH] canvas column collapses to 0px** — canvas collapsed to ~32×10px (image rendered but CSS-collapsed). **DONE** (PR #36, shepherd@bf88bce). Root cause = **missing `.advanced` layout class** + grid hardening (canvas fills now).
28. **[B2-MINOR] inspector x/y/z spinbuttons unbounded** — **DONE** (PR #36, shepherd@bf88bce): spinbutton bounds set.
29. **[B2-MINOR] arrow-nudge doesn't fire on layer-button focus** — **DONE** (PR #37, shepherd@3d04bfc): global arrow-nudge (canvas or selection focus).
30. **[B2-MINOR] per-keystroke undo on numeric transform inputs** — **DONE** (PR #37, shepherd@3d04bfc): undo coalesced to one per field-edit.
> **B2 mouse drag/resize/rotate/snap — SPOT-CHECKED ✅** (PR #37; + Shift-aspect resize added). All B2 verified.

---

## Provisioning — mostly DONE; Wave-2 auth/cache half now unblocked for end-to-end verification

**DONE (lead-executed, verified against live state):**
- **Neon** created (recanon org, project `dynimage` / `rough-hat-03394295`); migration applied; all **8 tables live** (`account`, `session`, `user`, `verification`, `credential_vault`, `entitlements`, `published_embeds`, `usage_ledger`).
- Secrets set in `.env.local` **and** Vercel (production + development): `DATABASE_URL`, `*_UNPOOLED`, `BETTER_AUTH_SECRET`, `PAT_ENC_KEY`, `VERSION`.
- **Upstash** provisioned by Mo — vars present (prod/preview) as `UPSTASH_DYNIMAGE_KV_*`; **`redis.ts` now reads those names (PR #11, shepherd@2e3b079, merged)**. Live smoke OK (lead). OAuth creds now in `.env.local`.

**REMAINING:**
- (a) **GitHub OAuth app** — ✅ **DONE**: creds set on Vercel (prod+preview) + verified authorize-URL `client_id` populated (Stab #19). Real-user login/publish unblocked.
- (b) **Neon region** us-west-2 vs us-east-1 decision. → routed to Mo via envoy.
- (c) **preview-env vars** — the Vercel add skipped the `preview` environment for the auth vars; needs a follow-up add.
- (d) **`BETTER_AUTH_URL` for preview**.
- (e) **Vercel Blob store + `BLOB_READ_WRITE_TOKEN`** — pending-Mo. Needed for **live** assets upload/serving (#14, §10); Blob was deferred in Wave 1, not yet set up. Assets code+tests land with Blob **stubbed**; route when the assets PR is ready to deploy. **Non-blocking for the core funnel** (Phase-C extra).
- (f) **`REPORT_IP_SALT`** on prod — pending-Mo. Without it, the report-route IP-hash falls back to a dev salt that's precomputable. (Moderation, #15.)
- (g) **`ADMIN_USER_IDS`** on prod — pending-Mo (**= Mo's user id**). Without it, **no one can admin-disable** a reported embed. (Moderation, #15.)

*Lesson (recorded): provisioning lists must be verified against LIVE state, not the spec.* Vercel CLI is installed (v54.4.1), project linked (`recanon/dynimage`), authed. See `deputy-auth-options-memo.md` §provisioning.

## Done
- PR #1 — Recanon rebrand (syndicate card, text-only) · shepherd@41c7635
- PR #2 — tile-count copy fix (Four→Three) · shepherd@b237532
- PR #3 — pnpm 11 build-deps fix (allowBuilds) · shepherd@5d7c729
- PR #5 — scene/element model keystone contract (+ id namespacing, /api/meta subject-kind matrix) · shepherd@0ce688f
- PR #6 — tier-2 config codec (base64url+gzip+v:1) + render-route decompression cap on both transports · shepherd@d6aa993, shepherd@37c9469 *(closes [SEC] Stab #1)*
- PR #8 — wire Tier-2 `?c=` transport into `/api/render` (`decodeConfig` → Scene → `renderScene`, same decompression cap) · shepherd@06ae202
- PR #7 — auth/storage/crypto foundation (Better Auth + AES-256-GCM envelope crypto + 8 tests + Neon schema + atom L2 seam) · shepherd@8972dc8
- PR #9 — tsconfig `allowImportingTsExtensions` (node --test .ts imports) · shepherd@9598938
- PR #11 — redis.ts reads Vercel Upstash-KV integration env var names (`UPSTASH_DYNIMAGE_KV_*`) · shepherd@2e3b079
- PR #10 — decompose flagships into elements (orbit/lattice/tile-grid) + 3 presets; namespaceIds hardened; Stab #5/#6 closed · shepherd@bed4951 *(v1 DoD code-complete)*
- PR #12 — L1 render-output cache (single-flight, meter-on-miss, graceful degrade) · shepherd@0e8ae47 *(closes [PERF] Stab #3)*
- PR #13 — animated-SVG proof + scene URLs for v1 DoD QA (docs) · shepherd@9da9637 *(v1 DoD fully QA-passed)*
- PR #14 — Tier-0 `?preset=` transport (embeddable preset URLs; getPreset→build→Scene→L1) · shepherd@261f4c1 *(v1 DoD now EMBEDDABLE)*
- PR #15 — Wave-2 auth→dispatch wiring (RenderContext + mercy-ladder metering + leak-proof vantage/owner-namespaced cache; edge untouched) · shepherd@6074393 *(closes #4 + Stab #9 architecture thread)*
- PR #16 — commits-orbit honest `'contributions'` labels · shepherd@afd3fc9 *(Stab #9 product relabel)*
- PR #17 — `/i/<id>` publish→embed lifecycle (render-by-id, transactional publish + pre-warm, snippet gen) · shepherd@ee00116 *(closes #7; 60/60)*
- PR #18 — Phase C accounts live (Better Auth UI + PAT vault + `assertCanPublish` gate + entitlements) · shepherd@811c8a8 *(closes #12; authed-e2e mechanism verified)*
- PR #19 — editor B1 (meta-driven 3-zone editor, debounced preview, shortest-encoding copy-embed) · shepherd@2b37d09 *(closes #9; all 3 funnel surfaces built)*
- PR #20 — gated `/api/publish` POST + owner-scoped `/api/publish/[id]` PUT (fail-closed) · shepherd@dd20b12 *(closes #13a)*
- PR #21 — SEC fix: authed renders never publicly edge-cached (CDN cross-serve) + open-redirect guard · shepherd@23e0534 *(closes [SEC-HIGH] Stab #12 — scout prod-verified)*
- PR #22 — gitignore agent-bus runtime state (secrets-in-transit) · shepherd@c34d4f0
- PR #23 — editor publish-call + sign-in-return-to-state + editor gaps #13/#14 + favicon · shepherd@c874d05 *(closes #13 convergence — 🏠 WHOLE HOUSE BUILT, full funnel wired)*
- PR #24 — version editor draft schema + discard stale drafts on load · shepherd@5935167 *(closes Stab #18)*
- PR #25 — editor: theme drives preview+embed URL (BUG A) + WYSIWYG restore (BUG C) · shepherd@ecb80b9 *(closes Stab #20/#21; editor complete, 60/60)*
- PR #27 — publish: single themed embed snippet (design §3 coherence) · shepherd@84e139a *(closes Stab #24; WYSIWYG end-to-end)*
- PR #26 — auth: hardened GitHub getUserInfo (transient-retry + private-email resolve) · shepherd@f405847 *(Stab #23 fix-merged, pending live re-test; 66/66)*
- PR #28 — assets table + `assertCanUpload` gate (schema for §10) · shepherd@be35572 *(unblocks #14 upload lane; Neon live-verified)*
- PR #29 — assets raster-only upload backend (magic-byte sniff, SSRF-safe resolve, session-gated) · shepherd@10ba225 *(#14 backend done; 74/74 + live Neon CRUD)*
- PR #30 — moderation: `/api/report` route + admin-disable (§11) · shepherd@74b49ef *(#15 backend done; allowlist fail-closed + salted-IP-hash; 69 tests + live-smoked)*
- PR #31 — editor B2 canvas (composable advanced tier: layers/canvas/inspector, undo/redo, publish-from-canvas) · shepherd@8fca658 *(closes #16; full v1 editor B1+B2 COMPLETE)*
- PR #32 — moderation: disabled embed serves 410 + neutral placeholder (§11) · shepherd@d0f9741 *(closes Stab #26; moderation wired end-to-end)*
- PR #33 — scene: logo element accepts uploaded assets (central SSRF-safe resolution, elements pure) · shepherd@d2e2fc9 *(#14 element-integration done; 81/81)*
- PR #34 — editor: inspector asset-picker (upload/pick image for logo element) · shepherd@fe080fb *(#14 assets UX fully built; live exercise gated on Blob)*
- PR #35 — recanon tagline "THE SITE THEY SEE · THE SOFTWARE BEHIND IT" (both spots) · shepherd@9f03de5 *(closes #17)*
- PR #36 — editor: B2 canvas fills (apply `.advanced` layout class) + spinbutton bounds · shepherd@bf88bce *(closes Stab #27/#28)*
- PR #37 — editor: B2 canvas polish — Shift-aspect resize, global arrow-nudge, undo coalesce · shepherd@3d04bfc *(closes Stab #29/#30; drag/resize/rotate/snap spot-checked)*

---

*Zcanon essays referenced above live in a separate repo, not in dynimage:*
`zcanon/CONTEXT/essays/{the-whole-house,total-effect,confidence-is-not-evidence,atomic-and-molecular-clarity,correctness-over-convenience,heaven-and-hell}.md`
*(no in-repo link — stated plainly rather than faked.)*
