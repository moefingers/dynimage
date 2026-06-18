"use client";

import { useEffect } from "react";
import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { ElementMetaEntry, MetricEntry } from "./meta-types";
import { LayersPanel } from "./LayersPanel";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { ThemePicker } from "./controls";
import { removeElement, setCanvasTheme } from "./canvas-helpers";

// B2 canvas editor — composes Layers · Canvas · Inspector and owns the
// canvas-global keyboard (undo/redo + delete). Scene state + history live in
// the parent Editor so the shared preview/encoding/publish pipeline sees the
// same scene.

export function CanvasEditor({
  scene,
  onScene,
  undo,
  redo,
  canUndo,
  canRedo,
  catalog,
  metrics,
  selectedId,
  onSelect,
  previewSrc,
  previewing,
  previewError,
  pageVariant,
  onPageVariant,
}: {
  scene: Scene;
  onScene: (s: Scene, selectId?: string | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  catalog: Map<string, ElementMetaEntry>;
  metrics: MetricEntry[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  previewSrc: string;
  previewing: boolean;
  previewError: boolean;
  pageVariant: "dark" | "light";
  onPageVariant: (v: "dark" | "light") => void;
}) {
  // Global canvas keyboard: undo/redo + delete selected (ignore when typing
  // in a field, so inspector inputs keep their own backspace/etc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (
        !typing &&
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedId
      ) {
        e.preventDefault();
        const els = scene.elements as ElementSpec[];
        const hasChildren = els.some((c) => c.anchor?.to === selectedId);
        if (
          hasChildren &&
          !confirm(
            "This element has anchored children — they'll be unanchored. Delete?",
          )
        )
          return;
        onScene(removeElement(scene, selectedId), null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedId, scene, onScene]);

  return (
    <div className="b2">
      <div className="b2-toolbar">
        <button
          type="button"
          className="btn small"
          disabled={!canUndo}
          onClick={undo}
        >
          ↶ Undo
        </button>
        <button
          type="button"
          className="btn small"
          disabled={!canRedo}
          onClick={redo}
        >
          ↷ Redo
        </button>
        <ThemePicker
          value={scene.canvas.theme ?? "dark"}
          onChange={(t) => onScene(setCanvasTheme(scene, t))}
        />
        <div
          className="seg-toggle"
          role="radiogroup"
          aria-label="Page background"
        >
          <button
            type="button"
            role="radio"
            aria-checked={pageVariant === "light"}
            className={pageVariant === "light" ? "seg active" : "seg"}
            onClick={() => onPageVariant("light")}
          >
            ☀
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={pageVariant === "dark"}
            className={pageVariant === "dark" ? "seg active" : "seg"}
            onClick={() => onPageVariant("dark")}
          >
            ☾
          </button>
        </div>
        <span className="muted small">
          {scene.canvas.w}×{scene.canvas.h} · {scene.elements.length} elements
        </span>
      </div>
      <div className="b2-grid">
        <LayersPanel
          scene={scene}
          catalog={catalog}
          selectedId={selectedId}
          onSelect={onSelect}
          onScene={onScene}
        />
        <Canvas
          scene={scene}
          previewSrc={previewSrc}
          previewing={previewing}
          previewError={previewError}
          selectedId={selectedId}
          onSelect={onSelect}
          onScene={(s) => onScene(s)}
          pageVariant={pageVariant}
        />
        <Inspector
          scene={scene}
          selectedId={selectedId}
          catalog={catalog}
          metrics={metrics}
          onScene={(s) => onScene(s)}
        />
      </div>
    </div>
  );
}
