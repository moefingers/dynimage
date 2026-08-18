# dynimage — Product Vision Spec (v1)

> Owner: **design** (UX/vision). Settled with Mo over a multi-altitude design sweep, 2026-06-17.
> Status: **LOCKED** — ready for the lead to carve into lanes. Engineering substrate: see
> `deputy-auth-options-memo.md` (this spec extends it).
> This is the canonical "what we're building and why." Implementation order is the lead's call.

---

## 0. One-line vision

**dynimage is tuneable image generation: tune knobs in a pleasant UI → get a compressed URL → embed a live, theme-aware, animated image in any README.** (nitrotype-api is the loosest conceptual ancestor: params → output.)

### Definition of done (v1)
**The editor can rebuild Mo's actual profile README** (`github.com/moefingers`) — three dynimage banners — purely from **elements + presets**, with no hand-authoring:
1. `commits-orbit` — neon orbit + GitHub octocat at icosa center + last-year & lifetime **contribution** counts (GitHub's contribution graph — private-inclusive only under a connected token; see §7 Flagship-metric)
2. `typing-orbit` — prism orbit + Nitrotype "N" at center + typing-speed stat
3. `syndicate`/`recanon` — counter-rotating lattice + wordmark + 3 service tiles

These become the **three flagship presets.** Every element they need already exists inside today's cards — v1 is largely *decomposing monolithic cards into composable elements* + exposing knobs.

### Competitive posture (non-negotiable)
`github-readme-stats` is the zero-friction incumbent (no account, no token, just a URL). **Accounts/PAT buy *power* (composition, private data, mercy limits) — never table stakes.** The anonymous public path is our front line and must be genuinely good on its own. The **editor is the moat.**

---

## 1. Core architecture — scene of composable elements

The unit is **not** a monolithic card; it's a **scene of composable, individually-tunable, optionally data-bound elements.**

```
Scene   = { canvas: {w, h, theme/bg}, elements: [ …ordered, z-layered… ] }
Element = {
  type,                          # registered element module
  transform: {x, y, w, h, z, rotate},
  anchor?: {to: <elementId>, slot: "center" | …},   # positional RELATIONSHIP, not just absolute
  knobs: { …type-specific (Zod-typed)… },
  bind?: { source }              # static, or bound to a data source
}
```

- **Element = generalization of today's `Card`.** Same self-registering module pattern, same Zod-schema-as-knob-spec, same `/api/meta` introspection — just finer-grained. The registry, `/api/meta`, `/api/render`, encoding tiers all carry over. **Evolution, not rewrite.**
- **`bind` unifies graphics and stats.** An element is static *or* bound (`github:commits`, `github:lifetime-commits`, `nitrotype:wpm`, `literal`, later arbitrary-fetch). "Stats" is just a bound element.
- **Today's rich cards become presets** — named bundles of elements + knobs. Recanon CTA = `{lattice + wordmark + 3 tiles}`. Current cards keep working as presets.
- **Anchoring/slots are required** (the README forces it): the octocat sits *at the orbit's center*. Elements must anchor to / nest in another (e.g. an orbit's `center` slot), not just hold absolute X/Y — so a child stays placed as its parent resizes.
- **Subject is a typed entity ref:** `{kind: user | org | repo, id}`. The `(provider, subject, metric)` model absorbs all three. `repo` is already a declared `CardDimension`.
- **`/api/meta` gains a metric ↔ subject-kind compatibility matrix** so the editor never offers nonsense (e.g. public "stars" on a private repo).
- **Curated palettes are color-treatment *knobs*, not lock-outs.** A card's signature look (orbit's neon, prism's spectrum) becomes a selectable `treatment` knob with that look as the *default* — but `?theme=` and per-color overrides still compose on top. No element silently ignores theme; it just ships a strong default.
- **Cross-format parity = "same card," not "same pixels."** SVG and PNG/Satori/Skia of the same card+theme must look like the *same card* (palette, layout, proportions, key treatments) — modulo animation, which raster can't carry. Pixel-identical across engines is neither achievable nor a goal; perceptible drift in shared values *is* a defect (single-source the constants so both paths read one value).

