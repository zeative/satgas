import { createContext, useContext } from "react";
import type { BoardOp, Card } from "../../../shared/board";
import { randomUuid } from "../../../shared/random-uuid";

// Stable for the life of a board, so a change here never re-renders every card; per-card state rides on node data.
export interface BoardApi {
  runId: string;
  // Records the change for undo, applies it locally and sends it to the server.
  commit: (ops: BoardOp[]) => void;
  setEditingId: (id: string | null) => void;
  expand: (card: Card) => void;
  // Whether the card is still on the board, read when an edit ends after the card may have gone.
  hasCard: (id: string) => boolean;
  fileKey?: string;
}

export const BoardContext = createContext<BoardApi | null>(null);

// True while the whole board renders for an export, so cards skip their far-zoom placeholders.
export const FullDetail = createContext(false);

export function useBoard(): BoardApi {
  const api = useContext(BoardContext);
  if (!api) throw new Error("useBoard needs a BoardContext provider");
  return api;
}

export const newId = () => randomUuid().slice(0, 12);

// Workspace files load through the board's key, so sandboxed previews and new tabs work without the sign-in cookie.
export function keyedSrc(src: string | undefined, runId: string, key: string | undefined): string | undefined {
  const prefix = `/api/runs/${runId}/files/`;
  if (!src || !key || !src.startsWith(prefix) || src.startsWith(`${prefix}~`)) return src;
  return `${prefix}~${key}/${src.slice(prefix.length)}`;
}
