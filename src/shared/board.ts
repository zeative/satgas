// The board: free-form cards and connectors laid over a mission's task graph. Shared by server and client.

export type CardKind = "note" | "doc" | "table" | "image" | "preview" | "code" | "files" | "drawing" | "text" | "shape" | "frame";
export type ShapeKind = "rect" | "ellipse" | "diamond" | "triangle";
// Named, not hex, so each color can be drawn right for light and dark themes.
export const COLORS = ["yellow", "orange", "pink", "purple", "blue", "green", "gray", "ink"] as const;
export type ColorName = (typeof COLORS)[number];
export const SHAPES: ShapeKind[] = ["rect", "ellipse", "diamond", "triangle"];

export interface FileChange {
  path: string;
  change: "added" | "modified" | "deleted";
}

export interface Card {
  id: string;
  kind: CardKind;
  x: number;
  y: number;
  w: number;
  h: number;
  // The task that produced it; absent for cards a person made.
  from?: string;
  title?: string;
  // note and doc (markdown), code
  text?: string;
  lang?: string;
  // table: the first row is the header
  rows?: string[][];
  // image and preview
  src?: string;
  files?: FileChange[];
  // drawing: flat [x, y, x, y, …] relative to the card's top-left corner
  points?: number[];
  // note background, shape fill, drawing ink
  color?: ColorName;
  shape?: ShapeKind;
  // drawing: stroke width, and whether it is a translucent highlighter stroke
  size?: number;
  highlight?: boolean;
  // A locked card cannot be moved, resized, edited or deleted until it is unlocked.
  locked?: boolean;
  // Stacking order within its layer; frames always sit under everything else.
  z?: number;
  // Cards sharing a group id are selected and moved as one.
  group?: string;
  createdAt: number;
}

export interface Connector {
  id: string;
  source: string;
  target: string;
}

export interface Board {
  cards: Card[];
  links: Connector[];
  // Task nodes a person dragged away from the planner's layout.
  moved: Record<string, { x: number; y: number }>;
}

export type BoardOp =
  | { op: "put"; card: Card }
  | { op: "patch"; id: string; patch: Partial<Omit<Card, "id" | "kind">> }
  | { op: "delete"; id: string }
  | { op: "link"; link: Connector }
  | { op: "move"; id: string; x: number; y: number }
  // Puts a task node back where the planner laid it out.
  | { op: "unmove"; id: string };

export const emptyBoard = (): Board => ({ cards: [], links: [], moved: {} });

// A patch value of undefined (in memory) or null (over the wire) removes the field.
function patched(card: Card, patch: Record<string, unknown>): Card {
  const next: Record<string, unknown> = { ...card, ...patch };
  for (const k in patch) if (patch[k] == null) delete next[k];
  return next as unknown as Card;
}

// JSON drops undefined, so a field a patch removes travels as null; applyOps and sanitizeOps read it back as removal.
export function toWire(ops: BoardOp[]): BoardOp[] {
  return ops.map((o) =>
    o.op === "patch" ? { ...o, patch: Object.fromEntries(Object.entries(o.patch).map(([k, v]) => [k, v === undefined ? null : v])) } : o,
  );
}

export const DEFAULT_SIZE: Record<CardKind, { w: number; h: number }> = {
  note: { w: 220, h: 160 },
  doc: { w: 380, h: 300 },
  table: { w: 420, h: 260 },
  image: { w: 320, h: 220 },
  preview: { w: 480, h: 340 },
  code: { w: 420, h: 260 },
  files: { w: 300, h: 200 },
  drawing: { w: 100, h: 100 },
  text: { w: 260, h: 56 },
  shape: { w: 180, h: 120 },
  frame: { w: 720, h: 460 },
};

// Pure and immutable, so the client can apply optimistically and the server can apply the same ops.
export function applyOps(board: Board, ops: BoardOp[]): Board {
  let { cards, links, moved } = board;
  for (const o of ops) {
    if (o.op === "put") {
      const i = cards.findIndex((c) => c.id === o.card.id);
      cards = i < 0 ? [...cards, o.card] : cards.map((c, j) => (j === i ? o.card : c));
    } else if (o.op === "patch") {
      cards = cards.map((c) => (c.id === o.id ? patched(c, o.patch) : c));
    } else if (o.op === "delete") {
      cards = cards.filter((c) => c.id !== o.id);
      links = links.filter((l) => l.id !== o.id && l.source !== o.id && l.target !== o.id);
    } else if (o.op === "link") {
      links = [...links.filter((l) => l.id !== o.link.id), o.link];
    } else if (o.op === "move") {
      moved = { ...moved, [o.id]: { x: o.x, y: o.y } };
    } else if (o.op === "unmove") {
      const { [o.id]: _, ...rest } = moved;
      moved = rest;
    }
  }
  return { cards, links, moved };
}

