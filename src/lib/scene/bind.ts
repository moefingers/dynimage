import { z } from "zod";
import type { DedupeCache } from "@/lib/data/cache";
import {
  userOverview,
  userContributions,
  userLifetime,
} from "@/lib/data/atoms";
import { nitrotypeRacer } from "@/lib/data/nitrotype";
import { fmtInt } from "@/lib/cards/svg-helpers";
import { SubjectSchema } from "./subject";
import type { Bind, BoundValue, MetricDef, Subject } from "./types";

// ─────────────────────────────────────────────────────────────────────
// Bind layer — the seam between elements and data.
//
// This file is a THIN adapter over the EXISTING data atoms
// (data/atoms.ts, data/nitrotype.ts — deputy's atom-seam). It NEVER
// fetches directly; each MetricDef.resolve calls an atom and projects out
// the one field it needs. Adding a metric = one MetricDef entry here; if a
// metric needs a brand-new atom, that's deputy's lane (flag the lead).
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
    resolve: async (s, cache) =>
      numberValue(
        (await userContributions({ login: s.id }, cache)).totalCommitsLastYear,
      ),
  },
  {
    provider: "github",
    metric: "lifetime-commits",
    label: "Commits (all-time)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue((await userLifetime({ login: s.id }, cache)).lifetimeCommits),
  },
  {
    provider: "github",
    metric: "current-streak",
    label: "Current streak (days)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue(
        (await userContributions({ login: s.id }, cache)).currentStreak,
      ),
  },
  {
    provider: "github",
    metric: "longest-streak",
    label: "Longest streak (days)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue(
        (await userContributions({ login: s.id }, cache)).longestStreak,
      ),
  },
  {
    provider: "github",
    metric: "total-contributions",
    label: "Total contributions (last year)",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue(
        (await userContributions({ login: s.id }, cache)).totalContributions,
      ),
  },
  {
    provider: "github",
    metric: "public-repos",
    label: "Public repositories",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue((await userOverview({ login: s.id }, cache)).publicRepoCount),
  },
  {
    provider: "github",
    metric: "followers",
    label: "Followers",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue((await userOverview({ login: s.id }, cache)).followers),
  },
  // ── Nitrotype ───────────────────────────────────────────────────────
  {
    provider: "nitrotype",
    metric: "avg-wpm",
    label: "Average WPM",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue((await nitrotypeRacer({ username: s.id }, cache)).avgSpeed),
  },
  {
    provider: "nitrotype",
    metric: "highest-wpm",
    label: "Highest WPM",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue(
        (await nitrotypeRacer({ username: s.id }, cache)).highestSpeed,
      ),
  },
  {
    provider: "nitrotype",
    metric: "races",
    label: "Races played",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue(
        (await nitrotypeRacer({ username: s.id }, cache)).racesPlayed,
      ),
  },
  {
    provider: "nitrotype",
    metric: "level",
    label: "Level",
    subjectKinds: USER_ONLY,
    valueType: "number",
    resolve: async (s, cache) =>
      numberValue((await nitrotypeRacer({ username: s.id }, cache)).level),
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
  cache: DedupeCache,
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
  return def.resolve(subject, cache);
}

// The compatibility matrix for /api/meta — the catalogue minus the
// (non-serializable) resolver functions.
export function metricMatrix(): ReadonlyArray<{
  provider: string;
  metric: string;
  label: string;
  subjectKinds: ReadonlyArray<string>;
  valueType: string;
}> {
  return METRICS.map((m) => ({
    provider: m.provider,
    metric: m.metric,
    label: m.label,
    subjectKinds: m.subjectKinds,
    valueType: m.valueType,
  }));
}
