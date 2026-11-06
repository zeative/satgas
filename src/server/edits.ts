import { emptyBoard, inverseOps } from "../shared/board";
import { addCounts, type BoardEdit, type EditCounts, editOps, emptyCounts } from "../shared/board-edit";
import { appendLog, boardOps, getRun, patchRun } from "./store";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeCounts(c: EditCounts): string {
  const parts = [
    c.removed && `removed ${plural(c.removed, "card")}`,
    c.changed && `changed ${plural(c.changed, "card")}`,
    c.moved && `moved ${plural(c.moved, "card")}`,
    c.linked && `connected ${plural(c.linked, "pair")}`,
    c.unlinked && `removed ${plural(c.unlinked, "connector")}`,
  ].filter(Boolean);
  return `Board: ${parts.join(", ")}`;
}

// Applies the lead's or an agent's canvas commands and keeps, per round, the ops that undo all of them at once.
export function editBoard(runId: string, round: number, commands: unknown, logAs: string): EditCounts | null {
  const run = getRun(runId);
  if (!run) return null;
  const board = run.board ?? emptyBoard();
  const { ops, counts, skipped } = editOps(board, commands);
  for (const s of skipped) appendLog(runId, logAs, { kind: "info", text: `Board change skipped: ${s}` });
  if (!ops.length) return null;
  const undo = inverseOps(board, ops);
  boardOps(runId, ops);
  // An undone edit is history; the next change in the same round starts a fresh one.
  const prev = getRun(runId)?.edits?.[round];
  const kept = prev && !prev.undone ? prev : undefined;
  const edit: BoardEdit = { counts: addCounts(kept?.counts ?? emptyCounts(), counts), undo: [...undo, ...(kept?.undo ?? [])] };
  patchRun(runId, { edits: { ...getRun(runId)?.edits, [round]: edit } });
  appendLog(runId, logAs, { kind: "info", text: describeCounts(counts) });
  return counts;
}

export function undoEdit(runId: string, round: number): "ok" | "missing" | "done" {
  const run = getRun(runId);
  const edit = run?.edits?.[round];
  if (!run || !edit) return "missing";
  if (edit.undone) return "done";
  boardOps(runId, edit.undo);
  patchRun(runId, { edits: { ...run.edits, [round]: { ...edit, undone: true } } });
  return "ok";
}
