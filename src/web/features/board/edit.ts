import { type Board, type BoardOp, type Card, type ColorName, type Connector, type ShapeKind, sanitizeOps } from "../../../shared/board";

// Pure board edits behind the context menu and its shortcuts; each returns ops, so undo and sync come for free.

export interface Clip {
  cards: Card[];
  links: Connector[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Arrange = "front" | "forward" | "backward" | "back";

export interface CardStyle {
  color?: ColorName;
  shape?: ShapeKind;
  size?: number;
  highlight?: boolean;
}

const CLIP_TYPE = "satgas/cards";
const COLORED = new Set<Card["kind"]>(["note", "shape", "drawing"]);

export function bounds(cards: Card[]): Box {
  const x = Math.min(...cards.map((c) => c.x));
  const y = Math.min(...cards.map((c) => c.y));
  return { x, y, w: Math.max(...cards.map((c) => c.x + c.w)) - x, h: Math.max(...cards.map((c) => c.y + c.h)) - y };
}

// Copied cards travel as tagged JSON in plain text, so they paste back as cards and stay harmless anywhere else.
export function encodeClip(board: Board, ids: ReadonlySet<string>): string | null {
  const cards = board.cards.filter((c) => ids.has(c.id));
  if (!cards.length) return null;
  const links = board.links.filter((l) => ids.has(l.source) && ids.has(l.target));
  return JSON.stringify({ type: CLIP_TYPE, cards, links });
}

// Clipboard text is untrusted, so cards pass through the same sanitizer the server uses.
export function decodeClip(text: string): Clip | null {
  let raw: { type?: unknown; cards?: unknown; links?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || raw.type !== CLIP_TYPE || !Array.isArray(raw.cards) || !raw.cards.length) return null;
  const ops = sanitizeOps([
    ...raw.cards.map((card) => ({ op: "put", card })),
    ...(Array.isArray(raw.links) ? raw.links : []).map((link) => ({ op: "link", link })),
  ]);
  if (!ops) return null;
  return {
    cards: ops.flatMap((o) => (o.op === "put" ? [o.card] : [])),
    links: ops.flatMap((o) => (o.op === "link" ? [o.link] : [])),
  };
}

// Fresh copies shifted by (dx, dy); links between copied cards follow. Copies belong to the person: unlocked, no agent origin.
export function cloneOps(clip: Clip, dx: number, dy: number, makeId: () => string): { ops: BoardOp[]; ids: string[] } {
  const ids = new Map(clip.cards.map((c) => [c.id, makeId()]));
  const now = Date.now();
  const ops: BoardOp[] = clip.cards.map((c) => {
    const { from: _from, locked: _locked, ...rest } = c;
    return { op: "put", card: { ...rest, id: ids.get(c.id) as string, x: c.x + dx, y: c.y + dy, createdAt: now } };
  });
  for (const l of clip.links) {
    const source = ids.get(l.source);
    const target = ids.get(l.target);
    if (source && target) ops.push({ op: "link", link: { id: `l-${makeId()}`, source, target } });
  }
  return { ops, ids: [...ids.values()] };
}

// A frame drawn around a box (cards, tasks or both) with room for its name above them.
export function frameAround(b: Box, id: string, name: string): Card {
  const pad = 40;
  return { id, kind: "frame", x: b.x - pad, y: b.y - pad - 16, w: b.w + pad * 2, h: b.h + pad * 2 + 16, text: name, createdAt: Date.now() };
}

// The stacking layer a card sits in by default: ink under cards, frames in their own band below everything.
export const layerOf = (c: Card) => c.z ?? (c.kind === "drawing" ? 0 : 1);
const bandOf = (c: Card) => (c.kind === "frame" ? "frame" : "card");
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function arrangeOps(board: Board, ids: ReadonlySet<string>, dir: Arrange): BoardOp[] {
  const ops: BoardOp[] = [];
  const index = new Map(board.cards.map((c, i) => [c.id, i]));
  // Equal layers stack by board order, so "above" means a higher layer, or the same layer later in the list.
  const above = (a: Card, b: Card) =>
    layerOf(a) > layerOf(b) || (layerOf(a) === layerOf(b) && (index.get(a.id) ?? 0) > (index.get(b.id) ?? 0));
  for (const band of ["frame", "card"]) {
    const picked = board.cards.filter((c) => ids.has(c.id) && bandOf(c) === band && !c.locked);
    const others = board.cards.filter((c) => !ids.has(c.id) && bandOf(c) === band);
    if (!picked.length || !others.length) continue;
    const ordered = [...picked].sort((a, b) => (above(a, b) ? 1 : -1));
    if (dir === "front") {
      const top = Math.max(...others.map(layerOf));
      for (const [i, c] of ordered.entries()) ops.push({ op: "patch", id: c.id, patch: { z: top + 1 + i } });
    } else if (dir === "back") {
      const bottom = Math.min(...others.map(layerOf));
      for (const [i, c] of ordered.entries()) ops.push({ op: "patch", id: c.id, patch: { z: bottom - ordered.length + i } });
    } else {
      for (const c of ordered) {
        const near = others.filter((o) => overlaps(o, c) && (dir === "forward" ? above(o, c) : above(c, o)));
        if (!near.length) continue;
        const z = dir === "forward" ? Math.min(...near.map(layerOf)) + 1 : Math.max(...near.map(layerOf)) - 1;
        ops.push({ op: "patch", id: c.id, patch: { z } });
      }
    }
  }
  return ops;
}

// Mirrors freehand strokes inside their own box; other kinds have nothing to flip.
export function flipOps(cards: Card[], axis: "x" | "y"): BoardOp[] {
  return cards
    .filter((c) => c.kind === "drawing" && c.points?.length && !c.locked)
    .map((c) => ({
      op: "patch",
      id: c.id,
      patch: { points: (c.points ?? []).map((v, i) => (i % 2 === (axis === "x" ? 0 : 1) ? (axis === "x" ? c.w : c.h) - v : v)) },
    }));
}

export function styleOf(cards: Card[]): CardStyle | null {
  const c = cards.find((card) => COLORED.has(card.kind));
  if (!c) return null;
  const style: CardStyle = {};
  if (c.color) style.color = c.color;
  if (c.shape) style.shape = c.shape;
  if (c.size) style.size = c.size;
  if (c.highlight !== undefined) style.highlight = c.highlight;
  return style;
}

// Applies only what each kind can wear: color to notes, shapes and ink; outline to shapes; width to ink.
export function styleOps(cards: Card[], style: CardStyle): BoardOp[] {
  const ops: BoardOp[] = [];
  for (const c of cards) {
    if (c.locked || !COLORED.has(c.kind)) continue;
    const patch: CardStyle = {};
    if (style.color && style.color !== c.color) patch.color = style.color;
    if (c.kind === "shape" && style.shape && style.shape !== c.shape) patch.shape = style.shape;
    if (c.kind === "drawing" && style.size !== undefined && style.size !== c.size) patch.size = style.size;
    if (c.kind === "drawing" && style.highlight !== undefined && style.highlight !== (c.highlight ?? false))
      patch.highlight = style.highlight;
    if (Object.keys(patch).length) ops.push({ op: "patch", id: c.id, patch });
  }
  return ops;
}

export const canColor = (cards: Card[]) => cards.some((c) => COLORED.has(c.kind) && !c.locked);

// Groups: cards sharing an id are picked and moved together. One level, so grouping again simply regroups.
export function groupOps(cards: Card[], id: string): BoardOp[] {
  if (cards.length < 2) return [];
  return cards.filter((c) => c.group !== id).map((c) => ({ op: "patch", id: c.id, patch: { group: id } }));
}

export function ungroupOps(cards: Card[]): BoardOp[] {
  return cards.filter((c) => c.group).map((c) => ({ op: "patch", id: c.id, patch: { group: undefined } }));
}

// A group is selected whenever any of its cards is, so clicks and box selections always take the whole group.
export function withGroups(ids: ReadonlySet<string>, cards: Card[]): Set<string> {
  const groups = new Set(cards.filter((c) => c.group && ids.has(c.id)).map((c) => c.group));
  const out = new Set(ids);
  if (groups.size) for (const c of cards) if (c.group && groups.has(c.group)) out.add(c.id);
  return out;
}

export interface Item extends Box {
  id: string;
}
export type Align = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Move = { id: string; x: number; y: number };

export function alignMoves(items: Item[], how: Align): Move[] {
  const b = bounds(items as unknown as Card[]);
  return items.map((it) => {
    if (how === "left") return { id: it.id, x: b.x, y: it.y };
    if (how === "center") return { id: it.id, x: b.x + (b.w - it.w) / 2, y: it.y };
    if (how === "right") return { id: it.id, x: b.x + b.w - it.w, y: it.y };
    if (how === "top") return { id: it.id, x: it.x, y: b.y };
    if (how === "middle") return { id: it.id, x: it.x, y: b.y + (b.h - it.h) / 2 };
    return { id: it.id, x: it.x, y: b.y + b.h - it.h };
  });
}

// Keeps the first and last in place and gives everything between them equal gaps.
export function distributeMoves(items: Item[], axis: "x" | "y"): Move[] {
  if (items.length < 3) return [];
  const size = (it: Item) => (axis === "x" ? it.w : it.h);
  const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
  const first = sorted[0] as Item;
  const last = sorted[sorted.length - 1] as Item;
  const span = last[axis] + size(last) - first[axis];
  const gap = (span - sorted.reduce((n, it) => n + size(it), 0)) / (sorted.length - 1);
  let at = first[axis];
  return sorted.map((it) => {
    const move = { id: it.id, x: axis === "x" ? at : it.x, y: axis === "y" ? at : it.y };
    at += size(it) + gap;
    return move;
  });
}

// Lays the items out in a near-square grid in reading order, starting where they already begin.
export function tidyMoves(items: Item[], gap = 24): Move[] {
  if (items.length < 2) return [];
  const b = bounds(items as unknown as Card[]);
  const cols = Math.ceil(Math.sqrt(items.length));
  const ordered = [...items].sort((a, c) => a.y - c.y || a.x - c.x);
  const colW = Array.from({ length: cols }, (_, j) => Math.max(...ordered.filter((_, i) => i % cols === j).map((it) => it.w)));
  const rows = Math.ceil(ordered.length / cols);
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...ordered.slice(r * cols, r * cols + cols).map((it) => it.h)));
  return ordered.map((it, i) => {
    const r = Math.floor(i / cols);
    const j = i % cols;
    const x = b.x + colW.slice(0, j).reduce((n, w) => n + w + gap, 0);
    const y = b.y + rowH.slice(0, r).reduce((n, h) => n + h + gap, 0);
    return { id: it.id, x, y };
  });
}

// Runs a layout over units instead of single items: a group moves as one box and its cards keep their places inside it.
export function moveUnits(items: Item[], groupOf: (id: string) => string | undefined, layout: (units: Item[]) => Move[]): Move[] {
  const units = new Map<string, Item[]>();
  for (const it of items) {
    const key = groupOf(it.id) ?? `#${it.id}`;
    units.set(key, [...(units.get(key) ?? []), it]);
  }
  const boxes = [...units].map(([key, members]) => ({ id: key, ...bounds(members as unknown as Card[]) }));
  const moves: Move[] = [];
  for (const m of layout(boxes)) {
    const box = boxes.find((u) => u.id === m.id) as Item;
    const dx = m.x - box.x;
    const dy = m.y - box.y;
    if (!dx && !dy) continue;
    for (const it of units.get(m.id) ?? []) moves.push({ id: it.id, x: it.x + dx, y: it.y + dy });
  }
  return moves;
}

// Everything that sits wholly inside a box, such as the cards and tasks on a frame.
export function inside(box: Box, items: Item[]): Item[] {
  return items.filter((it) => it.x >= box.x && it.y >= box.y && it.x + it.w <= box.x + box.w && it.y + it.h <= box.y + box.h);
}
