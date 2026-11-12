import { create } from "zustand";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Where one source file draws on a page: its whole area, and each element by the line that opens it, [line, x, y, w, h].
export interface FileBox extends Box {
  els?: [number, number, number, number, number][];
}

// What a live app frame on the board shows right now: where each source file renders on its page, and how the page sits
// in the card (shrunk by `scale`, offset by `left`), so a point on the page maps to a point on the board.
export interface FrameLayout {
  files: Record<string, FileBox>;
  scrollY: number;
  vh: number;
  scale: number;
  left: number;
}

export const useFrames = create<Record<string, FrameLayout>>(() => ({}));

export function setFrameLayout(cardId: string, patch: Partial<FrameLayout>) {
  const now = useFrames.getState()[cardId] ?? { files: {}, scrollY: 0, vh: 0, scale: 1, left: 0 };
  useFrames.setState({ [cardId]: { ...now, ...patch } });
}

export function dropFrame(cardId: string) {
  const { [cardId]: _, ...rest } = useFrames.getState();
  useFrames.setState(rest, true);
}
