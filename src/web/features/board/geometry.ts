export interface Pt {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The box a drag from `from` to `to` draws, Excalidraw's way: it flips when dragged up or left, Shift keeps it square
// (the longer side wins), Alt grows it from the press point as its centre.
export function dragBox(from: Pt, to: Pt, opts: { square?: boolean; center?: boolean } = {}): Box {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (opts.square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  if (opts.center) return { x: from.x - Math.abs(dx), y: from.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 };
  return { x: Math.min(from.x, from.x + dx), y: Math.min(from.y, from.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

// Shift on a line: the end swings to the nearest 15° so lines come out level, upright or at clean angles.
export function lockAngle(from: Pt, to: Pt, step = Math.PI / 12): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: from.x + Math.cos(angle) * len, y: from.y + Math.sin(angle) * len };
}

export interface Guide {
  // A vertical guide at x, or a horizontal one at y, spanning from `from` to `to` on the other axis.
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];

// Object snapping: the moving box's edges and centre line up with the nearest edge or centre of another box within
// `tolerance`; the guides show which boxes it lined up with.
export function snapBox(moving: Box, others: Box[], tolerance: number): { dx: number; dy: number; guides: Guide[] } {
  let best = { x: { d: tolerance + 1, at: 0 }, y: { d: tolerance + 1, at: 0 } };
  for (const o of others) {
    for (const a of xs(moving))
      for (const b of xs(o)) {
        const d = Math.abs(b - a);
        if (d < best.x.d) best = { ...best, x: { d, at: b - a } };
      }
    for (const a of ys(moving))
      for (const b of ys(o)) {
        const d = Math.abs(b - a);
        if (d < best.y.d) best = { ...best, y: { d, at: b - a } };
      }
  }
  const dx = best.x.d <= tolerance ? best.x.at : 0;
  const dy = best.y.d <= tolerance ? best.y.at : 0;
  const placed = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  if (best.x.d <= tolerance) {
    for (const at of new Set(xs(placed))) {
      const hits = others.filter((o) => xs(o).some((v) => near(v, at)));
      if (!hits.length) continue;
      const span = [placed, ...hits].flatMap((b) => [b.y, b.y + b.h]);
      guides.push({ axis: "x", at, from: Math.min(...span), to: Math.max(...span) });
    }
  }
  if (best.y.d <= tolerance) {
    for (const at of new Set(ys(placed))) {
      const hits = others.filter((o) => ys(o).some((v) => near(v, at)));
      if (!hits.length) continue;
      const span = [placed, ...hits].flatMap((b) => [b.x, b.x + b.w]);
      guides.push({ axis: "y", at, from: Math.min(...span), to: Math.max(...span) });
    }
  }
  return { dx, dy, guides };
}

export const boundsOf = (boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};
