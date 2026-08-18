# End-to-End Funnel UX Spec

> Owner: **design**. The whole user journey, no stranded segment (Mo's the-whole-house directive).
> Spans three build lanes — builder-1 (editor), deputy (accounts/PAT), builder-2 (publish/embed).
> Companion: `editor-b1-ux-spec.md` (the "tune" stage). Architecture: `design-vision-spec.md`.

## 0. Principle
**One continuous flow, no dead ends, and the anonymous path is complete on its own.** Auth is **contextual + progressive** — it appears only when the user reaches a gated action (publish, connect token, save), never as an upfront wall. The basic public card must be obtainable with zero account (front line vs github-readme-stats).

## 1. The journey
```
LAND ──▶ TUNE ──▶ ┬─ (public, done) ──▶ COPY snippet
                  │
                  └─ want owned / private / saved ──▶ SIGN IN ──▶ [CONNECT TOKEN] ──▶ PREVIEW(authed) ──▶ PUBLISH ──▶ COPY embed
```

## 2. Stage detail
| # | Stage | What the user does | Owner | Gate |
|---|---|---|---|---|
| 1 | **Land** | Homepage: value prop + live animated demo + "Try it" CTA → opens editor on a default preset | builder-1 (page) | none |
| 2 | **Tune** | The editor B1: preset → animation → color/text → live preview (see editor spec) | builder-1 | none |
| 3a | **Copy (public)** | Public-data user copies the `<picture>` snippet → paste in README → **done** | builder-1 | **none — path completes** |
| 3b | **Want more** | Wants: private numbers / an owned always-current URL / to save a draft → hits a gated action | — | triggers sign-in |
| 4 | **Sign in** | Email-verified or GitHub OAuth, **contextual** (modal/redirect from the gated action, returns to exact state) | deputy | account |
| 5 | **Connect token** | Optional. Add GitHub PAT/OAuth token, **validate-on-add** (shows what it unlocks) | deputy | account |
| 6 | **Preview (authed)** | Preview now renders **private-inclusive** data (session-authenticated render path) | builder-1 + deputy | token (for private) |
| 7 | **Publish** | Transactional + pre-warm → stable `/i/<id>` URL (camo hit #1 instant) | builder-2 | account |
| 8 | **Copy embed** | Final `<a>`+`<picture>`+cache-bust snippet → README | builder-2 | — |

## 3. Gating map (what costs what)
| Capability | Anonymous | Account | Account + token |
|---|---|---|---|
| Tune any preset, live preview | ✅ | ✅ | ✅ |
| Copy a public-data embed URL | ✅ | ✅ | ✅ |
| Save a draft | ❌ → sign-in | ✅ | ✅ |
| Owned, always-current `/i/<id>` embed | ❌ → sign-in | ✅ | ✅ |
| Private-inclusive numbers (full contributions) | ❌ (shows public) | ❌ (shows public) | ✅ |
| Per-owner metering / mercy-ladder budget | — | ✅ | ✅ (most generous) |

**The gate is always *private data* or *construction/publish* — never basic tuning or the public card.**

## 4. Conversion hooks (the funnel's engine)
- **BYO-PAT perk** (unconditional for private repos/orgs): connect a token to include private data the public/service path can't see. **Caveat for the *contributions* metric specifically:** the public/full gap exists ONLY for GitHub "include-private-contributions = OFF" subjects; setting-ON users (e.g. Mo) already show the full number anonymously (anon == authed). So **don't lead this metric's copy with a promised gap** — use the adaptive framing in editor spec §5, and offer the "just enable the GitHub setting" alternative (simpler, no token). The perk's *durable, unconditional* value is the OTHER private metrics.
- **Publish-for-durable**: *"Copy works now — Publish to get a URL you own that stays current and never breaks."*
- **Save-your-work**: on leave/refresh with an unsaved draft → *"Sign in to keep this."*

## 5. State model (no work ever lost)
```
anonymous draft (in-browser/local) ──sign in──▶ saved draft (account) ──publish──▶ published embed (/i/<id>)
```
- **Anonymous draft** survives in local state; sign-in **migrates it** to a saved draft (return to exact editor state, nothing re-entered).
- **Draft ≠ published** (distinct: a draft has no live id). Editing a published embed updates what `/i/<id>` resolves to (stable URL; freshness behind the id).

## 6. Two render auth paths (made concrete by the funnel)
- **Editor preview = session-authenticated** → can show the owner's private-inclusive data cleanly (we know it's them).
- **Published embed = id-resolved + anonymous** (camo) → renders the owner's bound token server-side; private metric cache is **owner-namespaced** (never leaks to public embedders).
- Same render core, two doors (owner-from-session vs owner-from-id).

## 7. Cross-lane handoffs (where the seams must align)
- **builder-1 ↔ deputy:** the gated actions (publish/connect/save) trigger deputy's contextual sign-in, which must **return to the exact editor state** (draft migration).
- **deputy ↔ builder-2:** `published_embeds` row contract — deputy owns the **write** (publish auth-gate), builder-2 **reads** it for `/i/<id>`. Agree the row shape early.
- **builder-1 ↔ builder-2:** the editor's "Publish" calls builder-2's transactional publish (save + pre-warm) then surfaces builder-2's snippet.
- **The whole-house test:** a new user can go land → tune → sign in → connect token → preview private → publish → paste embed, **with no stranded step and the anonymous public path still complete on its own.**

## 8. Non-negotiables (UX invariants)
1. **No upfront wall** — sign-in only at a gated action, and it returns you to your exact state.
2. **Anonymous path completes** — public card + copy, zero account.
3. **Nothing re-entered after sign-in** — drafts migrate.
4. **No broken embed, ever** — pre-warm before the URL is live; stale-if-error on dead token.
5. **Honest data** — public render shows public numbers; the perk is the path to private, clearly labeled.