### Starter element set (from the README, not guesswork)
orbit / sphere / icosahedron · prism color treatment · lattice background · centered logo/icon · data-bound stat counter (count-up) · text/wordmark · tile-grid. **All already exist inside current cards.**
**Backlog:** svg-experiments catalog (folded in element-by-element later).

---

## 2. Encoding — three tiers, one config underneath

| Tier | For | Example |
|---|---|---|
| **0 Preset** | "give me the github banner with my name" | `?preset=commits-orbit&user=moefingers` |
| **1 Readable params** | one element, light tuning (the 80% case) | `/api/<user>/commits.svg?theme=ocean&accent=fb923c` |
| **2 Compressed blob** | full custom / compound (editor output) | `/api/render?c=<base64url(gzip(json))>&z=1` |

- All three decode to the **same internal config**; readable params are a flat projection. The editor emits the **shortest encoding that fits** and auto-promotes to the blob past a length/nesting threshold — user never picks an encoding.
- **base64url** (not base64 — `+/=` are camo-unsafe and churn the cache key). **gzip by size** (skip below ~few hundred bytes). **Versioned** (`v:1`) so embedded URLs never break.

---

## 3. Accounts / identity

- **Better Auth** (canon across recanon/nitrotype). **Email-verified account required to *publish* an embed** — this is the *only* way per-user metering works, since camo fetches embeds anonymously (see §6).
- **GitHub OAuth is the *primary* private-data path** (scoped, revocable, no manual token). **Manual PAT is the power-user fallback.** Pasting a PAT into a third-party site is a big trust ask; OAuth + open repo + explicit scopes + "encrypted, never logged" is the trust story.
- **Gating applies to *construction*** (using the builder to save a config) — **raw parametric public URLs stay anonymous** (the front line). Account gates the value-add, never the basic public card.

---

## 4. PAT / credential vault & crypto

