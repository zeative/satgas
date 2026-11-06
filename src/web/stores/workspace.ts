import { create } from "zustand";

// The board's left Workspace panel: open by default, with the width the person dragged it to, kept across boards.
const KEY = "satgas.workspace";
export const WORKSPACE_DEFAULT = 300;
export const WORKSPACE_MIN = 240;
const WORKSPACE_MAX = 640;
// The canvas keeps at least this much room beside both panels.
const BOARD_MIN = 420;

export type WorkspaceTab = "changes" | "files" | "git" | "outline";

export function clampWorkspace(width: number, viewport = typeof window === "undefined" ? 1440 : window.innerWidth): number {
  const max = Math.max(WORKSPACE_MIN, Math.min(WORKSPACE_MAX, viewport - BOARD_MIN));
  return Math.round(Math.min(max, Math.max(WORKSPACE_MIN, width)));
}

// Open by default where there is room for it beside the chat; the person's own choice wins once made.
const roomy = () => typeof window === "undefined" || window.innerWidth >= 1280;

function stored(): { open: boolean; width: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { open?: unknown; width?: unknown };
    return {
      open: typeof v.open === "boolean" ? v.open : roomy(),
      width: typeof v.width === "number" && v.width > 0 ? clampWorkspace(v.width) : WORKSPACE_DEFAULT,
    };
  } catch {
    return { open: roomy(), width: WORKSPACE_DEFAULT };
  }
}

export const useWorkspace = create<{ open: boolean; width: number }>(() => stored());

const save = () => {
  const { open, width } = useWorkspace.getState();
  localStorage.setItem(KEY, JSON.stringify({ open, width }));
};

export function setWorkspaceWidth(width: number, keep = true) {
  useWorkspace.setState({ width: clampWorkspace(width) });
  if (keep) save();
}

export function toggleWorkspace(open = !useWorkspace.getState().open) {
  useWorkspace.setState({ open });
  save();
}
