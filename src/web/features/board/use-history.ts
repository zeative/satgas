import { useCallback, useEffect, useReducer, useRef } from "react";
import { sendBoardOps } from "@/stores/runs";
import { applyOps, type Board, type BoardOp, inverseOps } from "../../../shared/board";

const LIMIT = 100;

interface Entry {
  ops: BoardOp[];
  inverse: BoardOp[];
}

// Undo works on the person's own changes; cards agents add stay put.
export function useBoardHistory(runId: string, board: Board) {
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);
  // Tracks the board between renders too, so two changes in one tick compute their inverses from the right state.
  const current = useRef(board);
  const seen = useRef(board);
  if (seen.current !== board) {
    seen.current = board;
    current.current = board;
  }
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different board starts with empty history.
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    rerender();
  }, [runId]);

  const commit = useCallback(
    (ops: BoardOp[]) => {
      if (!ops.length) return;
      undoStack.current = [...undoStack.current, { ops, inverse: inverseOps(current.current, ops) }].slice(-LIMIT);
      current.current = applyOps(current.current, ops);
      redoStack.current = [];
      void sendBoardOps(runId, ops);
      rerender();
    },
    [runId],
  );

  const undo = useCallback(() => {
    const entry = undoStack.current.at(-1);
    if (!entry) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, entry];
    current.current = applyOps(current.current, entry.inverse);
    void sendBoardOps(runId, entry.inverse);
    rerender();
  }, [runId]);

  const redo = useCallback(() => {
    const entry = redoStack.current.at(-1);
    if (!entry) return;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, entry];
    current.current = applyOps(current.current, entry.ops);
    void sendBoardOps(runId, entry.ops);
    rerender();
  }, [runId]);

  return { commit, undo, redo, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 };
}
