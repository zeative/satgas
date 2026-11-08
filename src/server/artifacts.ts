import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { type BoardOp, type Card, cardKindForFile, DEFAULT_SIZE, type FileChange, LIMITS, parseDelimited } from "../shared/board";
import { type BlockCard, blockUnit, splitBlocks, type Unit } from "../shared/board-blocks";
import { imageCardSize, imageSize } from "../shared/image-size";
import type { NodeState, Run } from "../shared/types";
import { docxMarkdown, pptxMarkdown, xlsxRows } from "./office";

// Where cards land is shared with the board, which draws the spot a running task's work is heading for.
export { placeInFlow, placeOnShelf, withinFrame } from "../shared/placement";

const MAX_RICH_CARDS = 6;
const MAX_TEXT_BYTES = 200_000;
const MAX_SHEET_BYTES = 1_000_000;

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

const MAX_OFFICE_BYTES = 30 * 1024 * 1024;
async function readBytes(path: string, max: number): Promise<Uint8Array | null> {
  try {
    const f = Bun.file(path);
    if (f.size > max) return null;
    return new Uint8Array(await f.arrayBuffer());
  } catch {
    return null;
  }
}

// A picture's card takes the picture's proportions from its file header, so it never shows letterboxed.
async function pictureSize(path: string): Promise<{ w: number; h: number }> {
  try {
    const head = new Uint8Array(await Bun.file(path).slice(0, 65536).arrayBuffer());
    return imageCardSize(imageSize(head)) ?? DEFAULT_SIZE.image;
  } catch {
    return DEFAULT_SIZE.image;
  }
}

// What a page is made of (icons, fonts, textures, vendored code, reference and review shots, QA screenshots, the source
// ledger) is material, not a result: it stays in the file list and off the canvas, which it would only clutter.
const MATERIAL =
  /(^|\/)(assets|public|vendor|static|node_modules|dist|build|screenshots|\.hallmark)\/|(^|\/)design\/(refs|review)\/|(^|\/)design\/sources\.md$/;
export const isMaterial = (path: string) => MATERIAL.test(path);

