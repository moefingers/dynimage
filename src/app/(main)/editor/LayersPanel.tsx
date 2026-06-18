"use client";

import { useState } from "react";
import type { Scene, ElementSpec } from "@/lib/scene/scene-spec";
import type { ElementMetaEntry } from "./meta-types";
import { addElement, removeElement, reorderElement } from "./canvas-helpers";

// B2 Layers panel (editor-b2-ux-spec §2/§4): z-ordered element list with
// select / reorder / delete, and an "+ Add element" palette built from the
// /api/meta catalog (no hardcoded type list).

export function LayersPanel({
  scene,
  catalog,
  selectedId,
  onSelect,
  onScene,
}: {
  scene: Scene;
  catalog: Map<string, ElementMetaEntry>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onScene: (s: Scene, selectId?: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const els = scene.elements as ElementSpec[];
  // Display frontmost-first (paint order = z, then declaration index).
  const ordered = els
    .map((e, i) => ({ e, i }))
    .sort(
      (a, b) => (b.e.transform?.z ?? 0) - (a.e.transform?.z ?? 0) || b.i - a.i,
    );

  const types = [...catalog.values()];
  const atCap = els.length >= 16; // scene-spec element cap

  return (
    <aside className="layers">
      <div className="layers-head">
        <h2 className="rail-head">Layers</h2>
        <button
          type="button"
          className="btn small"
          disabled={atCap}
          title={atCap ? "Max 16 elements" : "Add an element"}
          onClick={() => setAdding((v) => !v)}
        >
          + Add
        </button>
      </div>

      {adding && (
        <div className="add-palette">
          {types.map((t) => (
            <button
              key={t.type}
              type="button"
              className="palette-item"
              onClick={() => {
                const { scene: next, id } = addElement(scene, t.type, t);
                setAdding(false);
                onScene(next, id);
              }}
            >
              <span className="palette-title">{t.meta.title}</span>
              <span className="palette-desc">{t.meta.description}</span>
            </button>
          ))}
        </div>
      )}
      {atCap && <p className="muted small">Max 16 elements reached.</p>}

      <ul className="layer-list">
        {ordered.map(({ e }) => {
          const entry = catalog.get(e.type);
          return (
            <li
              key={e.id}
              className={e.id === selectedId ? "layer active" : "layer"}
            >
              <button
                type="button"
                className="layer-pick"
                onClick={() => onSelect(e.id)}
              >
                <span className="layer-type">
                  {entry?.meta.title ?? e.type}
                </span>
                <span className="layer-id muted small">
                  {e.id}
                  {e.anchor ? ` ↳ ${e.anchor.to}` : ""}
                </span>
              </button>
              <div className="layer-actions">
                <button
                  type="button"
                  title="Bring forward"
                  onClick={() => onScene(reorderElement(scene, e.id, 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Send back"
                  onClick={() => onScene(reorderElement(scene, e.id, -1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  title="Delete"
                  className="del"
                  onClick={() => {
                    const hasChildren = els.some((c) => c.anchor?.to === e.id);
                    if (
                      hasChildren &&
                      !confirm(
                        `"${e.id}" has anchored children — they'll be unanchored. Delete?`,
                      )
                    )
                      return;
                    onScene(removeElement(scene, e.id), null);
                  }}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
        {els.length === 0 && (
          <li className="muted small">
            Add an element to begin, or start from a preset (Basic).
          </li>
        )}
      </ul>
    </aside>
  );
}
