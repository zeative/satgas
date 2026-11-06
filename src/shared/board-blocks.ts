import { type Card, COLORS, type ColorName, DEFAULT_SIZE, parseDelimited, SHAPES, type ShapeKind } from "./board";
import { stripEdits } from "./board-edit";

// Agents put native board content in their reply as fenced blocks, so a table becomes a table card instead of a web page
// and a flow becomes stickies, shapes and connectors. The server turns blocks into cards; the chat shows the reply
// without them (the cards are linked there).
//
//   ```satgas:table Monthly sales        a markdown table (or CSV)
//   ```satgas:doc Launch plan            markdown
//   ```satgas:note                       a short note
//   ```satgas:code src/sum.ts            a code snippet; the title is its file name
//   ```satgas:board Signup flow          JSON: stickies, text, shapes, docs, tables, code and images, with connectors
export type BlockKind = "table" | "doc" | "note" | "code" | "board";
export interface Block {
  kind: BlockKind;
  title: string;
  body: string;
}

// Three or more backticks, closed by the same run, so a doc can hold its own ``` code fences inside a ```` block.
// A fence opens only at the start of a line, as in Markdown, so a sentence that mentions ````satgas:doc stays prose.
const BLOCK = /(?<=^|\n)[ \t]{0,3}(`{3,})satgas:(table|doc|note|code|board)[^\S\n]*([^\n]*)\n([\s\S]*?)\n?[ \t]{0,3}\1(?!`)/g;
export const MAX_BLOCKS = 12;
const MAX_ITEMS = 60;
const MAX_LINKS = 100;

