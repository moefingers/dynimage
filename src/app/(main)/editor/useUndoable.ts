import { useCallback, useRef, useState } from "react";

// Undo/redo history for the canvas scene (B2 non-negotiable §14.3). A past
// stack, a present, and a future stack. `set` pushes a new present (clearing
// redo); `undo`/`redo` move between them; `reset` re-seeds (e.g. on B1→B2
// eject) with a fresh history.
//
// `set` takes an optional COALESCE KEY: consecutive sets with the same key
// within a short window REPLACE the present instead of pushing a new past
// entry — so dragging a slider or typing into a numeric/text field collapses
// to ONE undo step, not one-per-keystroke. A different key (or a pause, or a
// keyless set) starts a fresh entry.
export type Undoable<T> = {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  set: (next: T, coalesceKey?: string) => void;
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;
};

const LIMIT = 100; // cap history so a long session can't grow unbounded
const COALESCE_MS = 600;

export function useUndoable<T>(initial: T): Undoable<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);
  const lastEdit = useRef<{ key?: string; t: number }>({ t: 0 });

  const set = useCallback(
    (next: T, coalesceKey?: string) => {
      const now = Date.now();
      const last = lastEdit.current;
      lastEdit.current = { key: coalesceKey, t: now };
      // Same field, in quick succession → fold into the current entry.
      const coalesce =
        coalesceKey != null &&
        coalesceKey === last.key &&
        now - last.t < COALESCE_MS;
      if (coalesce) {
        setPresent(next);
        setFuture([]);
        return;
      }
      setPast((p) => {
        const np = [...p, present];
        return np.length > LIMIT ? np.slice(np.length - LIMIT) : np;
      });
      setPresent(next);
      setFuture([]);
    },
    [present],
  );

  const undo = useCallback(() => {
    lastEdit.current = { t: 0 }; // a later edit must not coalesce across undo
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1]!;
      setFuture((f) => [present, ...f]);
      setPresent(prev);
      return p.slice(0, -1);
    });
  }, [present]);

  const redo = useCallback(() => {
    lastEdit.current = { t: 0 };
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0]!;
      setPast((p) => [...p, present]);
      setPresent(next);
      return f.slice(1);
    });
  }, [present]);

  const reset = useCallback((value: T) => {
    lastEdit.current = { t: 0 };
    setPast([]);
    setPresent(value);
    setFuture([]);
  }, []);

  return {
    present,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    set,
    undo,
    redo,
    reset,
  };
}