export const bundlerEntry = (html: string) => /<script\b[^>]*\bsrc=["'][^"']+\.(?:jsx|tsx|ts|vue|svelte)(?:\?[^"']*)?["']/i.test(html);

// Turns what a task wrote into cards: images, pages, sheets and docs get their own card. The rest stays off the canvas;
// the task's `changes` lists every file, and the Changes tab shows them with their diffs.
export async function cardsForTask(
  run: Run,
  node: NodeState,
  written: Map<string, FileChange["change"]>,
): Promise<Omit<Card, "x" | "y">[]> {
  const files: FileChange[] = [];
  const seen = new Set<string>();
  for (const [path, change] of written) {
    // One file can arrive under two spellings (/tmp and /private/tmp on macOS); the first report wins.
    const rel = relativeInside(run.cwd, path);
    if (rel && !seen.has(rel)) {
      seen.add(rel);
      files.push({ path: rel, change });
    }
  }
  const base = { from: node.id, createdAt: Date.now() };
  const rich: Omit<Card, "x" | "y">[] = [];

  for (const f of files) {
    const kind = f.change === "deleted" || isMaterial(f.path) ? null : cardKindForFile(f.path);
    if (!kind || rich.length >= MAX_RICH_CARDS) continue;
    const id = `${node.id.slice(0, 40)}:${pathHash(f.path)}`;
    const full = resolve(run.cwd, f.path);
    if (kind === "image" || kind === "preview") {
      // A bundler's entry page (Vite and the like) loads source files no browser runs, so its preview would stay blank;
      // the app shows through its own card from app_start instead.
      if (kind === "preview" && /\.html?$/i.test(f.path) && bundlerEntry((await readCapped(full, MAX_TEXT_BYTES)) ?? "")) continue;
      const src = fileUrl(run.id, f.path);
      // A link cut to fit would point nowhere, so such a file gets no card.
      if (src.length <= LIMITS.str)
        rich.push({ ...base, id, kind, title: f.path, src, ...(kind === "image" ? await pictureSize(full) : DEFAULT_SIZE[kind]) });
    } else if (/\.(xlsx|docx|pptx)$/i.test(f.path)) {
      // An Office file shows what it holds and keeps a link to itself, so the original downloads as it is.
      const bytes = await readBytes(full, MAX_OFFICE_BYTES);
      const src = fileUrl(run.id, f.path);
      if (kind === "table") {
        const rows = bytes && xlsxRows(bytes);
        if (rows) rich.push({ ...base, id, kind, title: f.path, rows, src, ...DEFAULT_SIZE.table });
      } else {
        const text = bytes && (/\.pptx$/i.test(f.path) ? pptxMarkdown(bytes) : docxMarkdown(bytes));
        if (text) rich.push({ ...base, id, kind: "doc", title: f.path, text, src, ...DEFAULT_SIZE.doc });
      }
    } else if (kind === "table") {
      const text = await readCapped(full, MAX_SHEET_BYTES);
      if (text !== null)
        rich.push({ ...base, id, kind, title: f.path, rows: parseDelimited(text), src: fileUrl(run.id, f.path), ...DEFAULT_SIZE.table });
    } else {
      const text = await readCapped(full, MAX_TEXT_BYTES);
      if (text !== null) rich.push({ ...base, id, kind, title: f.path, text, src: fileUrl(run.id, f.path), ...DEFAULT_SIZE.doc });
    }
  }

  return rich.map(fit);
}

// A file another task already showed keeps its one card, brought up to date (a page reloads), instead of a second card.
export function reuseFileCards(
  run: Run,
  cards: Omit<Card, "x" | "y">[],
  now = Date.now(),
): { fresh: Omit<Card, "x" | "y">[]; ops: BoardOp[] } {
  const ops: BoardOp[] = [];
  const fresh = cards.filter((card) => {
    const shown = (run.board?.cards ?? []).find((c) => c.kind === card.kind && c.title === card.title && c.from);
    if (!shown) return true;
    const patch =
      card.kind === "doc" || card.kind === "code"
        ? { text: card.text }
        : card.kind === "table"
          ? { rows: card.rows }
          : card.src
            ? { src: `${card.src.split("?")[0]}?v=${now}` }
            : null;
    if (patch) ops.push({ op: "patch", id: shown.id, patch });
    return false;
  });
  return { fresh, ops };
}

// Task positions as people left them: dragged tasks count where they are now, not where the planner put them.
export function withMoves(run: Run): NodeState[] {
  const moved = run.board?.moved ?? {};
  return run.nodes.map((n) => (moved[n.id] ? { ...n, ...moved[n.id] } : n));
}

// Native content an agent wrote into its reply, one unit per block: tables, docs, notes, code, and framed boards of
// stickies, shapes and connectors. Workspace paths in image items become file links.
export interface ReplyUnit {
  anchor: Card;
  // Positions relative to the anchor.
  children: Card[];
  links: Unit["links"];
}

export function cardsFromReply(run: Run, node: NodeState, output: string): ReplyUnit[] {
  const { blocks } = splitBlocks(output);
  const now = Date.now();
  // Cut and hashed like file cards so a long task id still gives ids within the limit.
  return blocks.map((block, b) => {
    const unit = blockUnit(block, (key) => `${node.id.slice(0, 40)}:${pathHash(`block:${b}:${key}`)}`);
    const own = (c: BlockCard): Card => {
      const src = c.kind === "image" && c.src && !/^(https?:|\/api\/)/.test(c.src) ? fileUrl(run.id, c.src.replace(/^\.?\//, "")) : c.src;
      return fit({ ...c, src, from: node.id, createdAt: now } as Card);
    };
    return { anchor: own(unit.anchor), children: unit.children.map(own), links: unit.links };
  });
}
