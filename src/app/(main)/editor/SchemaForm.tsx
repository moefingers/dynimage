"use client";

import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { ElementMetaEntry, JsonSchema } from "./meta-types";
import { controlFor, GROUP_ORDER, type ControlSpec } from "./controls-map";
import { KnobControl } from "./controls";

// The meta-driven knob panel. For every element in the Scene it looks up the
// element's knobsSchema from /api/meta and renders one control per knob via
// controlFor — NO hardcoded card/element names. Controls are grouped per
// design's spec (Text · Color · Animation · Style); Subject + Theme are
// owned by the Editor shell (canvas-level / data binding).

type Row = {
  elementId: string;
  elementType: string;
  spec: ControlSpec;
  schemaKey: string;
};

function knobProps(schema: JsonSchema): Record<string, JsonSchema> {
  return schema.properties ?? {};
}

export function SchemaForm({
  scene,
  catalog,
  onKnobChange,
}: {
  scene: Scene;
  catalog: Map<string, ElementMetaEntry>;
  onKnobChange: (elementId: string, key: string, value: unknown) => void;
}) {
  // Build the control rows from the scene's elements + their schemas.
  const rows: Row[] = [];
  for (const el of scene.elements as ElementSpec[]) {
    const entry = catalog.get(el.type);
    if (!entry) continue;
    for (const [key, propSchema] of Object.entries(
      knobProps(entry.knobsSchema),
    )) {
      const spec = controlFor(key, propSchema);
      if (!spec) continue;
      rows.push({
        elementId: el.id,
        elementType: el.type,
        spec,
        schemaKey: key,
      });
    }
  }

  // Qualify labels when the same knob appears on >1 element (e.g. two stats
  // each have a "label"/"color"), so controls stay unambiguous.
  const keyCounts = new Map<string, number>();
  for (const r of rows)
    keyCounts.set(r.spec.key, (keyCounts.get(r.spec.key) ?? 0) + 1);

  const groups = GROUP_ORDER.map((group) => ({
    group,
    rows: rows.filter((r) => r.spec.group === group),
  })).filter((g) => g.rows.length > 0);

  if (groups.length === 0) {
    return <p className="muted">This preset has no basic-tier knobs.</p>;
  }

  return (
    <div className="schema-form">
      {groups.map(({ group, rows }) => (
        <fieldset key={group} className="knob-group">
          <legend>{group}</legend>
          {rows.map((r) => {
            const el = (scene.elements as ElementSpec[]).find(
              (e) => e.id === r.elementId,
            )!;
            const value = (el.knobs ?? {})[r.spec.key];
            const qualified =
              (keyCounts.get(r.spec.key) ?? 0) > 1
                ? { ...r.spec, label: `${r.elementId} · ${r.spec.label}` }
                : r.spec;
            return (
              <KnobControl
                key={`${r.elementId}.${r.schemaKey}`}
                spec={qualified}
                value={value}
                onChange={(v) => onKnobChange(r.elementId, r.spec.key, v)}
              />
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}
