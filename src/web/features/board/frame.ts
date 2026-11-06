import type { Viewport } from "@xyflow/react";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Pixels the floating chrome and the open side panel cover along each edge of the board.
export interface Inset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Fits bounds into the part of the board nothing covers and centres them there. React Flow's own fit centres on the
// whole width once the zoom hits its cap, which puts a small board behind the panel.
export function viewportFor(bounds: Rect, width: number, height: number, minZoom: number, maxZoom: number, inset: Inset): Viewport {
  const w = Math.max(1, width - inset.left - inset.right);
  const h = Math.max(1, height - inset.top - inset.bottom);
  const zoom = clamp(Math.min(w / Math.max(1, bounds.width), h / Math.max(1, bounds.height)), minZoom, maxZoom);
  return {
    x: inset.left + w / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: inset.top + h / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

// Zooms to `zoom` while the board point under screen point (px, py) stays where it is.
export function zoomAround(view: Viewport, zoom: number, px: number, py: number): Viewport {
  return { x: px - ((px - view.x) * zoom) / view.zoom, y: py - ((py - view.y) * zoom) / view.zoom, zoom };
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
