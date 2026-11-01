import { getStroke } from "perfect-freehand";

export const STROKE_SIZE = 3;
export const HIGHLIGHT_SIZE = 16;

// Keyed by the points array itself, so a stroke scrolled back into view reuses its outline instead of recomputing it.
const outlines = new WeakMap<number[], Map<string, string>>();

// Turns a flat [x, y, …] list into a filled outline that tapers like a real pen stroke.
export function strokePath(points: number[], size = STROKE_SIZE, highlight = false): string {
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push([points[i] ?? 0, points[i + 1] ?? 0]);
  // A highlighter keeps an even width, like a marker; a pen tapers like ink.
  const outline = getStroke(pts, { size, thinning: highlight ? 0 : 0.4, smoothing: 0.6, streamline: 0.5 });
  if (!outline.length) return "";
  return `${outline.map(([x, y], i) => `${i ? "L" : "M"}${x?.toFixed(1)} ${y?.toFixed(1)}`).join("")}Z`;
}

// For saved strokes, whose points never change; the live stroke calls strokePath directly.
export function savedStrokePath(points: number[], size = STROKE_SIZE, highlight = false): string {
  const key = `${size}|${highlight ? 1 : 0}`;
  const byStyle = outlines.get(points) ?? new Map<string, string>();
  const hit = byStyle.get(key);
  if (hit !== undefined) return hit;
  const path = strokePath(points, size, highlight);
  byStyle.set(key, path);
  outlines.set(points, byStyle);
  return path;
}
