"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { ElementMetaEntry, Meta, PresetEntry } from "./meta-types";
import { useSession } from "@/lib/auth/client";
import { buildPresetScene } from "./actions";
import { SchemaForm } from "./SchemaForm";
import { ThemePicker } from "./controls";
import { previewUrl, embedSnippet, type ConfigState } from "./encoding";
import { publishScene, type PublishResult } from "./publish";
import {
  initialDraft,
  saveDraft,
  encodeEditorState,
  editorReturnUrl,
  type EditorDraft,
} from "./editor-state";

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
  // Preview uses a probe image: `pendingSrc` is the URL we're trying;
  // `shownSrc` is the last URL that successfully loaded (kept on error so we
  // never flash a broken <img> — spec non-negotiable #6).
  const [pendingSrc, setPendingSrc] = useState<string>("");
  const [shownSrc, setShownSrc] = useState<string>("");
  const [previewError, setPreviewError] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [snippet, setSnippet] = useState<string>("");
  const [tier, setTier] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Publish flow (funnel #13b). Session drives the gated branch.
  const { data: session, isPending: sessionPending } = useSession();
  const authed = !!session?.user;
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);
  const [publishErr, setPublishErr] = useState<string>("");
  const [pubCopied, setPubCopied] = useState(false);

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

  // Mount: restore the exact editor state (sign-in return ?s=, else local
  // draft — funnel "nothing re-entered" invariant), then load the catalog.
  // All setState happens in the async callback (post-mount, not synchronous
  // in the effect) — avoids cascading renders AND a hydration mismatch.
  useEffect(() => {
    let live = true;
    const draft = initialDraft(window.location.search);
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => {
        if (!live) return;
        if (draft) {
          setPresetName(draft.presetName);
          setSubject(draft.subject);
          setTheme(draft.theme);
          setOverrides(draft.overrides);
        }
        setMeta(m);
        if (!draft && m.presets[0]) {
          setPresetName(m.presets[0].name);
          setSubject(m.presets[0].defaultSubject);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Persist the draft so a refresh (or a gated sign-in round-trip) never
  // loses work. localStorage only — account-side drafts are deputy's lane.
  useEffect(() => {
    if (!presetName) return;
    saveDraft({ presetName, subject, theme, overrides });
  }, [presetName, subject, theme, overrides]);

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
  // The light/dark toggle (variant) only changes the preview PAGE background
  // (design ruling: fixed theme), so it is NOT a render dependency. All
  // setState is deferred (in the timer) so it can't cascade-render.
  useEffect(() => {
    if (!configState) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      // Probe <img> reports load/error (a bad handle / upstream 500) and
      // flips previewing off there. If the URL is unchanged the probe won't
      // reload — clear the spinner here so it can never stick.
      const u = await previewUrl(configState, "svg");
      setPendingSrc((prev) => {
        if (prev === u) setPreviewing(false);
        return u;
      });
    }, 250);
    return () => clearTimeout(t);
  }, [configState]);

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

  const currentDraft = useCallback(
    (): EditorDraft => ({ presetName, subject, theme, overrides }),
    [presetName, subject, theme, overrides],
  );

  // Publish: gated. Anonymous → save draft + contextual sign-in that returns
  // to the exact editor state. Authed → POST the config; render the result.
  const onPublish = useCallback(async () => {
    if (!effectiveScene) return;
    const draft = currentDraft();
    saveDraft(draft);

    if (!authed) {
      // Root-relative same-origin redirect (passes deputy's open-redirect
      // guard); ?s= round-trips the exact editing state.
      const target = `/editor?s=${encodeEditorState(draft)}`;
      window.location.href = `/sign-in?redirect=${encodeURIComponent(target)}`;
      return;
    }

    setPublishing(true);
    setPublishErr("");
    try {
      const origin = window.location.origin;
      const href = editorReturnUrl(origin, draft); // README image → reopen editor
      const alt = activePreset?.title ?? presetName;
      const outcome = await publishScene(effectiveScene, href, alt);
      if (outcome.ok) {
        setPublished(outcome.result);
      } else if (outcome.status === 401) {
        const target = `/editor?s=${encodeEditorState(draft)}`;
        window.location.href = `/sign-in?redirect=${encodeURIComponent(target)}`;
      } else {
        setPublishErr(outcome.message);
      }
    } finally {
      setPublishing(false);
    }
  }, [authed, effectiveScene, currentDraft, activePreset, presetName]);

  const copyPublished = useCallback(async () => {
    if (!published) return;
    try {
      await navigator.clipboard.writeText(published.snippet);
      setPubCopied(true);
      setTimeout(() => setPubCopied(false), 2000);
    } catch {
      /* shown below for manual copy */
    }
  }, [published]);

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
                // Load THIS preset's valid sample subject so it renders
                // out-of-the-box (a GitHub login isn't a Nitrotype handle).
                setOverrides({});
                setPublished(null);
                setPublishErr("");
                setPresetName(p.name);
                setSubject(p.defaultSubject);
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
            {shownSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownSrc} alt={`${presetName} preview`} />
            ) : previewError ? (
              <p className="preview-msg">
                Couldn&apos;t render — check the handle.
              </p>
            ) : (
              <div className="skeleton" />
            )}
            {/* Hidden probe: only a successful load swaps into shownSrc, so a
                bad handle / upstream error never shows a broken image. */}
            {pendingSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pendingSrc}
                alt=""
                style={{ display: "none" }}
                onLoad={() => {
                  setShownSrc(pendingSrc);
                  setPreviewError(false);
                  setPreviewing(false);
                }}
                onError={() => {
                  setPreviewError(true);
                  setPreviewing(false);
                }}
              />
            )}
          </div>
          {previewError && shownSrc && (
            <p className="muted small note">
              Couldn&apos;t render the latest change (check the handle) —
              showing the last good preview.
            </p>
          )}
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
            onClick={onPublish}
            disabled={publishing || sessionPending}
            title={
              authed
                ? "Get an owned URL that stays current"
                : "Sign in to publish"
            }
          >
            {publishing ? "Publishing…" : "Publish →"}
          </button>
          {tier && <span className="muted small">encoding: {tier}</span>}
        </div>
        {snippet && (
          <pre className="snippet">
            <code>{snippet}</code>
          </pre>
        )}

        {publishErr && <p className="publish-err">{publishErr}</p>}

        {published && (
          <div className="published">
            <div className="published-head">
              <strong>Published ✓</strong>
              <a href={published.url} target="_blank" rel="noreferrer">
                Open your embed ↗
              </a>
            </div>
            {published.exposesPrivateData && (
              <p className="disclaimer">
                ⚠ This embed publicly exposes your private contribution data.
                Anyone who views it sees the private-inclusive number.
              </p>
            )}
            <p className="muted small">
              Paste this into your README — it stays current at a URL you own:
            </p>
            <pre className="snippet">
              <code>{published.snippet}</code>
            </pre>
            <button
              type="button"
              className="btn primary"
              onClick={copyPublished}
            >
              {pubCopied ? "Copied!" : "Copy embed snippet"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
