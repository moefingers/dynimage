# Scout — DoD data-correctness QA (DOD-QA, data half)

Ground-truth verification of the LIVE flagship renders in `docs/decompose-proof/real/`.
Method: queried each source-of-truth **directly and independently** of the app's render code.
2026-06-17.

## Verdict: PASS on fidelity — rendered values faithfully reflect live upstream.
Two **correctness caveats** on commits-orbit (label + token-vantage) that design/lead should
rule on. Nitrotype is flawless.

---

## (2) typing-orbit @bigmoemoney — ✅ EXACT MATCH (independently confirmed)

| Rendered | Source of truth | Result |
|---|---|---|
| `150 WPM · AVERAGE` | `avgSpeed:150` | ✅ exact |
| `175 BEST WPM` | `highestSpeed:175` | ✅ exact |

Verified two ways that **agree**: the app's upstream proxy (`nitrotype-api.vercel.app/api/racer/bigmoemoney`)
AND a direct browser-UA scrape of `nitrotype.com/racer/bigmoemoney`. Real active account
(displayName "MoeFingers", 1,436 races, league tier 4). Labels accurate — avgSpeed→"average",
highestSpeed→"best". **Nothing to fix.**

---

## (1) commits-orbit @moefingers — ✅ values match (±1 live drift), ⚠️ 2 caveats

Queried GitHub's GraphQL API **directly via `gh`** (independent of app code), same fields the
atom uses:

| Rendered | Live ground truth | Result |
|---|---|---|
| `6,011 COMMITS · LAST YEAR` | 545 commit + 5,467 restricted = **6,012** | ✅ (±1 = rolling-window drift) |
| `7,159 ALL-TIME COMMITS` | sum since 2016 = **7,160** | ✅ (±1 = window drift) |

Values are **not fabricated** — the formula (`totalCommitContributions + restrictedContributionsCount`,
lifetime = same summed per calendar-year since 2016) is rendered faithfully. The ±1 is the
last-365-days window sliding between builder-1's render time and my query — expected, not a bug.

**⚠️ Caveat 1 — "COMMITS" overstates commits.** Of the 6,011 last-year, only **545** are actual
commit contributions; the other **5,467** is `restrictedContributionsCount` — restricted
contributions of *any* type (commits, PRs, issues, reviews in private repos), not commits.
All-time: only ~1,477 of 7,160 are commit contributions; ~5,683 are restricted. The headline
label "COMMITS" is therefore imprecise for this subject.

**⚠️ Caveat 2 — the number is token-vantage-dependent (the important one).**
`restrictedContributionsCount` is only populated for a token that can see the subject's private
contributions. My `gh` token *is* moefingers, so I see 5,467. **The anonymous shared service
token cannot see moefingers' private contributions → it would render ~545 last-year / ~1,477
all-time, NOT 6,011 / 7,159.** So the flagship demo number is not what a stranger embedding this
card via the public path would get. This ties directly to the §7 mercy ladder + my LANE-TOS
finding: the "wow" number depends on a privileged (PAT/OAuth) render path, not the anonymous
front-line. Worth a deliberate product decision — either (a) caption it honestly, (b) source
the headline from public-only fields so the anonymous embed matches, or (c) accept it as a
"this is what BYO-PAT unlocks" showcase.

(Minor, already noted in code: "ALL-TIME" is "since 2016" — harmless for moefingers, who has 0
contributions pre-2023.)

---

## (3) Spot-check of other cards — N/A by construction

Only **3 presets** exist (`presets.ts`): commits-orbit, typing-orbit, and **syndicate**.
Syndicate pulls **no upstream data** — it's static brand content ("Recanon" wordmark + 3 fixed
service tiles + tagline; only the footer interpolates `@subject.id`). The other proof artifacts
(card-bar/metric/text, namespacing-dup-orbit) are element/primitive + id-collision demos, not
real-subject data. **There is no third live-data card to ground-truth** — the two flagship
presets above are the complete set of upstream-fetching cards, both verified.

## Bottom line for the DoD
Data half = **PASS**: every live number rendered matches its source of truth. Flag for
design/lead: the commits-orbit headline both (a) labels restricted contributions as "commits"
and (b) only reaches 6,011 with a privileged token — the anonymous embed shows ~545. Not a
build defect; a fidelity/honesty call.