// The ops that undo `ops` when applied to the result; computed against the board before `ops` ran.
export function inverseOps(board: Board, ops: BoardOp[]): BoardOp[] {
  const inverse: BoardOp[] = [];
  let state = board;
  for (const o of ops) {
    if (o.op === "put") {
      const prev = state.cards.find((c) => c.id === o.card.id);
      inverse.unshift(prev ? { op: "put", card: prev } : { op: "delete", id: o.card.id });
    } else if (o.op === "patch") {
      const prev = state.cards.find((c) => c.id === o.id);
      if (prev) {
        const back = Object.fromEntries(Object.keys(o.patch).map((k) => [k, prev[k as keyof Card]]));
        inverse.unshift({ op: "patch", id: o.id, patch: back });
      }
    } else if (o.op === "delete") {
      const card = state.cards.find((c) => c.id === o.id);
      const attached = state.links.filter((l) => l.id === o.id || l.source === o.id || l.target === o.id);
      inverse.unshift(...(card ? [{ op: "put", card } as BoardOp] : []), ...attached.map((link) => ({ op: "link", link }) as BoardOp));
    } else if (o.op === "link") {
      const prev = state.links.find((l) => l.id === o.link.id);
      inverse.unshift(prev ? { op: "link", link: prev } : { op: "delete", id: o.link.id });
    } else if (o.op === "move" || o.op === "unmove") {
      // A task never moved before has no stored position; undoing its first move hands it back to the layout.
      const prev = state.moved[o.id];
      if (prev) inverse.unshift({ op: "move", id: o.id, ...prev });
      else if (o.op === "move") inverse.unshift({ op: "unmove", id: o.id });
    }
    state = applyOps(state, [o]);
  }
  return inverse;
}

const KINDS = new Set<CardKind>(["note", "doc", "table", "image", "preview", "code", "files", "drawing", "text", "shape", "frame"]);
// Server-made cards are held to these too, or undoing their deletion would be refused.
export const LIMITS = { id: 64, text: 200_000, cells: 20_000, cell: 2_000, points: 40_000, files: 500, str: 2_000 };

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown, max: number = LIMITS.str) => typeof v === "string" && v.length <= max;

// Fields a patch may remove by sending null; position and size always stay.
const REMOVABLE = [
  "from",
  "title",
  "lang",
  "src",
  "text",
  "rows",
  "files",
  "points",
  "color",
  "shape",
  "size",
  "highlight",
  "locked",
  "z",
  "group",
] as const;

function cleanCardFields(input: Record<string, unknown>): Partial<Card> | null {
  const out: Partial<Card> = {};
  const raw = { ...input };
  const removed = REMOVABLE.filter((k) => raw[k] === null);
  for (const k of removed) delete raw[k];
  for (const k of ["x", "y", "w", "h", "createdAt"] as const) {
    if (raw[k] === undefined) continue;
    if (!num(raw[k])) return null;
    out[k] = raw[k] as number;
  }
  for (const k of ["from", "title", "lang", "src", "group"] as const) {
    if (raw[k] === undefined) continue;
    if (!str(raw[k])) return null;
    out[k] = raw[k] as string;
  }
  if (raw.color !== undefined) {
    if (!COLORS.includes(raw.color as ColorName)) return null;
    out.color = raw.color as ColorName;
  }
  if (raw.shape !== undefined) {
    if (!SHAPES.includes(raw.shape as ShapeKind)) return null;
    out.shape = raw.shape as ShapeKind;
  }
  if (raw.size !== undefined) {
    if (!num(raw.size) || (raw.size as number) < 1 || (raw.size as number) > 48) return null;
    out.size = raw.size as number;
  }
  for (const k of ["highlight", "locked"] as const) {
    if (raw[k] === undefined) continue;
    if (typeof raw[k] !== "boolean") return null;
    out[k] = raw[k] as boolean;
  }
  if (raw.z !== undefined) {
    if (!num(raw.z) || Math.abs(raw.z as number) > 1_000_000) return null;
    out.z = raw.z as number;
  }
  if (raw.text !== undefined) {
    if (!str(raw.text, LIMITS.text)) return null;
    out.text = raw.text as string;
  }
  if (raw.rows !== undefined) {
    const rows = raw.rows;
    if (!Array.isArray(rows) || rows.reduce((n: number, r) => n + (Array.isArray(r) ? r.length : Infinity), 0) > LIMITS.cells) return null;
    if (!rows.every((r) => Array.isArray(r) && r.every((c) => str(c, LIMITS.cell)))) return null;
    out.rows = rows as string[][];
  }
  if (raw.points !== undefined) {
    const p = raw.points;
    if (!Array.isArray(p) || p.length > LIMITS.points || !p.every(num)) return null;
    out.points = p as number[];
  }
  if (raw.files !== undefined) {
    const f = raw.files;
    const ok = (x: unknown) => {
      const v = x as FileChange;
      return !!v && str(v.path) && (v.change === "added" || v.change === "modified" || v.change === "deleted");
    };
    if (!Array.isArray(f) || f.length > LIMITS.files || !f.every(ok)) return null;
    out.files = f as FileChange[];
  }
  for (const k of removed) out[k] = undefined;
  return out;
}