export function splitBlocks(text: string): { reply: string; blocks: Block[] } {
  const blocks: Block[] = [];
  const reply = text
    .replace(BLOCK, (_, _fence: string, kind: BlockKind, title: string, body: string) => {
      if (blocks.length >= MAX_BLOCKS || !body.trim()) return "";
      // Words an agent wrote around a table inside its block belong to the chat, not to a cell.
      if (kind === "table") {
        const { rows, prose, table } = tableParts(body);
        if (rows.length) blocks.push({ kind, title: title.trim(), body: table });
        return prose ? `\n${prose}\n` : "";
      }
      // A test run or command output is not a result; it stays in the chat as plain code instead of becoming a card.
      if ((kind === "doc" || kind === "code") && isRunLog(body)) return `\n\`\`\`\n${body.replace(/\s+$/, "")}\n\`\`\`\n`;
      blocks.push({ kind, title: title.trim(), body: body.replace(/\s+$/, "") });
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { reply, blocks };
}

// Edit commands change the canvas and say nothing to a reader, so they leave the chat with the card blocks.
export const stripBlocks = (text: string) => splitBlocks(stripEdits(text)).reply;

// Marks of test runners and shells: two of them, without the headings of a written document, mean a pasted log.
const RUN_MARK =
  /\b\d+ (?:pass|passed|fail|failed|passing|failing)\b|Ran \d+ tests?|expect\(\) calls|\bTests?:\s+\d+|^\s*(?:PASS|FAIL)\s|bun test v\d|^\s*[$>] \S|exit code \d|\d+ (?:tests?|specs?) completed/gim;
export function isRunLog(body: string): boolean {
  return body.length < 8000 && !/^#{1,3}\s/m.test(body) && (body.match(RUN_MARK)?.length ?? 0) >= 2;
}

// GFM takes any run of dashes, so `:-:` and `:--:` (centred columns) count as the rule too.
const RULE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

// A markdown table is found by its `|---|` rule; the rows are the pipe lines around it, anything else is prose.
// Without a rule, pipe-led lines still make a table; only then is the body read as CSV/TSV.
export function tableParts(body: string): { rows: string[][]; prose: string; table: string } {
  const lines = body.split("\n");
  const rule = lines.findIndex((l) => RULE.test(l.trim()));
  if (rule < 1 || !lines[rule - 1]?.includes("|")) {
    const piped = lines.filter((l) => l.trim().startsWith("|"));
    if (piped.length >= 2)
      return {
        rows: piped.map(cells),
        prose: lines
          .filter((l) => !l.trim().startsWith("|"))
          .join("\n")
          .trim(),
        table: piped.join("\n"),
      };
    return { rows: parseDelimited(body.trim()), prose: "", table: body.trim() };
  }
  let start = rule - 1;
  while (start > 0 && lines[start - 1]?.includes("|") && lines[start - 1]?.trim()) start--;
  let end = rule + 1;
  while (end < lines.length && lines[end]?.includes("|") && lines[end]?.trim()) end++;
  const rows = [...lines.slice(start, rule), ...lines.slice(rule + 1, end)].map(cells);
  const prose = [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim();
  return { rows, prose, table: lines.slice(start, end).join("\n") };
}

export const tableRows = (body: string) => tableParts(body).rows;

// Sizes follow what the cards draw (notes: text-sm on 24px lines inside p-3; tables: text-xs cells), so nothing is cut.
const CHAR_SM = 7.4;
const CHAR_XS = 6.8;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// A sticky grows with its text instead of cutting it; a long one widens first so it stays a note, not a column.
export function noteSize(text: string, w = 200): { w: number; h: number } {
  const tall = (width: number) => 24 + linesOf(text, Math.floor((width - 24) / CHAR_SM)) * 24 + 8;
  const width = tall(w) > 240 ? Math.max(w, 280) : w;
  return { w: width, h: Math.round(clamp(tall(width), 120, 640)) };
}

// A sticky holds a thought, not a page: past what a wide one shows without cutting, the text becomes a doc card.
export const tooLongForNote = (text: string) => 24 + linesOf(text, Math.floor((280 - 24) / CHAR_SM)) * 24 + 8 > 640;
const docSize = (text: string) => ({ w: 400, h: Math.round(clamp(64 + linesOf(text) * 24, 160, 460)) });

// Columns as wide as their longest cell (within reason) and rows as tall as their longest wrapped cell.
export function tableSize(rows: string[][]): { w: number; h: number } {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const [head = []] = rows;
  const widths = Array.from({ length: cols }, (_, i) =>
    // Headers never wrap, so a column is at least as wide as its header.
    Math.max(
      clamp(Math.max(0, ...rows.slice(1).map((r) => (r[i] ?? "").length)) * CHAR_XS + 20, 64, 240),
      (head[i] ?? "").length * CHAR_XS + 24,
    ),
  );
  const rowH = (r: string[]) =>
    12 + Math.max(1, ...r.map((cell, i) => Math.ceil((cell.length * CHAR_XS) / Math.max(1, (widths[i] ?? 64) - 20)))) * 16;
  const w = clamp(
    widths.reduce((a, b) => a + b, 0),
    240,
    1200,
  );
  const h = clamp(rows.reduce((a, r) => a + rowH(r), 0) + 4, 96, 720);
  return { w: Math.round(w), h: Math.round(h) };
}

const LANG: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  py: "python",
  go: "go",
  rs: "rust",
  sh: "bash",
  sql: "sql",
};
const langOf = (name: string) => LANG[name.split(".").pop()?.toLowerCase() ?? ""];
const linesOf = (text: string, perLine = 48) => text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);

export type BlockCard = Omit<Card, "createdAt" | "from">;
// What one block becomes: an anchor card placed on the board, cards laid out relative to it, and connectors between them.
export interface Unit {
  anchor: BlockCard;
  children: BlockCard[];
  links: { source: string; target: string }[];
}

export function blockUnit(block: Block, idFor: (key: string) => string): Unit {
  if (block.kind === "board") return boardUnit(block, idFor);
  const id = idFor("card");
  const at = { id, x: 0, y: 0 };
  if (block.kind === "table") {
    const rows = tableRows(block.body);
    return single({ ...at, kind: "table", title: block.title || undefined, rows, ...tableSize(rows) });
  }
  if (block.kind === "note")
    return single(
      tooLongForNote(block.body)
        ? { ...at, kind: "doc", text: block.body, ...docSize(block.body) }
        : { ...at, kind: "note", text: plainNote(block.body), ...noteSize(plainNote(block.body), DEFAULT_SIZE.note.w) },
    );
  if (block.kind === "code") {
    const h = Math.min(420, Math.max(120, 56 + block.body.split("\n").length * 20));
    return single({ ...at, kind: "code", title: block.title || undefined, text: block.body, lang: langOf(block.title), w: 460, h });
  }
  const h = Math.min(460, Math.max(160, 64 + linesOf(block.body) * 24));
  return single({ ...at, kind: "doc", title: block.title || undefined, text: block.body, w: 400, h });
}

const single = (anchor: BlockCard): Unit => ({ anchor, children: [], links: [] });

type ItemKind = "note" | "text" | "shape" | "doc" | "table" | "code" | "image";
const ITEM_KINDS = new Set<ItemKind>(["note", "text", "shape", "doc", "table", "code", "image"]);
type Layout = "flow" | "mindmap" | "grid" | "kanban" | "free";
const LAYOUTS = new Set<Layout>(["flow", "mindmap", "grid", "kanban", "free"]);

interface Item {
  key: string;
  card: BlockCard;
  column: string;
  x?: number;
  y?: number;
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const color = (v: unknown) => (COLORS.includes(v as ColorName) ? (v as ColorName) : undefined);

// One item of a board block as a card, sized for its kind and content.
function itemCard(raw: Record<string, unknown>, id: string): BlockCard {
  const kind: ItemKind = ITEM_KINDS.has(raw.kind as ItemKind) ? (raw.kind as ItemKind) : "note";
  const text = str(raw.text);
  const title = str(raw.title) || undefined;
  // A label like "YES" on a branch stays as small as its word.
  if (kind === "text") return { id, x: 0, y: 0, kind, text, w: Math.min(480, Math.max(48, text.length * 11 + 16)), h: 56 };
  if (kind === "shape") {
    const shape = SHAPES.includes(raw.shape as ShapeKind) ? (raw.shape as ShapeKind) : "rect";
    return {
      id,
      x: 0,
      y: 0,
      kind,
      text,
      shape,
      color: color(raw.color) ?? "blue",
      w: shape === "diamond" ? 200 : 180,
      h: shape === "diamond" ? 120 : 96,
    };
  }
  if (kind === "doc") return { id, x: 0, y: 0, kind, title, text, w: 340, h: Math.min(360, Math.max(140, 56 + linesOf(text, 40) * 22)) };
  if (kind === "code")
    return {
      id,
      x: 0,
      y: 0,
      kind,
      title,
      text,
      lang: langOf(title ?? ""),
      w: 400,
      h: Math.min(360, Math.max(120, 56 + text.split("\n").length * 20)),
    };
  if (kind === "table") {
    const rows = Array.isArray(raw.rows)
      ? (raw.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map(str))
      : tableRows(str(raw.rows) || text);
    return { id, x: 0, y: 0, kind, title, rows, ...tableSize(rows) };
  }
  if (kind === "image") return { id, x: 0, y: 0, kind, title, src: str(raw.src), w: 320, h: 220 };
  if (tooLongForNote(text)) return { id, x: 0, y: 0, kind: "doc", title, text, ...docSize(text) };
  return {
    id,
    x: 0,
    y: 0,
    kind: "note",
    text: plainNote(text),
    color: color(raw.color) ?? "yellow",
    ...noteSize(plainNote(text)),
  };
}

// A sticky shows plain text, so markdown emphasis an agent adds would show as raw ** and # marks.
export function plainNote(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}

const PAD = 40;
const HEAD = 56;
const GAP_X = 96;
const GAP_Y = 32;

// A board block: JSON with a layout, items and links. Satgas places the items, draws the links, and frames the lot.
function boardUnit(block: Block, idFor: (key: string) => string): Unit {
  let spec: { layout?: unknown; columns?: unknown; items?: unknown; links?: unknown };
  try {
    spec = JSON.parse(block.body);
  } catch {
    // Unreadable JSON still reaches the board, as a doc showing what the agent wrote.
    return single({
      id: idFor("card"),
      x: 0,
      y: 0,
      kind: "doc",
      title: block.title || undefined,
      text: `\`\`\`json\n${block.body}\n\`\`\``,
      w: 400,
      h: 300,
    });
  }
  const rawItems = (Array.isArray(spec.items) ? spec.items : []).slice(0, MAX_ITEMS) as Record<string, unknown>[];
  const items: Item[] = rawItems
    .filter((r) => r && typeof r === "object")
    .map((r, i) => {
      const key = str(r.id) || `item-${i}`;
      return { key, card: itemCard(r, idFor(`item:${i}`)), column: str(r.column), x: Number(r.x), y: Number(r.y) };
    });
  const byKey = new Map(items.map((it) => [it.key, it]));
  const links = (Array.isArray(spec.links) ? spec.links : [])
    .slice(0, MAX_LINKS)
    .map((l) => (Array.isArray(l) ? [str(l[0]), str(l[1])] : [str(l?.from ?? l?.source), str(l?.to ?? l?.target)]))
    .filter(([a, b]) => a && b && a !== b && byKey.has(a) && byKey.has(b)) as [string, string][];

  const layout: Layout = LAYOUTS.has(spec.layout as Layout) ? (spec.layout as Layout) : links.length ? "flow" : "grid";
  const placed = arrange(items, links, layout, Number(spec.columns), idFor);
  // Whole pixels: a card at x.5 draws its text blurred at 100%.
  const w = Math.round(Math.max(320, ...placed.map((c) => c.x + c.w)) + PAD * 2);
  const h = Math.round(Math.max(120, ...placed.map((c) => c.y + c.h)) + PAD + HEAD);
  const frame: BlockCard = { id: idFor("frame"), x: 0, y: 0, kind: "frame", text: block.title || "Board", w, h };
  return {
    anchor: frame,
    children: placed.map((c) => ({ ...c, x: Math.round(c.x + PAD), y: Math.round(c.y + HEAD) })),
    links: links.map(([a, b]) => ({ source: byKey.get(a)?.card.id ?? "", target: byKey.get(b)?.card.id ?? "" })),
  };
}

// Positions relative to the frame's inner corner.
function arrange(items: Item[], links: [string, string][], layout: Layout, columns: number, idFor: (key: string) => string): BlockCard[] {
  if (layout === "free") {
    const xs = items.map((it) => (Number.isFinite(it.x) ? (it.x as number) : 0));
    const ys = items.map((it) => (Number.isFinite(it.y) ? (it.y as number) : 0));
    // Agents often draw on their own page coordinates (x 1600…); the frame starts where the drawing does.
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return unclash(items.map((it, i) => ({ ...it.card, x: (xs[i] ?? 0) - minX, y: (ys[i] ?? 0) - minY })));
  }
  if (layout === "kanban") {
    const order: string[] = [];
    for (const it of items) if (!order.includes(it.column || "")) order.push(it.column || "");
    const out: BlockCard[] = [];
    let x = 0;
    order.forEach((name, ci) => {
      const inCol = items.filter((it) => (it.column || "") === name);
      const colW = Math.max(220, ...inCol.map((it) => it.card.w));
      let y = 0;
      if (name) {
        out.push({ id: idFor(`column:${ci}`), x, y, kind: "text", text: name, w: colW, h: 48 });
        y += 48 + 16;
      }
      for (const it of inCol) {
        out.push({ ...it.card, x, y, w: colW });
        y += it.card.h + 16;
      }
      x += colW + GAP_Y;
    });
    return out;
  }
  if (layout === "grid") {
    const cols = Number.isInteger(columns) && columns > 0 ? columns : Math.ceil(Math.sqrt(items.length));
    const cellW = Math.max(0, ...items.map((it) => it.card.w));
    const out: BlockCard[] = [];
    let y = 0;
    for (let r = 0; r * cols < items.length; r++) {
      const row = items.slice(r * cols, r * cols + cols);
      for (const [c, it] of row.entries()) out.push({ ...it.card, x: c * (cellW + 24), y });
      y += Math.max(...row.map((it) => it.card.h)) + 24;
    }
    return out;
  }
  const tree = treeLayout(items, links, layout);
  if (tree) {
    const placed = items.map((it) => ({ ...it.card, ...(tree.get(it.key) ?? { x: 0, y: 0 }) }));
    return layout === "flow" ? wrapFlow(placed) : placed;
  }
  // A flow that merges or loops: columns by depth along the links, left to right; each column centred on the tallest.
  const depth = new Map(items.map((it) => [it.key, 0]));
  for (let pass = 0; pass < items.length; pass++) {
    let changed = false;
    for (const [a, b] of links) {
      const next = (depth.get(a) ?? 0) + 1;
      if (next > (depth.get(b) ?? 0) && next < items.length) {
        depth.set(b, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const levels: Item[][] = [];
  for (const it of items) {
    const d = depth.get(it.key) ?? 0;
    levels[d] = [...(levels[d] ?? []), it];
  }
  const heights = levels.map((col) => (col ?? []).reduce((n, it) => n + it.card.h, 0) + GAP_Y * Math.max(0, (col ?? []).length - 1));
  const tallest = Math.max(0, ...heights);
  const at = new Map<string, { x: number; y: number }>();
  let x = 0;
  for (const [i, col = []] of levels.entries()) {
    const colW = Math.max(0, ...col.map((it) => it.card.w));
    let y = (tallest - (heights[i] ?? 0)) / 2;
    for (const it of col) {
      at.set(it.key, { x: x + (colW - it.card.w) / 2, y });
      y += it.card.h + GAP_Y;
    }
    x += colW + GAP_X;
  }
  // Kept in the agent's order, which is also the stacking order.
  return wrapFlow(items.map((it) => ({ ...it.card, ...(at.get(it.key) ?? { x: 0, y: 0 }) })));
}

const FLOW_ROW = 6;

// A long chain read left to right runs off any screen, so a flow longer than six steps wraps into rows below, like
// text; a column is the cards sharing one centre, since every layout centres cards in their column.
function wrapFlow(cards: BlockCard[]): BlockCard[] {
  const centre = (c: BlockCard) => Math.round(c.x + c.w / 2);
  const columns = [...new Set(cards.map(centre))].sort((a, b) => a - b);
  if (columns.length <= FLOW_ROW) return cards;
  const index = new Map(columns.map((x, i) => [x, i]));
  const slotW = Array.from({ length: FLOW_ROW }, () => 0);
  for (const c of cards) {
    const k = (index.get(centre(c)) ?? 0) % FLOW_ROW;
    slotW[k] = Math.max(slotW[k] ?? 0, c.w);
  }
  const slotX = slotW.map((_, k) => slotW.slice(0, k).reduce((n, w) => n + w + GAP_X, 0));
  const top = Math.min(...cards.map((c) => c.y));
  const band = Math.max(...cards.map((c) => c.y + c.h)) - top;
  return cards.map((c) => {
    const i = index.get(centre(c)) ?? 0;
    const k = i % FLOW_ROW;
    return { ...c, x: (slotX[k] ?? 0) + ((slotW[k] ?? 0) - c.w) / 2, y: c.y + Math.floor(i / FLOW_ROW) * (band + GAP_Y * 3) };
  });
}

const FREE_GAP = 24;
const MAX_SPREAD = 4;

// Short text sitting on a branch ("YES", "No stock") is a label: it follows the shapes rather than spacing them out.
const isLabel = (c: BlockCard) => c.kind === "text" && (c.text ?? "").length <= 16;

// Agents place free items for the sizes they imagine, and cards here are often bigger: the shapes are spread evenly until
// no two touch, keeping the drawing's shape; labels and anything still colliding then move down below what they hit.
function unclash(cards: BlockCard[]): BlockCard[] {
  const solid = cards.filter((c) => !isLabel(c));
  let spread = 1;
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i] as BlockCard;
      const b = solid[j] as BlockCard;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const needX = dx ? ((a.x < b.x ? a.w : b.w) + FREE_GAP) / dx : Number.POSITIVE_INFINITY;
      const needY = dy ? ((a.y < b.y ? a.h : b.h) + FREE_GAP) / dy : Number.POSITIVE_INFINITY;
      spread = Math.max(spread, Math.min(needX, needY));
    }
  spread = Math.min(spread, MAX_SPREAD);
  const placed = new Map<BlockCard, BlockCard>();
  // Shapes claim their spots first, so a label never pushes a shape away.
  for (const c of [...solid, ...cards.filter(isLabel)]) {
    const card = { ...c, x: Math.round(c.x * spread), y: Math.round(c.y * spread) };
    const taken = [...placed.values()];
    for (let hit = taken.find((o) => touches(o, card)); hit; hit = taken.find((o) => touches(o, card))) card.y = hit.y + hit.h + FREE_GAP;
    placed.set(c, card);
  }
  return cards.map((c) => placed.get(c) ?? c);
}

const touches = (a: BlockCard, b: BlockCard) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A tidy tree: every parent sits centred on its own children, so threads never cross. A mind map grows both ways from
// its centre like Miro's; a flow only takes this shape when it never merges (each card has one way in).
function treeLayout(items: Item[], links: [string, string][], layout: Layout): Map<string, { x: number; y: number }> | null {
  const parent = new Map<string, string>();
  for (const [a, b] of links) if (!parent.has(b)) parent.set(b, a);
  if (layout === "flow" && links.some(([a, b]) => parent.get(b) !== a)) return null;
  const kids = new Map<string, Item[]>();
  for (const it of items) {
    const p = parent.get(it.key);
    if (p) kids.set(p, [...(kids.get(p) ?? []), it]);
  }
  const roots = items.filter((it) => !parent.has(it.key));
  const depth = new Map<string, number>();
  const walk = (it: Item, d: number) => {
    depth.set(it.key, d);
    for (const k of kids.get(it.key) ?? []) walk(k, d + 1);
  };
  for (const r of roots) walk(r, 0);
  // A loop leaves cards no root reaches.
  if (depth.size < items.length) return null;

  const colW: number[] = [];
  for (const it of items) {
    const d = depth.get(it.key) ?? 0;
    colW[d] = Math.max(colW[d] ?? 0, it.card.w);
  }
  const right = (d: number) => colW.slice(0, d).reduce((n, w) => n + (w ?? 0) + GAP_X, 0);
  const left = (d: number) => -colW.slice(1, d + 1).reduce((n, w) => n + (w ?? 0) + GAP_X, 0);
  const span = new Map<string, number>();
  const stack = (list: Item[]) => list.reduce((n, k) => n + (span.get(k.key) ?? 0), 0) + GAP_Y * Math.max(0, list.length - 1);
  const measure = (it: Item): number => {
    const list = kids.get(it.key) ?? [];
    for (const k of list) measure(k);
    const s = Math.max(it.card.h, stack(list));
    span.set(it.key, s);
    return s;
  };
  for (const r of roots) measure(r);

  const at = new Map<string, { x: number; y: number }>();
  const put = (it: Item, d: number, x: number, y: number) => at.set(it.key, { x: x + ((colW[d] ?? 0) - it.card.w) / 2, y });
  const placeKids = (list: Item[], d: number, top: number, side: 1 | -1) => {
    let y = top;
    for (const k of list) {
      place(k, d, y, side);
      y += (span.get(k.key) ?? 0) + GAP_Y;
    }
  };
  const place = (it: Item, d: number, top: number, side: 1 | -1) => {
    const s = span.get(it.key) ?? 0;
    put(it, d, side === 1 ? right(d) : left(d), top + (s - it.card.h) / 2);
    const list = kids.get(it.key) ?? [];
    placeKids(list, d + 1, top + (s - stack(list)) / 2, side);
  };

  // The centre is the root with the biggest tree; loose notes an agent left unlinked are other roots and go underneath.
  const size = (it: Item): number => 1 + (kids.get(it.key) ?? []).reduce((n, k) => n + size(k), 0);
  const root = roots.reduce<Item | undefined>((best, r) => (!best || size(r) > size(best) ? r : best), undefined);
  const branches = root ? (kids.get(root.key) ?? []) : [];
  if (layout === "mindmap" && root && branches.length > 1) {
    // Split the branches, in order, where the two sides come out closest in height.
    let cut = 1;
    for (let k = 1; k < branches.length; k++)
      if (
        Math.abs(stack(branches.slice(0, k)) - stack(branches.slice(k))) <
        Math.abs(stack(branches.slice(0, cut)) - stack(branches.slice(cut)))
      )
        cut = k;
    const east = branches.slice(0, cut);
    const west = branches.slice(cut);
    const band = Math.max(root.card.h, stack(east), stack(west));
    put(root, 0, 0, (band - root.card.h) / 2);
    placeKids(east, 1, (band - stack(east)) / 2, 1);
    placeKids(west, 1, (band - stack(west)) / 2, -1);
    let top = band + GAP_Y * 2;
    for (const r of roots) {
      if (r === root) continue;
      place(r, 0, top, 1);
      top += (span.get(r.key) ?? 0) + GAP_Y;
    }
  } else {
    let top = 0;
    for (const r of roots) {
      place(r, 0, top, 1);
      top += (span.get(r.key) ?? 0) + GAP_Y * 2;
    }
  }
  const minX = Math.min(...[...at.values()].map((p) => p.x));
  const minY = Math.min(...[...at.values()].map((p) => p.y));
  for (const p of at.values()) {
    p.x -= minX;
    p.y -= minY;
  }
  return at;
}

// Cards an agent laid out inside its own board frame: the frame stands for them on the board's origin threads and in
// the chat's list of what was made.
export function insideOwnFrame(card: Pick<Card, "id" | "kind" | "from" | "x" | "y" | "w" | "h">, cards: Card[]): boolean {
  if (!card.from || card.kind === "frame") return false;
  return cards.some(
    (f) =>
      f.kind === "frame" &&
      f.from === card.from &&
      f.id !== card.id &&
      card.x >= f.x &&
      card.y >= f.y &&
      card.x + card.w <= f.x + f.w &&
      card.y + card.h <= f.y + f.h,
  );
}
