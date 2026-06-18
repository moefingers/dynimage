"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import { patchTransform } from "./canvas-helpers";

// B2 Canvas (editor-b2-ux-spec §3): the live preview IS the canvas. Click an
// element to select; drag the body to move, the 8 handles to resize, the
// rotate handle to rotate. Arrow keys nudge (keyboard parity §12). Edge/
// center snapping. Direct manipulation targets FREE (non-anchored) elements
// with an explicit box; anchored elements are selected via Layers and
// positioned by their parent (offset in the Inspector).
//
// Live-drag model: a gesture mutates a LOCAL transform (responsive, no
// re-render churn) and commits ONE scene update on pointer-up — so each
// drag is a single undo entry and the (debounced) backdrop re-renders once.

type Box = { x: number; y: number; w: number; h: number; rotate: number };

const HANDLES: { k: string; cx: number; cy: number; cursor: string }[] = [
  { k: "nw", cx: 0, cy: 0, cursor: "nwse-resize" },
  { k: "n", cx: 0.5, cy: 0, cursor: "ns-resize" },
  { k: "ne", cx: 1, cy: 0, cursor: "nesw-resize" },
  { k: "e", cx: 1, cy: 0.5, cursor: "ew-resize" },
  { k: "se", cx: 1, cy: 1, cursor: "nwse-resize" },
  { k: "s", cx: 0.5, cy: 1, cursor: "ns-resize" },
  { k: "sw", cx: 0, cy: 1, cursor: "nesw-resize" },
  { k: "w", cx: 0, cy: 0.5, cursor: "ew-resize" },
];

const SNAP = 6; // scene-units snap threshold (pre-scale)

function boxOf(el: ElementSpec): Box | null {
  const t = el.transform ?? {};
  if (el.anchor) return null; // anchored → positioned by parent
  if (t.x == null || t.y == null || t.w == null || t.h == null) return null;
  return { x: t.x, y: t.y, w: t.w, h: t.h, rotate: t.rotate ?? 0 };
}

