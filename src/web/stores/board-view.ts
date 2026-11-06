import { create } from "zustand";

export type BoardView = "canvas" | "chat";

// Each board opens the way it was left; one never opened before opens as chat on a phone-sized screen.
const KEY = "satgas.boardView";

function stored(): Record<string, BoardView> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, BoardView>;
  } catch {
    return {};
  }
}

export const useBoardViews = create<{ views: Record<string, BoardView> }>(() => ({ views: stored() }));

const fallback = (): BoardView => (typeof window !== "undefined" && window.innerWidth < 768 ? "chat" : "canvas");

export function useBoardView(runId: string): BoardView {
  return useBoardViews((s) => s.views[runId]) ?? fallback();
}

export function setBoardView(runId: string, view: BoardView) {
  const views = { ...useBoardViews.getState().views, [runId]: view };
  useBoardViews.setState({ views });
  localStorage.setItem(KEY, JSON.stringify(views));
}
