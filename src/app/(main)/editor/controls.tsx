"use client";

import type { ControlSpec } from "./controls-map";

// Primitive, controlled knob controls — design's knob-type → control table.
// Each takes a value + onChange; all keyboard-operable + labeled.

type Base = {
  spec: ControlSpec;
  value: unknown;
  onChange: (v: unknown) => void;
};

function Field({
  spec,
  children,
}: {
  spec: ControlSpec;
  children: React.ReactNode;
}) {
  return (
    <label className="knob">
      <span className="knob-label" title={spec.help}>
        {spec.label}
      </span>
      {children}
    </label>
  );
}

export function KnobControl({ spec, value, onChange }: Base) {
  switch (spec.kind) {
    case "text":
      return (
        <Field spec={spec}>
          <input
            className="knob-text"
            type="text"
            value={String(value ?? "")}
            maxLength={spec.maxLength}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case "segmented":
      return (
        <Field spec={spec}>
          <div
            className="knob-segmented"
            role="radiogroup"
            aria-label={spec.label}
          >
            {(spec.options ?? []).map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={value === opt}
                className={value === opt ? "seg active" : "seg"}
                onClick={() => onChange(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </Field>
      );

    case "select":
    case "treatment":
      return (
        <Field spec={spec}>
          <select
            className="knob-select"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          >
            {(spec.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
      );

    case "color": {
      const hex =
        typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
          ? value
          : "#888888";
      return (
        <Field spec={spec}>
          <div className="knob-color">
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`${spec.label} swatch`}
            />
            <input
              className="knob-text mono"
              type="text"
              value={typeof value === "string" ? value : ""}
              placeholder="theme default"
              onChange={(e) => onChange(e.target.value || undefined)}
            />
          </div>
        </Field>
      );
    }

    case "slider":
      return (
        <Field spec={spec}>
          <div className="knob-slider">
            <input
              type="range"
              min={spec.min}
              max={spec.max}
              step={spec.step ?? 1}
              value={Number(value ?? spec.min ?? 0)}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            <input
              className="knob-num mono"
              type="number"
              min={spec.min}
              max={spec.max}
              step={spec.step ?? 1}
              value={Number(value ?? spec.min ?? 0)}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          </div>
        </Field>
      );

    case "stepper":
      return (
        <Field spec={spec}>
          <input
            className="knob-num mono"
            type="number"
            step={spec.step ?? 1}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </Field>
      );

    case "toggle":
      return (
        <Field spec={spec}>
          <button
            type="button"
            role="switch"
            aria-checked={!!value}
            className={value ? "knob-toggle on" : "knob-toggle"}
            onClick={() => onChange(!value)}
          >
            <span className="dot" />
          </button>
        </Field>
      );
  }
}

// Theme is canvas-level (not an element knob): a 6-swatch picker.
const THEMES: { name: string; bg: string; accent: string }[] = [
  { name: "dark", bg: "#0a0a0a", accent: "#a855f7" },
  { name: "light", bg: "#fafafa", accent: "#7c3aed" },
  { name: "ocean", bg: "#0c1929", accent: "#38bdf8" },
  { name: "ember", bg: "#1a0f0a", accent: "#fb923c" },
  { name: "forest", bg: "#0a1f15", accent: "#4ade80" },
  { name: "rose", bg: "#1a0a14", accent: "#fb7185" },
];

export function ThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="knob">
      <span className="knob-label">Theme</span>
      <div className="theme-swatches" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.name}
            type="button"
            role="radio"
            aria-checked={value === t.name}
            title={t.name}
            className={value === t.name ? "swatch active" : "swatch"}
            style={{ background: t.bg, borderColor: t.accent }}
            onClick={() => onChange(t.name)}
          >
            <span style={{ background: t.accent }} className="swatch-dot" />
          </button>
        ))}
      </div>
    </div>
  );
}