export function Canvas({
  scene,
  previewSrc,
  previewing,
  previewError,
  selectedId,
  onSelect,
  onScene,
  pageVariant,
}: {
  scene: Scene;
  previewSrc: string;
  previewing: boolean;
  previewError: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onScene: (s: Scene) => void;
  pageVariant: "dark" | "light";
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [live, setLive] = useState<{ id: string; box: Box } | null>(null);
  const [guides, setGuides] = useState<{ vx?: number; hy?: number }>({});
  const drag = useRef<{
    id: string;
    mode: "move" | "resize" | "rotate";
    handle?: string;
    px: number;
    py: number;
    start: Box;
  } | null>(null);

  const { w: cw, h: ch } = scene.canvas;

  // Fit the canvas to the available width (never upscale past 1:1).
  useEffect(() => {
    const fit = () => {
      const avail = wrapRef.current?.clientWidth ?? cw;
      setScale(Math.min(1, avail / cw));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [cw]);

  const sel = (scene.elements as ElementSpec[]).find(
    (e) => e.id === selectedId,
  );
  const selBox = sel ? (live?.id === sel.id ? live.box : boxOf(sel)) : null;

  const snap = useCallback(
    (box: Box): { box: Box; vx?: number; hy?: number } => {
      let { x, y } = box;
      const { w, h } = box;
      let vx: number | undefined;
      let hy: number | undefined;
      const near = (a: number, b: number) => Math.abs(a - b) <= SNAP;
      // Horizontal: left/center/right vs canvas left/center/right.
      const cxs: [number, number][] = [
        [x, 0],
        [x + w / 2, cw / 2],
        [x + w, cw],
      ];
      for (const [val, target] of cxs)
        if (near(val, target)) {
          x += target - val;
          vx = target;
          break;
        }
      const cys: [number, number][] = [
        [y, 0],
        [y + h / 2, ch / 2],
        [y + h, ch],
      ];
      for (const [val, target] of cys)
        if (near(val, target)) {
          y += target - val;
          hy = target;
          break;
        }
      return { box: { ...box, x, y }, vx, hy };
    },
    [cw, ch],
  );

  // Latest values for the always-mounted window listeners (so the first
  // pointermoves are never missed waiting on a re-render to attach them).
  const stateRef = useRef({ scale, snap, onScene, scene, selectedId });
  useEffect(() => {
    stateRef.current = { scale, snap, onScene, scene, selectedId };
  });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const st = stateRef.current;
      const dx = (e.clientX - d.px) / st.scale;
      const dy = (e.clientY - d.py) / st.scale;
      let box: Box = { ...d.start };
      if (d.mode === "move") {
        box.x = d.start.x + dx;
        box.y = d.start.y + dy;
        const s = st.snap(box);
        box = s.box;
        setGuides({ vx: s.vx, hy: s.hy });
      } else if (d.mode === "resize") {
        const hd = d.handle!;
        if (hd.includes("e")) box.w = Math.max(8, d.start.w + dx);
        if (hd.includes("s")) box.h = Math.max(8, d.start.h + dy);
        if (hd.includes("w")) {
          box.w = Math.max(8, d.start.w - dx);
          box.x = d.start.x + (d.start.w - box.w);
        }
        if (hd.includes("n")) {
          box.h = Math.max(8, d.start.h - dy);
          box.y = d.start.y + (d.start.h - box.h);
        }
      } else if (d.mode === "rotate") {
        const cx = d.start.x + d.start.w / 2;
        const cy = d.start.y + d.start.h / 2;
        const rect = wrapRef.current!.getBoundingClientRect();
        const sx = (e.clientX - rect.left) / st.scale;
        const sy = (e.clientY - rect.top) / st.scale;
        let deg = (Math.atan2(sy - cy, sx - cx) * 180) / Math.PI + 90;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        box.rotate = Math.round(deg);
      }
      if (d.id) setLive({ id: d.id, box });
    };
    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      setGuides({});
      if (!d) return;
      const st = stateRef.current;
      setLive((cur) => {
        if (cur && st.selectedId) {
          st.onScene(
            patchTransform(st.scene, st.selectedId, {
              x: Math.round(cur.box.x),
              y: Math.round(cur.box.y),
              w: Math.round(cur.box.w),
              h: Math.round(cur.box.h),
              rotate: Math.round(cur.box.rotate),
            }),
          );
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const startDrag = (
    e: React.PointerEvent,
    mode: "move" | "resize" | "rotate",
    handle?: string,
  ) => {
    if (!selBox || !selectedId) return;
    e.stopPropagation();
    drag.current = {
      id: selectedId,
      mode,
      handle,
      px: e.clientX,
      py: e.clientY,
      start: { ...selBox },
    };
    setLive({ id: selectedId, box: { ...selBox } });
  };

  // Arrow-key nudge (keyboard parity).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!sel || !selBox || sel.anchor) return;
    const step = e.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;
    e.preventDefault();
    onScene(
      patchTransform(scene, sel.id, { x: selBox.x + dx, y: selBox.y + dy }),
    );
  };

  return (
    <div className="canvas-zone">
      <div
        ref={wrapRef}
        className={`canvas-fit ${pageVariant}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={() => onSelect(null)}
      >
        <div
          className="canvas-stage"
          style={{ width: cw * scale, height: ch * scale }}
        >
          {previewSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="canvas-img"
              src={previewSrc}
              alt="scene preview"
              style={{ width: cw * scale, height: ch * scale }}
              draggable={false}
            />
          )}
          {!previewSrc && (
            <div className="skeleton" style={{ height: ch * scale }} />
          )}

          {/* Hit boxes for free elements (click to select). */}
          {(scene.elements as ElementSpec[]).map((el) => {
            const b = boxOf(el);
            if (!b) return null;
            return (
              <div
                key={el.id}
                className="hit"
                style={{
                  left: b.x * scale,
                  top: b.y * scale,
                  width: b.w * scale,
                  height: b.h * scale,
                  transform: b.rotate ? `rotate(${b.rotate}deg)` : undefined,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(el.id);
                }}
              />
            );
          })}

          {/* Snap guides */}
          {guides.vx != null && (
            <div className="guide v" style={{ left: guides.vx * scale }} />
          )}
          {guides.hy != null && (
            <div className="guide h" style={{ top: guides.hy * scale }} />
          )}

          {/* Selection box + handles (free elements only). */}
          {selBox && (
            <div
              className="sel-box"
              style={{
                left: selBox.x * scale,
                top: selBox.y * scale,
                width: selBox.w * scale,
                height: selBox.h * scale,
                transform: selBox.rotate
                  ? `rotate(${selBox.rotate}deg)`
                  : undefined,
              }}
              onPointerDown={(e) => startDrag(e, "move")}
            >
              {HANDLES.map((h) => (
                <span
                  key={h.k}
                  className="handle"
                  style={{
                    left: `${h.cx * 100}%`,
                    top: `${h.cy * 100}%`,
                    cursor: h.cursor,
                  }}
                  onPointerDown={(e) => startDrag(e, "resize", h.k)}
                />
              ))}
              <span
                className="handle rotate"
                onPointerDown={(e) => startDrag(e, "rotate")}
                title="Rotate (Shift = 15°)"
              />
            </div>
          )}
        </div>
      </div>
      <div className="canvas-status">
        {previewing && <span className="muted small">rendering…</span>}
        {previewError && (
          <span className="muted small">
            couldn&apos;t render — check binds/handles (showing last good)
          </span>
        )}
        {sel && selBox && (
          <span className="muted small" aria-live="polite">
            {sel.id} · x {Math.round(selBox.x)} y {Math.round(selBox.y)} · w{" "}
            {Math.round(selBox.w)} h {Math.round(selBox.h)}
            {selBox.rotate ? ` · ${Math.round(selBox.rotate)}°` : ""}
          </span>
        )}
        {sel?.anchor && (
          <span className="muted small">
            {sel.id} is anchored to {sel.anchor.to} — move via Inspector offset.
          </span>
        )}
      </div>
    </div>
  );
}