- Generic per-user, **per-provider** vault (GitHub PAT now; others later): `{provider, label, …, created, last_used}`.
- **Envelope encryption, KMS-ready:** store `{wrapped_data_key, iv, ciphertext, key_version}` — AES-256-GCM via Web Crypto. Master key in env now (`PAT_ENC_KEY`); rotation re-wraps data keys only, never re-encrypts every secret. Neon at-rest alone is **not** secret-grade.
- **Decrypt only at use, in-memory, on the render request.** Never returned to client (show label + last-4), never logged/cached. **Audit error paths** (`dispatch.ts`/`client.ts` echo raw upstream errors — scrub so a 401 body can't leak the token).
- **The token's own scope *is* the authorization boundary** — if GitHub lets the token read it, the read is authorized. No org-permission logic to build.
- **Validate on add:** test the token live, show what it unlocks ("can read X, can't read Y").

---

## 5. Render paths — edge except PAT

- **Edge for everything** (today's fast path) **except a render that decrypts a PAT → node** (Neon + Upstash + Web Crypto unconstrained). PAT-backed renders are a minority and cache hard, so the node hop is invisible behind the cache.
- **Two auth entry points into one render core:** the **editor preview** is *session*-authenticated (owner known → clean private previews); the **embed** is *id*-resolved + anonymous. Core accepts owner-from-session AND owner-from-published-id.

---

## 6. Caching — L0/L1/L2

| Layer | Caches | TTL | Protects |
|---|---|---|---|
| **L0 camo** | final image bytes | hours (not ours) | — (outer freshness ceiling) |
| **L1 render cache** | rendered SVG/PNG per (id, theme, config) | — | our compute |
| **L2 data cache** | the GitHub/nitrotype response | **15–60 min, per-metric** | upstream budget |

- **L2 key = `provider:subject:metric:SCOPE`.** `scope=public` → globally shared (the multiplier: 100 embeds of one subject = 1 fetch/TTL). `scope=private` → key **also namespaced by owner** → never crosses owners → effectively bypasses the shared pool. **Privacy boundary is a security-correctness invariant, not an optimization.**
- **Stale-while-revalidate** — serve instantly, refresh in background; nobody waits on upstream.
- **Per-metric TTL** (lifetime commits → hours; active streak → ~15m; default ~30m).
- **Single-flight on revalidation** — one fetch refreshes a hot subject, others serve stale (no thundering herd across regions).
- **The L2 TTL is the *sole* upstream-rate governor.** No avenue (embed, editor preview, manual `?v=` refresh) fetches faster than the floor. Editor preview reads through L2 like everything else.

---

## 7. Rate limiting & usage — the mercy ladder

| Tier | Whose GitHub budget | We meter | Limits |
|---|---|---|---|
| Anonymous (no account) | our service token | upstream calls, shared | tightest — playground/front-line |
| Account, no PAT | our service token | upstream calls, per-owner | moderate |
| **Account + PAT** | **their** 5k/hr | only *our compute* | **most generous** — GitHub calls stop counting against us |

- **Meter on cache MISSES (= actual upstream calls), not render requests.** Popular public subject = ~0 quota regardless of embed popularity. Mercy-ladder math is in *upstream calls*, not render count.
- **camo hides viewers and fetches from camo's IPs** → **per-IP limiting of embeds is useless/harmful** (it throttles camo). Limit embeds **per published-URL/owner + subject + cache**; reserve **per-IP for the interactive playground only** (direct browser hits).
- **Limits and failures degrade to serving cached bytes — NEVER to an error.** Exceeding a per-URL budget = stop *regenerating*, keep *serving* the cached image. This neutralizes DoS-via-your-own-limit (an attacker hammering your URL just keeps getting the cached image). Same rule covers dead PAT, thundering herd, per-URL abuse — **it's the load-bearing invariant.**

**Flagship-metric note (Mo-decided, DoD QA finding):** GitHub's contribution headline (e.g. `commits-orbit`'s 6,011) is the *contributions* count — mostly **private** (`restrictedContributionsCount`; only ~545 of 6,011 are actual commits). It's therefore **private-vantage**: it renders in full only under a connected token; the anonymous/service-token render shows the **public-only** number (~545 LY / ~1,477 all-time). **Decision = honest label + BYO-PAT perk:** label it **"contributions"** (not "commits"); anonymous shows public, connecting a token unlocks the full private-inclusive number — the living example of "private data is the gate" and the account-signup hook. **Mechanically:** GitHub contribution metrics are marked **private-vantage** so their L1+L2 cache keys are **owner-namespaced** (never the shared public key — else the private number leaks to public embedders). Mo's own README keeps 6,011 as a connected-token (PAT-tier) embed, relabeled to "contributions." **Setting-dependency (scout-refined):** `restrictedContributionsCount` is gated by the *target's* GitHub "include private contributions on profile" setting, NOT the viewer's token scope — so the public/full gap (and thus the perk) is real **only for setting-OFF subjects**; setting-ON users (Mo) show the full number even anonymously (anon == authed, verified no-leak). Owner-namespaced caching is **still required** (for setting-OFF subjects). The contributions perk copy is therefore **adaptive** and also points to the GitHub profile setting as the simpler lever (no token); the token perk's unconditional value is OTHER private metrics (private repos/orgs).

---

## 8. Publish → embed lifecycle

- **Permanent embed = stable, id-based URL with NO version param** (`/i/<id>.svg`). Freshness comes from the cache/TTL behind the id — the only thing consistent with "one URL, stays current." Editing config updates what `/i/<id>` resolves to server-side; camo catches up within its window.
- **`?v=` reserved for the publisher's explicit transient "refresh now"** (respects the TTL floor) — never the permanent embed.
- **Publish is transactional + pre-warms:** id resolves only after config saved AND an eager render warms L1+L2 — so camo hit #1 is instant (no cold-start timeout → no broken day-one image). Editor reveals the snippet only on publish success.
- **`<picture>` theme-split ⇒ one id renders ≥2 variants (light/dark).** Pre-warm + cache + usage are per **(id, theme)**, not per id.
- **L1 and L2 invalidate independently:** editing config busts L1 for that id only; L2 (subject data) is untouched → fast re-render.
- **Editor emits the full snippet** (`<a>` wrapper + `<picture>` theme-split + cache-bust), not a bare URL.
- **Dead/expired PAT ⇒ stale-if-error:** keep serving the last cached value, never 502; notify owner (optional max-staleness so a frozen private number doesn't silently mislead).
- **Publishing private data is intentional ⇒ disclaim at publish** ("this publicly exposes your private total"); deletion isn't instant (camo lag) — don't promise it.
- **Unguessable published ids** (random, not sequential); `/i/<id>` returns only the image, never the config JSON.

---

## 9. Tiers / entitlements

- Accounts carry an **`entitlements`** record (rate budgets, max published images, max assets, private-data allowed, badge on/off). **Limits read from entitlements, never hardcoded** — dialing back later = changing values, not a migration.
- **Default everyone to full access now.** The ratchet exists in the schema from day one; left wide open until we choose to monetize.
- **Cost centers to keep in view:** Vercel functions, Upstash commands, Neon storage, Skia/Satori CPU, and the **shared service token's 5k/hr as a global ceiling**. The free tier nudges BYO-PAT.
- **GitHub ToS (scout-verified ✓):** the anonymous front-line is **compliant as-designed** — one token under 5k/hr + our cache + mercy-ladder is the legitimate incumbent model, strictly better than github-readme-stats (which leans on a PAT pool and is openly unreliable). **Do NOT pool service tokens to exceed 5k/hr** — that's the ToS gray-to-red move. **If we ever hit the ceiling, the correct headroom path is a GitHub App** (installation tokens — attribution-correct, higher limit), **not** PAT/token rotation.

---

## 10. Assets — upload only

- **Logo/image element = built-in curated icon set OR uploaded asset.** Built-ins (octocat, Nitrotype N — already in `brand-icons.ts`) are a separate safe source; **no arbitrary external-URL fetch** (kills SSRF + illegal-hotlinking).
- **`asset`** entity (id, owner, mime, size) in **Vercel Blob** (Blob's home — separate from render caching). Upload requires an account.
- **Validate mime + size cap. Sanitize SVG uploads** (strip `<script>`/`<foreignObject>`/handlers) or restrict v1 to raster (png/webp/jpg) — an uploaded SVG inlined into output is an XSS vector.

---

## 11. Abuse / moderation

- **Public, rate-limited `POST /api/report`** (per-IP fine here — direct call), body = published id + reason. Reports → Neon; threshold flags for review; admin can **disable** an id → serves a neutral placeholder / 410.
- Camo-lag caveat: a disabled id may stay camo-cached hours; 410 lets camo eventually drop it. Reactive v1; proactive deferred.

---

## 12. Editor complexity ladder

| Tier | Who | Touches | Produces |
|---|---|---|---|
| **Basic** | most | pick preset → pick animation → tweak color+text → copy | short readable URL |
| **Intermediate** | tinkerers | retune element knobs within the preset | params, or blob if it overflows |
| **Advanced** | power users | full canvas: add/remove elements, free X/Y/size/z, anchoring, data-bind | the blob |

- "Premade animation" = a selectable **animation-preset library** (`glow`/`orbit-slow`/`sheen`/`pulse`/`none`); hand-tunable speed/easing at advanced.
- **Preview reads cached/sample data, debounced** — never per-keystroke upstream fetches.

---

## 13. Phasing (each ships standalone; lead sequences lanes)

- **A — Core:** scene/element model + anchoring + tiered encoding + decompose the README's elements + render. *In parallel:* auth/storage/crypto foundation (deputy's lane). Prove via presets/hand-specs.
- **B1 — Basic editor:** preset → animation → color/text → copy. The editor MVP.
- **B2 — Canvas:** full composable canvas (advanced tier) — same model, exposes the hidden X/Y/size/anchor knobs.
- **C — Accounts live:** Better Auth + OAuth + encrypted PAT + entitlements + per-owner metering + publish/pre-warm + assets + report route.
- **D — Grow:** more elements (svg-experiments), more sources (Phase-4 fetch), more presets, monetization ratchet.

---

## 14. Invariants that held across two full altitude sweeps

1. **Failures and limits degrade to cached bytes, never to an error.** (DoS-via-own-limit, dead PAT, thundering herd, per-URL abuse all resolve here.)
2. **Private data is the gate, not config complexity.** A simple private-commit preset needs an account; a fully-custom *public* banner needs none.
3. **The token's scope is the authorization boundary.**
4. **The L2 TTL is the sole upstream-rate governor; every consumer reads through it.**
5. **The subject-keyed shared cache is public-data-only; private is owner-namespaced.**
6. **The permanent embed URL is a stable id; freshness lives behind it, not in the URL.**
7. **camo hides viewers** → meter generations (misses), limit per-URL/owner, IP only for the playground.
