import { create } from "zustand";

// The board's side panel (chat or details) keeps the width the person dragged it to, across boards and reloads.
const KEY = "satgas.panelWidth";
export const PANEL_DEFAULT = 384;
export const PANEL_MIN = 320;
const PANEL_MAX = 760;
// The board keeps at least this much room beside the panel.
const BOARD_MIN = 360;

export function clampPanel(width: number, viewport = typeof window === "undefined" ? 1440 : window.innerWidth): number {
  const max = Math.max(PANEL_MIN, Math.min(PANEL_MAX, viewport - BOARD_MIN));
  return Math.round(Math.min(max, Math.max(PANEL_MIN, width)));
}

function stored(): number {
  const n = Number(typeof localStorage === "undefined" ? Number.NaN : localStorage.getItem(KEY));
  return Number.isFinite(n) && n > 0 ? clampPanel(n) : PANEL_DEFAULT;
}

export const usePanel = create<{ width: number }>(() => ({ width: stored() }));

export function setPanelWidth(width: number, save = true) {
  const next = clampPanel(width);
  usePanel.setState({ width: next });
  if (save) localStorage.setItem(KEY, String(next));
}
