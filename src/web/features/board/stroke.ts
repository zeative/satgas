import { getStroke } from "perfect-freehand";

export const STROKE_SIZE = 3;
export const HIGHLIGHT_SIZE = 16;

// Keyed by the points array itself, so a stroke scrolled back into view reuses its outline instead of recomputing it.
const outlines = new WeakMap<number[], Map<string, string>>();

const avg = (a: number, b: number) => ((a + b) / 2).toFixed(2);

// The outline as quadratic curves through the midpoints, so a zoomed-in stroke stays round instead of faceted.
function smoothPath(outline: number[][]): string {
  const n = outline.length;
  if (n < 4) return n ? `M${outline.map(([x, y]) => `${x?.toFixed(2)} ${y?.toFixed(2)}`).join("L")}Z` : "";
  const [a, b, c] = outline as [number[], number[], number[]];
  let d = `M${a[0]?.toFixed(2)} ${a[1]?.toFixed(2)}Q${b[0]?.toFixed(2)} ${b[1]?.toFixed(2)} ${avg(b[0] ?? 0, c[0] ?? 0)} ${avg(b[1] ?? 0, c[1] ?? 0)}T`;
  for (let i = 2; i < n - 1; i++) {
    const p = outline[i] ?? [0, 0];
    const q = outline[i + 1] ?? [0, 0];
    d += `${avg(p[0] ?? 0, q[0] ?? 0)} ${avg(p[1] ?? 0, q[1] ?? 0)} `;
  }
  return `${d}Z`;
}

interface Ink {
  size?: number;
  highlight?: boolean;
  // One pressure (0–1) per point from a stylus; a mouse or finger stroke simulates it from speed instead.
  pressure?: number[];
  // The stroke is finished: its end is drawn closed and tapered rather than left open for the next point.
  last?: boolean;
}

// Turns a flat [x, y, …] list into a filled outline that tapers like a real pen stroke.
export function strokePath(points: number[], { size = STROKE_SIZE, highlight = false, pressure, last = true }: Ink = {}): string {
  const pts: number[][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const p = pressure?.[i / 2];
    pts.push(p === undefined ? [points[i] ?? 0, points[i + 1] ?? 0] : [points[i] ?? 0, points[i + 1] ?? 0, p]);
  }
  // A highlighter keeps an even width, like a marker; a pen tapers like ink. A stylus follows the hand more closely.
  const outline = getStroke(pts, {
    size,
    thinning: highlight ? 0 : 0.5,
    smoothing: 0.5,
    streamline: pressure ? 0.25 : 0.5,
    simulatePressure: !pressure && !highlight,
    last,
  });
  return outline.length ? smoothPath(outline) : "";
}

// For saved strokes, whose points never change; the live stroke calls strokePath directly.
export function savedStrokePath(points: number[], ink: Ink = {}): string {
  const key = `${ink.size ?? STROKE_SIZE}|${ink.highlight ? 1 : 0}|${ink.pressure ? 1 : 0}`;
  const byStyle = outlines.get(points) ?? new Map<string, string>();
  const hit = byStyle.get(key);
  if (hit !== undefined) return hit;
  const path = strokePath(points, ink);
  byStyle.set(key, path);
  outlines.set(points, byStyle);
  return path;
}
