// Where agent cards land on a board: a task's cards go next to the cards its work came from, or, with nothing upstream,
// onto the shelf under the team. Shared by the server, which places them, and the board, which draws where a running
// task's work is heading.
import type { Card } from "./board";
import { flowSources } from "./flow";
import { crew, teamBounds } from "./team";
import type { NodeState, Run } from "./types";

const SHELF_GAP = 40;
const SHELF_TOP = 96;
// Room between a card and what it was made from, for the wire between them to read as a step.
const FLOW_GAP = 120;
// Wide enough for two framed boards side by side.
const SHELF_MAX_WIDTH = 2400;
const MAX_SHELF_SEARCH = 200;

// Agent cards fill a shelf under the team: each takes the highest, then leftmost, free spot, so cards of different
// sizes pack into tidy rows and never cover the team, frames or other cards.
export function placeOnShelf(run: Run, cards: Omit<Card, "x" | "y">[]): Card[] {
  const g = teamBounds(crew(run));
  const left = g.left;
  const right = left + Math.max(SHELF_MAX_WIDTH, g.right - g.left);
  const top = g.bottom + SHELF_TOP;
  const board = run.board?.cards ?? [];
  const near = (r: Rect) => r.y + r.h > top && r.x < right && r.x + r.w > left;
  // A frame stands for everything inside it.
  const taken: Rect[] = board.filter((c) => !withinFrame(c, board)).filter(near);
  return cards.map((c) => {
    const card = { ...c, ...freeSpot(c, taken, left, right, top) } as Card;
    taken.push(card);
    return card;
  });
}

// A task whose work came from other cards puts its own just right of them, level with the first, so the board reads
// left to right the way the work went. They pack into rows of a block about two cards wide, biggest first, instead of
// one long column, and never touch what is already there. A task with nothing upstream fills the shelf as before.
export function placeInFlow(run: Run, node: Pick<NodeState, "id">, cards: Omit<Card, "x" | "y">[]): Card[] {
  const board = run.board?.cards ?? [];
  const ids = new Set(flowSources(run.nodes, board)(node.id));
  const from = board.filter((c) => ids.has(c.id));
  if (!from.length) return placeOnShelf(run, cards);
  const left = Math.max(...from.map((c) => c.x + c.w)) + FLOW_GAP;
  const top = Math.min(...from.map((c) => c.y));
  const widest = Math.max(...cards.map((c) => c.w), 0);
  const right = left + Math.max(BLOCK_MIN_WIDTH, widest * 2 + SHELF_GAP);
  const taken: Rect[] = board.filter((c) => !withinFrame(c, board));
  const order = cards.map((c, i) => ({ c, i })).sort((a, b) => b.c.w * b.c.h - a.c.w * a.c.h);
  const placed: Card[] = new Array(cards.length);
  for (const { c, i } of order) {
    const card = { ...c, ...freeSpot(c, taken, left, right, top, true) } as Card;
    taken.push(card);
    placed[i] = card;
  }
  return placed;
}
const BLOCK_MIN_WIDTH = 1400;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const withinFrame = (c: Card, cards: Card[]) =>
  c.kind !== "frame" &&
  cards.some((f) => f.kind === "frame" && f.id !== c.id && c.x >= f.x && c.y >= f.y && c.x + c.w <= f.x + f.w && c.y + c.h <= f.y + f.h);

const clash = (a: Rect, x: number, y: number, w: number, h: number) =>
  a.x < x + w + SHELF_GAP && x < a.x + a.w + SHELF_GAP && a.y < y + h + SHELF_GAP && y < a.y + a.h + SHELF_GAP;

// Spots worth trying sit at the shelf's edges and just past what is already there.
// `local`: only what overlaps the column band counts, so a block beside other work starts level with its inputs.
function freeSpot(
  c: { w: number; h: number },
  all: Rect[],
  left: number,
  right: number,
  top: number,
  local = false,
): { x: number; y: number } {
  const taken = local ? all.filter((r) => r.x < right + SHELF_GAP && r.x + r.w + SHELF_GAP > left) : all;
  const below = { x: left, y: Math.max(top, ...taken.map((r) => r.y + r.h + SHELF_GAP)) };
  // The search grows with the cube of what is there; a crowded shelf just continues underneath.
  if (taken.length > MAX_SHELF_SEARCH) return below;
  const ys = [...new Set([top, ...taken.map((r) => r.y + r.h + SHELF_GAP)])].filter((y) => y >= top).sort((a, b) => a - b);
  for (const y of ys) {
    const band = taken.filter((r) => r.y < y + c.h + SHELF_GAP && r.y + r.h + SHELF_GAP > y);
    const xs = [...new Set([left, ...band.map((r) => r.x + r.w + SHELF_GAP)])].sort((a, b) => a - b);
    // Something wider than the shelf still gets the left edge of a free row.
    for (const x of xs) if ((x + c.w <= right || x === left) && !band.some((r) => clash(r, x, y, c.w, c.h))) return { x, y };
  }
  return below;
}
