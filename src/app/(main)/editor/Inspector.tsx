"use client";

import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { SlotName } from "@/lib/scene/types";
import type { ElementMetaEntry, MetricEntry, JsonSchema } from "./meta-types";
import { controlFor, GROUP_ORDER } from "./controls-map";
import { KnobControl } from "./controls";
import { patchTransform, setAnchor, setBind, setKnob } from "./canvas-helpers";

// The B2 inspector: the selected element's Transform · Anchor · Knobs · Bind
// (editor-b2-ux-spec §5). All controls have a keyboard path (numeric fields)
// per §12. Empty-state shows canvas-level info.

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        className="knob-num mono"
        value={value ?? 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Inspector({
  scene,
  selectedId,
  catalog,
  metrics,
  onScene,
}: {
  scene: Scene;
  selectedId: string | null;
  catalog: Map<string, ElementMetaEntry>;
  metrics: MetricEntry[];
  onScene: (s: Scene) => void;
}) {
  const el = (scene.elements as ElementSpec[]).find((e) => e.id === selectedId);
  if (!el) {
    return (
      <aside className="inspector">
        <p className="muted small">
          Select an element to edit it, or add one from the Layers panel.
        </p>
        <p className="muted small">
          Canvas: {scene.canvas.w}×{scene.canvas.h} · {scene.elements.length}{" "}
          element{scene.elements.length === 1 ? "" : "s"}.
        </p>
      </aside>
    );
  }

  const entry = catalog.get(el.type);
  const t = el.transform ?? {};
  const anchored = !!el.anchor;
  const otherEls = (scene.elements as ElementSpec[]).filter(
    (e) => e.id !== el.id,
  );
  const parentEntry = el.anchor
    ? catalog.get(otherEls.find((e) => e.id === el.anchor!.to)?.type ?? "")
    : undefined;

  const knobProps: Record<string, JsonSchema> =
    entry?.knobsSchema.properties ?? {};
  const knobRows = Object.entries(knobProps)
    .map(([key, s]) => ({ key, spec: controlFor(key, s, true) }))
    .filter((r) => r.spec);

  return (
    <aside className="inspector">
      <div className="insp-head">
        <strong>{entry?.meta.title ?? el.type}</strong>
        <code className="muted small">{el.id}</code>
      </div>

      {/* Transform */}
      <fieldset className="insp-group">
        <legend>Transform</legend>
        {anchored ? (
          <div className="num-row">
            <NumField
              label="off x"
              value={el.anchor!.dx ?? 0}
              onChange={(n) =>
                onScene(setAnchor(scene, el.id, { ...el.anchor!, dx: n }))
              }
            />
            <NumField
              label="off y"
              value={el.anchor!.dy ?? 0}
              onChange={(n) =>
                onScene(setAnchor(scene, el.id, { ...el.anchor!, dy: n }))
              }
            />
          </div>
        ) : (
          <div className="num-row">
            <NumField
              label="x"
              value={t.x}
              onChange={(n) => onScene(patchTransform(scene, el.id, { x: n }))}
            />
            <NumField
              label="y"
              value={t.y}
              onChange={(n) => onScene(patchTransform(scene, el.id, { y: n }))}
            />
          </div>
        )}
        <div className="num-row">
          <NumField
            label="w"
            value={t.w}
            min={1}
            max={4096}
            onChange={(n) => onScene(patchTransform(scene, el.id, { w: n }))}
          />
          <NumField
            label="h"
            value={t.h}
            min={1}
            max={4096}
            onChange={(n) => onScene(patchTransform(scene, el.id, { h: n }))}
          />
        </div>
        <div className="num-row">
          <NumField
            label="z"
            value={t.z}
            onChange={(n) => onScene(patchTransform(scene, el.id, { z: n }))}
          />
          <NumField
            label="rotate"
            value={t.rotate}
            min={-360}
            max={360}
            onChange={(n) =>
              onScene(patchTransform(scene, el.id, { rotate: n }))
            }
          />
        </div>
      </fieldset>

      {/* Anchor */}
      <fieldset className="insp-group">
        <legend>Anchor</legend>
        <label className="knob">
          <span className="knob-label">Anchor to</span>
          <select
            className="knob-select"
            value={el.anchor?.to ?? ""}
            onChange={(e) => {
              const to = e.target.value;
              if (!to) return onScene(setAnchor(scene, el.id, null));
              onScene(
                setAnchor(scene, el.id, {
                  to,
                  slot: el.anchor?.slot ?? "center",
                }),
              );
            }}
          >
            <option value="">Free position</option>
            {otherEls.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id}
              </option>
            ))}
          </select>
        </label>
        {anchored && (
          <label className="knob">
            <span className="knob-label">Slot</span>
            <select
              className="knob-select"
              value={el.anchor!.slot}
              onChange={(e) =>
                onScene(
                  setAnchor(scene, el.id, {
                    ...el.anchor!,
                    slot: e.target.value as SlotName,
                  }),
                )
              }
            >
              {(parentEntry?.slots ?? ["center"]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      {/* Bind (data-capable elements only) */}
      {entry?.bind.accepts === "value" && (
        <BindEditor scene={scene} el={el} metrics={metrics} onScene={onScene} />
      )}

      {/* Knobs (meta-driven, full/advanced) */}
      {knobRows.length > 0 && (
        <fieldset className="insp-group">
          <legend>Knobs</legend>
          {GROUP_ORDER.flatMap((g) =>
            knobRows.filter((r) => r.spec!.group === g),
          ).map((r) => (
            <KnobControl
              key={r.key}
              spec={r.spec!}
              value={(el.knobs ?? {})[r.key]}
              onChange={(v) => onScene(setKnob(scene, el.id, r.key, v))}
            />
          ))}
        </fieldset>
      )}
    </aside>
  );
}

function BindEditor({
  scene,
  el,
  metrics,
  onScene,
}: {
  scene: Scene;
  el: ElementSpec;
  metrics: MetricEntry[];
  onScene: (s: Scene) => void;
}) {
  const bind = el.bind;
  const provider = bind && "provider" in bind ? bind.provider : "";
  const isLiteral = provider === "literal";
  const subjectId = bind && "subject" in bind ? bind.subject.id : "";
  const subjectKind = bind && "subject" in bind ? bind.subject.kind : "user";
  const metric = bind && "metric" in bind ? bind.metric : "";
  const literalValue = bind && "value" in bind ? bind.value : "";

  const metricOpts = metrics.filter(
    (m) => m.provider === provider && m.subjectKinds.includes(subjectKind),
  );

  return (
    <fieldset className="insp-group">
      <legend>Data bind</legend>
      <label className="knob">
        <span className="knob-label">Source</span>
        <select
          className="knob-select"
          value={provider}
          onChange={(e) => {
            const p = e.target.value;
            if (!p) return onScene(setBind(scene, el.id, null));
            if (p === "literal")
              return onScene(
                setBind(scene, el.id, { provider: "literal", value: "" }),
              );
            return onScene(
              setBind(scene, el.id, {
                provider: p,
                subject: { kind: "user", id: subjectId || "" },
                metric: "",
              }),
            );
          }}
        >
          <option value="">None</option>
          <option value="literal">Literal value</option>
          {[...new Set(metrics.map((m) => m.provider))].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      {isLiteral && (
        <label className="knob">
          <span className="knob-label">Value</span>
          <input
            className="knob-text"
            type="text"
            value={String(literalValue)}
            onChange={(e) =>
              onScene(
                setBind(scene, el.id, {
                  provider: "literal",
                  value: e.target.value,
                }),
              )
            }
          />
        </label>
      )}

      {provider && !isLiteral && (
        <>
          <label className="knob">
            <span className="knob-label">Subject ({subjectKind})</span>
            <input
              className="knob-text"
              type="text"
              value={subjectId}
              placeholder="handle / id"
              onChange={(e) =>
                onScene(
                  setBind(scene, el.id, {
                    provider,
                    subject: { kind: subjectKind, id: e.target.value.trim() },
                    metric,
                  }),
                )
              }
            />
          </label>
          <label className="knob">
            <span className="knob-label">Metric</span>
            <select
              className="knob-select"
              value={metric}
              onChange={(e) =>
                onScene(
                  setBind(scene, el.id, {
                    provider,
                    subject: { kind: subjectKind, id: subjectId },
                    metric: e.target.value,
                  }),
                )
              }
            >
              <option value="">Pick a metric…</option>
              {metricOpts.map((m) => (
                <option key={m.metric} value={m.metric}>
                  {m.label}
                  {m.vantageSensitive ? " (private-capable)" : ""}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </fieldset>
  );
}
