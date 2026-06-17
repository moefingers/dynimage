import { z } from "zod";
import type { RenderContext } from "@/lib/data/seam";
import { githubAtoms, nitrotypeAtoms } from "@/lib/data/atoms-seam";
import { fmtInt } from "@/lib/cards/svg-helpers";
import { SubjectSchema } from "./subject";
import type { Scene } from "./scene-spec";
import type { Bind, BoundValue, MetricDef, Subject } from "./types";

// ─────────────────────────────────────────────────────────────────────
// Bind layer — the seam between elements and data.
//
// This file is a THIN adapter over the SEAM atoms (data/atoms-seam.ts —
// token-aware, L2-cached, metered). It NEVER fetches directly; each
// MetricDef.resolve calls a seam atom with the RenderContext (owner +
// per-render L1 + waitUntil) and projects out the one field it needs.
// Adding a metric = one MetricDef entry here; a brand-new atom is deputy's
// lane (flag the lead).
//
// VANTAGE (spec §3): metrics off GitHub's contributionsCollection include
// the owner's PRIVATE contributions on their own token, so they're marked
// vantageSensitive — the seam owner-namespaces their cache so a privileged
// number is never served to a public embedder.
//
// The METRIC CATALOGUE below doubles as the compatibility matrix surfaced
// via /api/meta: every entry declares which subject kinds it accepts, so
// the editor can grey out nonsense (a user-only metric on a repo subject).
// ─────────────────────────────────────────────────────────────────────

function numberValue(n: number): BoundValue {
  return { value: n, display: fmtInt(n) };
}

const USER_ONLY = ["user"] as const;

// The catalogue. Keyed access is via metricKey() so lookups are O(1).
export const METRICS: ReadonlyArray<MetricDef> = [
  // ── GitHub ──────────────────────────────────────────────────────────
  {
    provider: "github",
    metric: "commits-last-year",
    label: "Commits (last year)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    vantageSensitive: true, // includes restrictedContributionsCount on owner's token
    resolve: async (s, ctx) =>
      numberValue(
        (await githubAtoms.userContributions({ login: s.id }, ctx))
          .totalCommitsLastYear,
      ),
  },
  {
    provider: "github",
    metric: "lifetime-commits",
    label: "Commits (all-time)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    vantageSensitive: true,
    resolve: async (s, ctx) =>
      numberValue(
        (await githubAtoms.userLifetime({ login: s.id }, ctx)).lifetimeCommits,
      ),
  },
  {
    provider: "github",
    metric: "current-streak",
    label: "Current streak (days)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    vantageSensitive: true, // calendar includes private contribution days on owner's token
    resolve: async (s, ctx) =>
      numberValue(
        (await githubAtoms.userContributions({ login: s.id }, ctx)).currentStreak,
      ),
  },
  {
    provider: "github",
    metric: "longest-streak",
    label: "Longest streak (days)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    vantageSensitive: true,
    resolve: async (s, ctx) =>
      numberValue(
        (await githubAtoms.userContributions({ login: s.id }, ctx)).longestStreak,
      ),
  },
  {
    provider: "github",
    metric: "total-contributions",
    label: "Total contributions (last year)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    vantageSensitive: true,
    resolve: async (s, ctx) =>
      numberValue(
        (await githubAtoms.userContributions({ login: s.id }, ctx))
          .totalContributions,
      ),
  },
  {
    provider: "github",
    metric: "public-repos",
    label: "Public repositories",
    subjectKinds: USER_ONLY,
    valueType: "number",
    // privacy:PUBLIC query → vantage-stable (same on any token).
    resolve: async (s, ctx) =>
      numberValue(
        (await githubAtoms.userOverview({ login: s.id }, ctx)).publicRepoCount,
      ),
  },
  {
    provider: "github",
    metric: "followers",
    label: "Followers",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, ctx) =>
      numberValue(
        (await githubAtoms.userOverview({ login: s.id }, ctx)).followers,
      ),
  },
  // ── Nitrotype ───────────────────────────────────────────────────────
  {
    provider: "nitrotype",
    metric: "avg-wpm",
    label: "Average WPM",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, ctx) =>
      numberValue((await nitrotypeAtoms.racer({ username: s.id }, ctx)).avgSpeed),
  },
  {
    provider: "nitrotype",
    metric: "highest-wpm",
    label: "Highest WPM",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, ctx) =>
      numberValue(
        (await nitrotypeAtoms.racer({ username: s.id }, ctx)).highestSpeed,
      ),
  },
  {
    provider: "nitrotype",
    metric: "races",
    label: "Races played",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, ctx) =>
      numberValue(
        (await nitrotypeAtoms.racer({ username: s.id }, ctx)).racesPlayed,
      ),
  },
  {
    provider: "nitrotype",
    metric: "level",
    label: "Level",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, ctx) =>
      numberValue((await nitrotypeAtoms.racer({ username: s.id }, ctx)).level),
  },
];

