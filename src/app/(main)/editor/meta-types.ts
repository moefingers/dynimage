// Shape of the /api/meta response the editor consumes. Mirrors the
// serialization in src/app/api/meta/route.ts (kept in sync by hand — it's a
// small, stable contract). The editor is META-DRIVEN: every control it
// renders comes from these schemas, never from a hardcoded card list.

export type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  [k: string]: unknown;
};

export type BindAffinity = { accepts: "none" | "value"; valueType?: string };

export type ElementMetaEntry = {
  type: string;
  runtime: "edge" | "nodejs";
  defaultSize: { width: number; height: number };
  bind: BindAffinity;
  slots: string[];
  knobsSchema: JsonSchema;
  meta: { title: string; description: string; supportsAnimation: boolean };
};

export type CardMetaEntry = {
  name: string;
  runtime: "edge" | "nodejs";
  defaultSize: { width: number; height: number };
  formats: string[];
  inputSchema: JsonSchema;
  meta: {
    title: string;
    description: string;
    dimensions: string[];
    supportsAnimation: boolean;
  };
};

export type MetricEntry = {
  provider: string;
  metric: string;
  label: string;
  subjectKinds: string[];
  valueType: string;
  vantageSensitive: boolean;
  scope: string;
};

export type PresetEntry = {
  name: string;
  title: string;
  description: string;
  subjectKinds: string[];
};

export type Meta = {
  v: number;
  cards: CardMetaEntry[];
  elements: ElementMetaEntry[];
  metrics: MetricEntry[];
  presets: PresetEntry[];
};