// Ops arrive from the browser, so every field is checked and bounded before it can reach disk.
export function sanitizeOps(input: unknown): BoardOp[] | null {
  if (!Array.isArray(input) || input.length > 500) return null;
  const ops: BoardOp[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.op === "put") {
      const c = raw.card as Record<string, unknown>;
      if (!c || !str(c.id, LIMITS.id) || !KINDS.has(c.kind as CardKind)) return null;
      const fields = cleanCardFields(c);
      if (!fields || [fields.x, fields.y, fields.w, fields.h].some((v) => v === undefined)) return null;
      ops.push({ op: "put", card: { createdAt: Date.now(), ...fields, id: c.id as string, kind: c.kind as CardKind } as Card });
    } else if (raw.op === "patch") {
      if (!str(raw.id, LIMITS.id) || !raw.patch || typeof raw.patch !== "object") return null;
      const patch = cleanCardFields(raw.patch as Record<string, unknown>);
      if (!patch) return null;
      ops.push({ op: "patch", id: raw.id as string, patch });
    } else if (raw.op === "delete") {
      if (!str(raw.id, LIMITS.id)) return null;
      ops.push({ op: "delete", id: raw.id as string });
    } else if (raw.op === "link") {
      const l = raw.link as Record<string, unknown>;
      if (!l || !str(l.id, LIMITS.id) || !str(l.source, LIMITS.id) || !str(l.target, LIMITS.id)) return null;
      ops.push({ op: "link", link: { id: l.id as string, source: l.source as string, target: l.target as string } });
    } else if (raw.op === "move") {
      if (!str(raw.id, LIMITS.id) || !num(raw.x) || !num(raw.y)) return null;
      ops.push({ op: "move", id: raw.id as string, x: raw.x as number, y: raw.y as number });
    } else if (raw.op === "unmove") {
      if (!str(raw.id, LIMITS.id)) return null;
      ops.push({ op: "unmove", id: raw.id as string });
    } else {
      return null;
    }
  }
  return ops;
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const PAGE = /\.html?$/i;
const SHEET = /\.(csv|tsv)$/i;
const MARKDOWN = /\.(md|mdx|markdown)$/i;

// Which card a file deserves on the board when an agent writes it; null when it only belongs in the file list.
export function cardKindForFile(path: string): "image" | "preview" | "table" | "doc" | null {
  if (IMAGE.test(path)) return "image";
  if (PAGE.test(path)) return "preview";
  if (SHEET.test(path)) return "table";
  if (MARKDOWN.test(path)) return "doc";
  return null;
}

// Minimal CSV/TSV reader: quoted fields, escaped quotes and newlines inside quotes.
export function parseDelimited(text: string, maxRows = 200, maxCols = 30): string[][] {
  const delim = text.split("\n", 1)[0]?.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c !== "")) rows.push(row.slice(0, maxCols));
      row = [];
      field = "";
    } else field += ch;
  }
  if ((field || row.length) && rows.length < maxRows) {
    row.push(field);
    rows.push(row.slice(0, maxCols));
  }
  return rows;
}
