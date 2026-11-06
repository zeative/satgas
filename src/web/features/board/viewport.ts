import type { Viewport } from "@xyflow/react";

// Where each board's camera was left, so a reload opens the board where the person last looked; kept per browser.
const KEY = "satgas.board.views";
const KEEP = 50;

type Saved = Viewport & { t: number };

export function cleanView(raw: unknown): Viewport | null {
  if (!raw || typeof raw !== "object") return null;
  const { x, y, zoom } = raw as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  return finite(x) && finite(y) && finite(zoom) && zoom > 0 ? { x, y, zoom } : null;
}

// Adds one board's view and drops the oldest past KEEP, so boards deleted long ago do not pile up.
export function remember(all: Record<string, Saved>, id: string, view: Viewport, now: number, keep = KEEP): Record<string, Saved> {
  const next = { ...all, [id]: { x: view.x, y: view.y, zoom: view.zoom, t: now } };
  const ids = Object.keys(next);
  if (ids.length <= keep) return next;
  const newest = ids.sort((a, b) => (next[b]?.t ?? 0) - (next[a]?.t ?? 0)).slice(0, keep);
  return Object.fromEntries(newest.map((k) => [k, next[k] as Saved]));
}

function readAll(): Record<string, Saved> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" ? (raw as Record<string, Saved>) : {};
  } catch {
    return {};
  }
}

export const loadView = (id: string): Viewport | null => cleanView(readAll()[id]);

export function saveView(id: string, view: Viewport) {
  try {
    localStorage.setItem(KEY, JSON.stringify(remember(readAll(), id, view, Date.now())));
  } catch {
    // Storage full or blocked: the board still opens, just framed to fit.
  }
}
