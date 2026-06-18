"use client";

import { useEffect } from "react";
import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { ElementMetaEntry, MetricEntry } from "./meta-types";
import { LayersPanel } from "./LayersPanel";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { ThemePicker } from "./controls";
import {
  removeElement,
  setCanvasTheme,
  patchTransform,
  setAnchor,
} from "./canvas-helpers";

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
  onScene: (s: Scene, selectId?: string | null, coalesceKey?: string) => void;
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
  // Global canvas keyboard: undo/redo + delete + arrow-nudge of the selected
  // element. Global (not on the canvas div) so it works whichever panel has
  // focus — e.g. nudging right after selecting in the Layers list. Ignored
  // while typing in a field so inspector inputs keep their own keys.
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
      if (typing || !selectedId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
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
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      const dx =
        e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (dx === 0 && dy === 0) return;
      e.preventDefault();
      const el = (scene.elements as ElementSpec[]).find(
        (x) => x.id === selectedId,
      );
      if (!el) return;
      // Nudge coalesces into one undo entry per burst (same key + quick).
      const key = `${selectedId}.nudge`;
      if (el.anchor) {
        onScene(
          setAnchor(scene, el.id, {
            ...el.anchor,
            dx: (el.anchor.dx ?? 0) + dx,
            dy: (el.anchor.dy ?? 0) + dy,
          }),
          undefined,
          key,
        );
      } else {
        onScene(
          patchTransform(scene, el.id, {
            x: (el.transform?.x ?? 0) + dx,
            y: (el.transform?.y ?? 0) + dy,
          }),
          undefined,
          key,
        );
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
          onScene={onScene}
          pageVariant={pageVariant}
        />
        <Inspector
          scene={scene}
          selectedId={selectedId}
          catalog={catalog}
          metrics={metrics}
          onScene={onScene}
        />
      </div>
    </div>
  );
}