function metricKey(provider: string, metric: string): string {
  return `${provider}:${metric}`;
}

const METRIC_INDEX: ReadonlyMap<string, MetricDef> = new Map(
  METRICS.map((m) => [metricKey(m.provider, m.metric), m]),
);

export function findMetric(provider: string, metric: string): MetricDef | null {
  return METRIC_INDEX.get(metricKey(provider, metric)) ?? null;
}

// ── Bind Zod (wire contract) ─────────────────────────────────────────
// Discriminated on `provider`: a `literal` carries its value inline; any
// other provider is (subject, metric). Concrete provider/metric validity
// is enforced at resolve time against the catalogue (clear runtime error),
// keeping the schema open to new providers without a redeploy of the type.
export const BindSchema: z.ZodType<Bind> = z.union([
  z.object({
    provider: z.literal("literal"),
    value: z.string().max(200),
  }),
  z.object({
    provider: z.string().min(1),
    subject: SubjectSchema,
    metric: z.string().min(1),
  }),
]);

// Resolve a bind to a presentation-ready value. Throws on an unknown
// metric or an incompatible subject kind so the dispatcher can surface a
// clear 4xx; never silently renders a wrong number.
export async function resolveBind(
  bind: Bind,
  ctx: RenderContext,
): Promise<BoundValue> {
  // `value` is unique to the literal arm — narrows the union cleanly
  // (provider is an open string on the data arm, so it can't discriminate).
  if ("value" in bind) {
    return { value: bind.value, display: bind.value };
  }
  const def = findMetric(bind.provider, bind.metric);
  if (!def) {
    throw new Error(`Unknown metric "${bind.provider}:${bind.metric}".`);
  }
  const subject: Subject = bind.subject;
  if (!def.subjectKinds.includes(subject.kind)) {
    throw new Error(
      `Metric "${bind.provider}:${bind.metric}" does not accept subject kind "${subject.kind}" ` +
        `(accepts: ${def.subjectKinds.join(", ")}).`,
    );
  }
  return def.resolve(subject, ctx);
}

// A bind is "privileged" if its metric is private or vantage-sensitive —
// i.e. its rendered value can include the owner's private data on their own
// token. The render route uses this to owner-namespace the L1 render-output
// cache for such scenes (mirroring the L2 invariant one layer up), so a
// privileged render is never served to a public embedder. A `literal` bind
// is never privileged.
export function bindIsPrivileged(bind: Bind): boolean {
  if ("value" in bind) return false;
  const def = findMetric(bind.provider, bind.metric);
  return def != null && (def.scope === "private" || def.vantageSensitive === true);
}

export function sceneHasPrivilegedBind(scene: Scene): boolean {
  return scene.elements.some((el) => el.bind != null && bindIsPrivileged(el.bind));
}

// The compatibility matrix for /api/meta — the catalogue minus the
// (non-serializable) resolver functions.
export function metricMatrix(): ReadonlyArray<{
  provider: string;
  metric: string;
  label: string;
  subjectKinds: ReadonlyArray<string>;
  valueType: string;
  // Surfaced so the editor can label/flag privileged metrics (needs a BYO-PAT
  // + own subject to show the private-inclusive value).
  vantageSensitive: boolean;
  scope: "public" | "private";
}> {
  return METRICS.map((m) => ({
    provider: m.provider,
    metric: m.metric,
    label: m.label,
    subjectKinds: m.subjectKinds,
    valueType: m.valueType,
    vantageSensitive: m.vantageSensitive === true,
    scope: m.scope ?? "public",
  }));
}
