import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { type Card, cardKindForFile, DEFAULT_SIZE, type FileChange, LIMITS, parseDelimited } from "../shared/board";
import { NODE_H, NODE_W, sinks } from "../shared/graph";
import type { NodeState, Run } from "../shared/types";

const MAX_RICH_CARDS = 6;
const MAX_TEXT_BYTES = 200_000;
const MAX_SHEET_BYTES = 1_000_000;
const SHELF_GAP = 40;
const SHELF_TOP = 96;
const SHELF_MAX_WIDTH = 1400;

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

// Paths inside the working folder, relative to it; anything an agent wrote elsewhere stays off the board.
// Agents report real paths, so a folder reached through a symlink (macOS /tmp is one) is compared both ways.
export function relativeInside(cwd: string, path: string): string | null {
  const roots = [resolve(cwd), real(resolve(cwd))];
  const fulls = [resolve(cwd, path), real(resolve(cwd, path))];
  for (const root of roots) {
    for (const full of fulls) {
      if (full !== root && full.startsWith(root + sep)) return relative(root, full).split(sep).join("/");
    }
  }
  return null;
}

// Card ids must stay under 64 characters and unique per file, so long paths are hashed instead of cut.
function pathHash(path: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

// Cards made here skip sanitizeOps, so they are clipped to the same limits; otherwise undoing a deletion is refused.
function fit<T extends Partial<Card>>(card: T): T {
  const out = { ...card };
  if (out.title !== undefined) out.title = out.title.slice(0, LIMITS.str);
  if (out.text !== undefined) out.text = out.text.slice(0, LIMITS.text);
  if (out.rows) out.rows = out.rows.map((r) => r.map((c) => c.slice(0, LIMITS.cell)));
  if (out.files) out.files = out.files.slice(0, LIMITS.files).map((f) => ({ ...f, path: f.path.slice(0, LIMITS.str) }));
  return out;
}

const fileUrl = (runId: string, rel: string) => `/api/runs/${runId}/files/${rel.split("/").map(encodeURIComponent).join("/")}`;

async function readCapped(path: string, max: number): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size > max) return null;
  return file.text();
}

// Turns what a task wrote into cards: images, pages, sheets and docs get their own card, the rest a file list.
export async function cardsForTask(
  run: Run,
  node: NodeState,
  written: Map<string, FileChange["change"]>,
): Promise<Omit<Card, "x" | "y">[]> {
  const files: FileChange[] = [];
  for (const [path, change] of written) {
    const rel = relativeInside(run.cwd, path);
    if (rel) files.push({ path: rel, change });
  }
  const base = { from: node.id, createdAt: Date.now() };
  const rich: Omit<Card, "x" | "y">[] = [];
  const plain: FileChange[] = [];

  for (const f of files) {
    const kind = f.change === "deleted" ? null : cardKindForFile(f.path);
    if (!kind || rich.length >= MAX_RICH_CARDS) {
      plain.push(f);
      continue;
    }
    const id = `${node.id.slice(0, 40)}:${pathHash(f.path)}`;
    const full = resolve(run.cwd, f.path);
    if (kind === "image" || kind === "preview") {
      const src = fileUrl(run.id, f.path);
      // A link cut to fit would point nowhere, so such a file is only listed.
      if (src.length > LIMITS.str) plain.push(f);
      else rich.push({ ...base, id, kind, title: f.path, src, ...DEFAULT_SIZE[kind] });
    } else if (kind === "table") {
      const text = await readCapped(full, MAX_SHEET_BYTES);
      if (text === null) plain.push(f);
      else rich.push({ ...base, id, kind, title: f.path, rows: parseDelimited(text), ...DEFAULT_SIZE.table });
    } else {
      const text = await readCapped(full, MAX_TEXT_BYTES);
      if (text === null) plain.push(f);
      else rich.push({ ...base, id, kind, title: f.path, text, ...DEFAULT_SIZE.doc });
    }
  }

  if (plain.length) {
    const h = Math.min(320, 56 + plain.length * 20);
    // A long task id is cut and hashed like the file cards', so the id stays within the limit and unique.
    const id = `${node.id}:files`.length <= LIMITS.id ? `${node.id}:files` : `${node.id.slice(0, 40)}:${pathHash(node.id)}:files`;
    rich.push({ ...base, id, kind: "files", title: node.title, files: plain, w: DEFAULT_SIZE.files.w, h });
  }
  return rich.map(fit);
}

// Task positions as people left them: dragged tasks count where they are now, not where the planner put them.
export function withMoves(run: Run): NodeState[] {
  const moved = run.board?.moved ?? {};
  return run.nodes.map((n) => (moved[n.id] ? { ...n, ...moved[n.id] } : n));
}

function graphBounds(nodes: NodeState[]) {
  if (!nodes.length) return { left: 0, right: NODE_W, top: 0, bottom: NODE_H };
  return {
    left: Math.min(...nodes.map((n) => n.x)),
    right: Math.max(...nodes.map((n) => n.x + NODE_W)),
    top: Math.min(...nodes.map((n) => n.y)),
    bottom: Math.max(...nodes.map((n) => n.y + NODE_H)),
  };
}

// Agent cards fill a shelf under their round's graph, left to right, wrapping into new rows, so they never cover the tasks.
export function placeOnShelf(run: Run, cards: Omit<Card, "x" | "y">[], round = 0): Card[] {
  const nodes = withMoves(run);
  const roundNodes = nodes.filter((n) => (n.round ?? 0) === round);
  const g = graphBounds(roundNodes.length ? roundNodes : nodes);
  const ids = new Set(roundNodes.map((n) => n.id));
  const placed = (run.board?.cards ?? []).filter((c) => c.from && ids.has(c.from) && c.y >= g.bottom);
  const out: Card[] = [];
  let last = placed.at(-1);
  let rowTop = last?.y ?? g.bottom + SHELF_TOP;
  let rowBottom = Math.max(rowTop, ...placed.filter((c) => c.y === rowTop).map((c) => c.y + c.h));
  for (const c of cards) {
    let x = last ? last.x + last.w + SHELF_GAP : g.left;
    if (x + c.w > g.left + Math.max(SHELF_MAX_WIDTH, g.right - g.left)) {
      x = g.left;
      rowTop = rowBottom + SHELF_GAP + 24;
    }
    const card = { ...c, x, y: rowTop } as Card;
    rowBottom = Math.max(rowBottom, card.y + card.h);
    out.push(card);
    last = card;
  }
  return out;
}

// A round's answer, at the end of its route.
export function finalReportCard(roundNodes: NodeState[], title: string, round = 0): Card | null {
  const ends = sinks(roundNodes).filter((n) => n.output?.trim());
  if (!ends.length) return null;
  const g = graphBounds(roundNodes);
  const text = ends.map((n) => n.output?.trim()).join("\n\n---\n\n");
  const w = 400;
  // Roughly 48 characters per line at this width; long reports scroll inside the card.
  const lines = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 48)), 0);
  const h = Math.min(420, Math.max(140, 48 + lines * 24));
  return fit({
    id: round === 0 ? "final-report" : `final-report-${round}`,
    kind: "doc",
    title,
    from: ends[0]?.id,
    text,
    x: g.right + 120,
    y: (g.top + g.bottom) / 2 - h / 2,
    w,
    h,
    createdAt: Date.now(),
  });
}
