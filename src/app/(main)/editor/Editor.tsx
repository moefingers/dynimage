"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { ElementMetaEntry, Meta, PresetEntry } from "./meta-types";
import { buildPresetScene } from "./actions";
import { SchemaForm } from "./SchemaForm";
import { ThemePicker } from "./controls";
import { previewUrl, embedSnippet, type ConfigState } from "./encoding";

type Overrides = Record<string, Record<string, unknown>>;

// Apply user knob overrides + the chosen theme on top of the server-built
// base scene → the effective Scene we preview + encode.
function applyOverrides(
  base: Scene,
  overrides: Overrides,
  theme: string,
): Scene {
  const scene: Scene = structuredClone(base);
  scene.canvas.theme = theme;
  for (const el of scene.elements as ElementSpec[]) {
    const ov = overrides[el.id];
    if (ov) el.knobs = { ...(el.knobs ?? {}), ...ov };
  }
  return scene;
}

export function Editor() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [presetName, setPresetName] = useState<string>("");
  const [subject, setSubject] = useState<string>("moefingers");
  const [theme, setTheme] = useState<string>("dark");
  const [baseScene, setBaseScene] = useState<Scene | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [variant, setVariant] = useState<"dark" | "light">("dark");
  const [src, setSrc] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const [snippet, setSnippet] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const catalog = useMemo(() => {
    const m = new Map<string, ElementMetaEntry>();
    meta?.elements.forEach((e) => m.set(e.type, e));
    return m;
  }, [meta]);

  const effectiveScene = useMemo(
    () => (baseScene ? applyOverrides(baseScene, overrides, theme) : null),
    [baseScene, overrides, theme],
  );

  const tweaked = Object.keys(overrides).length > 0;
  const configState = useMemo<ConfigState | null>(
    () =>
      effectiveScene
        ? { presetName, subject, scene: effectiveScene, tweaked }
        : null,
    [effectiveScene, presetName, subject, tweaked],
  );

  // Load the catalog once.
  useEffect(() => {
    let live = true;
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => {
        if (!live) return;
        setMeta(m);
        if (m.presets[0] && !presetName) setPresetName(m.presets[0].name);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)build the base scene whenever preset or subject settles. Overrides
  // are preserved (re-applied via effectiveScene), so a subject change keeps
  // the user's knob tweaks.
  const rebuild = useCallback(async (name: string, subj: string) => {
    if (!name) return;
    const scene = await buildPresetScene(name, subj);
    if (scene) setBaseScene(scene);
  }, []);

  // (Re)build the base scene on preset/subject change — debounced so a
  // subject typed character-by-character never per-keystroke-rebuilds, and
  // the setState lands inside the timer (not synchronously in the effect).
  useEffect(() => {
    if (!presetName) return;
    const t = setTimeout(() => {
      void rebuild(presetName, subject);
    }, 250);
    return () => clearTimeout(t);
  }, [presetName, subject, rebuild]);

  // Debounced live preview (~250ms) — re-render via the shortest encoding.
  // All setState happens inside the timer callback (deferred), not in the
  // effect body, so it can't cascade-render.
  useEffect(() => {
    if (!configState) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const u = await previewUrl(configState, variant, "svg");
        setSrc(u);
      } finally {
        setPreviewing(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [configState, variant]);

  const onKnobChange = useCallback(
    (elementId: string, key: string, value: unknown) => {
      setOverrides((prev) => ({
        ...prev,
        [elementId]: { ...(prev[elementId] ?? {}), [key]: value },
      }));
    },
    [],
  );

  const onCopy = useCallback(async () => {
    if (!configState) return;
    const origin = window.location.origin;
    const { snippet, tier } = await embedSnippet(configState, origin, origin);
    setSnippet(snippet);
    setTier(tier);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — snippet still shown below for manual copy */
    }
  }, [configState]);

  const presets: PresetEntry[] = meta?.presets ?? [];
  const activePreset = presets.find((p) => p.name === presetName);

  return (
    <div className="editor">
      {/* ── Preset rail ─────────────────────────────────────────── */}
      <aside className="rail">
        <h2 className="rail-head">Start from a preset</h2>
        <div className="rail-list">
          {presets.map((p) => (
            <button
              key={p.name}
              type="button"
              className={p.name === presetName ? "preset active" : "preset"}
              onClick={() => {
                setOverrides({});
                setPresetName(p.name);
              }}
            >
              <span className="preset-title">{p.title}</span>
              <span className="preset-desc">{p.description}</span>
            </button>
          ))}
          {presets.length === 0 && <p className="muted">Loading presets…</p>}
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────── */}
      <section className="stage">
        <div className="preview-zone">
          <div className="preview-bar">
            <div
              className="seg-toggle"
              role="radiogroup"
              aria-label="Preview mode"
            >
              <button
                type="button"
                role="radio"
                aria-checked={variant === "light"}
                className={variant === "light" ? "seg active" : "seg"}
                onClick={() => setVariant("light")}
              >
                ☀ Light
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={variant === "dark"}
                className={variant === "dark" ? "seg active" : "seg"}
                onClick={() => setVariant("dark")}
              >
                ☾ Dark
              </button>
            </div>
            {previewing && <span className="muted small">rendering…</span>}
          </div>
          <div
            className={variant === "light" ? "preview light" : "preview dark"}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={`${presetName} preview`} />
            ) : (
              <div className="skeleton" />
            )}
          </div>
          <p className="muted small note">
            Preview uses cached/sample data; the live embed pulls current data.
          </p>
        </div>

        {/* ── Control panel ─────────────────────────────────────── */}
        <div className="panel">
          <div className="knob-group">
            <span className="legend">Subject</span>
            <label className="knob">
              <span className="knob-label">
                {activePreset?.subjectKinds?.includes("user")
                  ? "Your GitHub / Nitrotype handle"
                  : "Subject"}
              </span>
              <input
                className="knob-text"
                type="text"
                value={subject}
                placeholder="your-handle"
                onChange={(e) => setSubject(e.target.value.trim())}
              />
            </label>
            <ThemePicker value={theme} onChange={setTheme} />
          </div>

          {effectiveScene && (
            <SchemaForm
              scene={effectiveScene}
              catalog={catalog}
              onKnobChange={onKnobChange}
            />
          )}
        </div>

        {/* ── Output bar ────────────────────────────────────────── */}
        <div className="output">
          <button type="button" className="btn primary" onClick={onCopy}>
            {copied ? "Copied! Paste into your README." : "Copy embed"}
          </button>
          <button
            type="button"
            className="btn"
            disabled
            title="Sign in to publish"
          >
            Publish →
          </button>
          {tier && <span className="muted small">encoding: {tier}</span>}
        </div>
        {snippet && (
          <pre className="snippet">
            <code>{snippet}</code>
          </pre>
        )}
      </section>
    </div>
  );
}
