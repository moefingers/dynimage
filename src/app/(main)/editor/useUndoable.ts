import { useCallback, useState } from "react";

// Undo/redo history for the canvas scene (B2 non-negotiable §14.3). A past
// stack, a present, and a future stack. `set` pushes a new present (clearing
// redo); `undo`/`redo` move between them; `reset` re-seeds (e.g. on B1→B2
// eject) with a fresh history.
export type Undoable<T> = {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  set: (next: T) => void;
  undo: () => void;
  redo: () => void;
  reset: (value: T) => void;
};

const LIMIT = 100; // cap history so a long session can't grow unbounded

export function useUndoable<T>(initial: T): Undoable<T> {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const set = useCallback(
    (next: T) => {
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
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1]!;
      setFuture((f) => [present, ...f]);
      setPresent(prev);
      return p.slice(0, -1);
    });
  }, [present]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0]!;
      setPast((p) => [...p, present]);
      setPresent(next);
      return f.slice(1);
    });
  }, [present]);

  const reset = useCallback((value: T) => {
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
