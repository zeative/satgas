import { applyOps, type Board, type BoardOp, type Card, COLORS, type ColorName, SHAPES, type ShapeKind, sanitizeOps } from "./board";
import { isTeamNode } from "./team";

// The lead and the agents change what is already on the canvas with these commands: the lead in its plan, agents in a
// ```satgas:edit block holding a JSON array. The server checks each one against the board and turns it into BoardOps.
export type EditCommand =
  | { op: "delete"; ids?: string[]; all?: boolean }
  | {
      op: "update";
      id: string;
      title?: string;
      text?: string;
      color?: ColorName;
      shape?: ShapeKind;
      rows?: string[][];
      w?: number;
      h?: number;
    }
  | { op: "move"; id: string; x: number; y: number }
  | { op: "arrange"; ids?: string[]; all?: boolean; layout?: "grid" | "row" | "column" }
  | { op: "link"; from: string; to: string }
  | { op: "unlink"; from: string; to: string }
  // A checklist item ticked or unticked by its place (0 is the first) or by its words.
  | { op: "check"; id: string; item: number | string; done?: boolean };

export interface EditCounts {
  removed: number;
  changed: number;
  moved: number;
  linked: number;
  unlinked: number;
}

// A round's canvas changes made by the lead or agents, with the ops that put the board back.
export interface BoardEdit {
  counts: EditCounts;
  undo: BoardOp[];
  undone?: boolean;
}

export const MAX_COMMANDS = 200;
const GAP = 40;
const SNIPPET = 60;

export const emptyCounts = (): EditCounts => ({ removed: 0, changed: 0, moved: 0, linked: 0, unlinked: 0 });
export const addCounts = (a: EditCounts, b: EditCounts): EditCounts => ({
  removed: a.removed + b.removed,
  changed: a.changed + b.changed,
  moved: a.moved + b.moved,
  linked: a.linked + b.linked,
  unlinked: a.unlinked + b.unlinked,
});
export const countTotal = (c: EditCounts) => c.removed + c.changed + c.moved + c.linked + c.unlinked;

const inside = (c: Card, f: Card) =>
  c.id !== f.id && c.kind !== "frame" && c.x >= f.x && c.y >= f.y && c.x + c.w <= f.x + f.w && c.y + c.h <= f.y + f.h;

const oneLine = (s: string) => {
  const line = s.replace(/\s+/g, " ").trim();
  return line.length > SNIPPET ? `${line.slice(0, SNIPPET)}…` : line;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const overlaps = (a: Card, b: Card) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// What a card holds, beyond its one-line label: what a person typed in full (it is often the instruction), a
// document's opening, a table's columns, and for ink where it sits, since a stroke's meaning is what it marks.
function contentOf(c: Card, all: Card[], pad: string): string {
  const quote = (text: string, n: number) => `\n${pad}text: ${clip(text.replace(/\s+/g, " ").trim(), n)}`;
  if (c.kind === "widget") return widgetContent(c, all, pad);
  if ((c.kind === "note" || c.kind === "text" || c.kind === "shape") && c.text && c.text.length > SNIPPET)
    return quote(c.text, c.from ? 300 : 1200);
  if (c.kind === "doc" && c.text) return quote(c.text, c.from ? 240 : 1200);
  if (c.kind === "table" && c.rows?.length) return `\n${pad}columns: ${(c.rows[0] ?? []).join(" | ")}; ${c.rows.length - 1} rows`;
  if ((c.kind === "image" || c.kind === "preview") && c.src)
    return `\n${pad}file: ${decodeURIComponent(c.src.split("/files/")[1] ?? c.src)}`;
  if (c.kind === "drawing") {
    const under = all.filter((o) => o.id !== c.id && o.kind !== "drawing" && o.kind !== "frame" && overlaps(c, o));
    const shape = c.w > c.h * 4 ? "a horizontal stroke" : c.h > c.w * 4 ? "a vertical stroke" : "a stroke";
    return `\n${pad}ink: ${shape}${c.highlight ? " (highlighter)" : ""}${under.length ? `, drawn over ${under.map((o) => o.id).join(", ")}` : ", on empty canvas"}`;
  }
  return "";
}

// A widget in words: what it does or stands for, so the team can use it (variables, a checklist) or leave it be.
function widgetContent(c: Card, all: Card[], pad: string): string {
  const say = (text: string) => `\n${pad}${text}`;
  const prompt = clip((c.text ?? "").replace(/\s+/g, " ").trim(), 400);
  switch (c.widget) {
    case "trigger":
      return say(
        `trigger: runs ${prompt ? `"${prompt}"` : "nothing yet"} on its schedule or webhook${c.ref ? ` (schedule ${c.ref})` : ", not turned on"}`,
      );
    case "button":
      return say(`button: the person clicks it to send ${prompt ? `"${prompt}"` : "nothing yet"}`);
    case "checklist": {
      const items = c.items ?? [];
      if (!items.length) return say("checklist: no items yet");
      const shown = items.slice(0, 40).map((it, i) => `${pad}  ${i}. [${it.done ? "x" : " "}] ${clip(it.text, 160)}`);
      return say(`checklist, ${items.filter((i) => i.done).length} of ${items.length} done (tick with the check op):\n${shown.join("\n")}`);
    }
    case "variables": {
      const rows = (c.rows ?? []).filter((r) => r[0]);
      return say(
        `variables, used as {{name}} in messages: ${rows.length ? rows.map((r) => `${r[0]}=${clip(r[1] ?? "", 80)}`).join("; ") : "none yet"}`,
      );
    }
    case "comment": {
      const about = all.find((o) => o.id === c.ref);
      return say(`comment from the person${about ? ` on ${about.id}` : ""}: ${prompt ? `"${prompt}"` : "(empty)"}`);
    }
    default:
      return say(`shows the board's ${c.widget}${c.ref ? ` ${c.ref}` : ""}, live; not editable by the team`);
  }
}

// Widgets the team may change: their contents are the person's notes and lists, not live data or a schedule.
const TEAM_EDITABLE = new Set(["checklist", "variables", "button", "comment"]);

// What the lead and agents see of the canvas: one line per card, cards inside a frame indented under it.
export function describeBoard(board: Board | undefined, maxCards = 150): string {
  const cards = board?.cards ?? [];
  if (!cards.length) return "The board has no cards.";
  const frames = cards.filter((c) => c.kind === "frame");
  const parent = new Map<string, string>();
  for (const c of cards) {
    const f = frames.find((fr) => inside(c, fr));
    if (f) parent.set(c.id, f.id);
  }
  const line = (c: Card, depth: number) => {
    const label = c.title ? `"${oneLine(c.title)}"` : c.text ? `"${oneLine(c.text)}"` : c.files ? `${c.files.length} files` : "";
    const marks = [c.color, c.shape, c.locked && "locked", c.group && `group ${c.group}`, c.from ? "made by a task" : "made by a person"]
      .filter(Boolean)
      .join(", ");
    const pad = "  ".repeat(depth);
    return `${pad}- ${c.id} ${c.kind} ${label} at ${Math.round(c.x)},${Math.round(c.y)} size ${Math.round(c.w)}x${Math.round(c.h)} (${marks})${contentOf(c, cards, `${pad}  `)}`;
  };
  const out: string[] = [];
  const shown = cards.slice(0, maxCards);
  for (const c of shown.filter((c) => !parent.has(c.id))) {
    out.push(line(c, 0));
    if (c.kind === "frame") for (const child of shown.filter((k) => parent.get(k.id) === c.id)) out.push(line(child, 1));
  }
  if (cards.length > shown.length) out.push(`- …and ${cards.length - shown.length} more cards`);
  const links = board?.links ?? [];
  if (links.length) out.push(`Connectors: ${links.map((l) => `${l.source}→${l.target}`).join(", ")}`);
  return out.join("\n");
}

const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter(str) : []);

// A card moves with what belongs to it: a frame carries the cards inside it, a group moves as one.
function unitOf(card: Card, cards: Card[]): Card[] {
  const members = card.group ? cards.filter((c) => c.group === card.group) : [card];
  const out = new Map(members.map((c) => [c.id, c]));
  for (const m of members) if (m.kind === "frame") for (const c of cards) if (inside(c, m)) out.set(c.id, c);
  return [...out.values()];
}

function shift(unit: Card[], dx: number, dy: number): BoardOp[] {
  if (!dx && !dy) return [];
  return unit.filter((c) => !c.locked).map((c) => ({ op: "patch", id: c.id, patch: { x: c.x + dx, y: c.y + dy } }) as BoardOp);
}

// Top-level units in reading order, laid out from where the first one starts.
function arrange(units: Card[][], layout: "grid" | "row" | "column"): BoardOp[] {
  const boxes = units.map((u) => {
    const x = Math.min(...u.map((c) => c.x));
    const y = Math.min(...u.map((c) => c.y));
    return { u, x, y, w: Math.max(...u.map((c) => c.x + c.w)) - x, h: Math.max(...u.map((c) => c.y + c.h)) - y };
  });
  boxes.sort((a, b) => a.y - b.y || a.x - b.x);
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const cols = layout === "row" ? boxes.length : layout === "column" ? 1 : Math.ceil(Math.sqrt(boxes.length));
  const ops: BoardOp[] = [];
  let y = top;
  for (let i = 0; i < boxes.length; i += cols) {
    const row = boxes.slice(i, i + cols);
    let x = left;
    for (const b of row) {
      ops.push(...shift(b.u, x - b.x, y - b.y));
      x += b.w + GAP;
    }
    y += Math.max(...row.map((b) => b.h)) + GAP;
  }
  return ops;
}

// Turns commands into BoardOps against the board as it stands, one command after another. Locked cards are left
// alone, and anything that names a card that is not there is skipped and reported back.
export function editOps(board: Board, raw: unknown): { ops: BoardOp[]; counts: EditCounts; skipped: string[] } {
  const commands = Array.isArray(raw) ? raw.slice(0, MAX_COMMANDS) : [];
  const counts = emptyCounts();
  const skipped: string[] = [];
  const ops: BoardOp[] = [];
  let state = board;
  const take = (next: BoardOp[]) => {
    ops.push(...next);
    state = applyOps(state, next);
  };
  const card = (id: unknown) => (str(id) ? state.cards.find((c) => c.id === id) : undefined);
  const usable = (id: unknown, what: string): Card | undefined => {
    const c = card(id);
    if (!c) skipped.push(`${what}: no card ${String(id)}`);
    else if (c.locked) skipped.push(`${what}: ${c.id} is locked`);
    else return c;
    return undefined;
  };

  for (const cmd of commands as Record<string, unknown>[]) {
    if (!cmd || typeof cmd !== "object") continue;
    if (cmd.op === "delete") {
      const targets = cmd.all ? state.cards.filter((c) => !c.locked) : ids(cmd.ids).map((id) => usable(id, "delete"));
      // A trigger is a schedule the person set up; only they take it off the board.
      const gone = targets.filter((c): c is Card => {
        if (c?.kind === "widget" && c.widget === "trigger") {
          skipped.push(`delete: ${c.id} is the person's trigger`);
          return false;
        }
        return !!c;
      });
      if (cmd.all) for (const c of state.cards) if (c.locked) skipped.push(`delete: ${c.id} is locked`);
      // Deleted back to front, so the undo puts them back in their old order and overlapping cards stack as before.
      take(gone.reverse().map((c) => ({ op: "delete", id: c.id })));
      counts.removed += gone.length;
    } else if (cmd.op === "update") {
      const c = usable(cmd.id, "update");
      if (!c) continue;
      if (c.kind === "widget" && !TEAM_EDITABLE.has(c.widget ?? "")) {
        skipped.push(`update: ${c.id} is a live ${c.widget} widget`);
        continue;
      }
      const patch: Record<string, unknown> = {};
      for (const k of ["title", "text"] as const) if (typeof cmd[k] === "string") patch[k] = cmd[k];
      if (COLORS.includes(cmd.color as ColorName)) patch.color = cmd.color;
      if (SHAPES.includes(cmd.shape as ShapeKind)) patch.shape = cmd.shape;
      if (Array.isArray(cmd.rows)) patch.rows = cmd.rows;
      // A list the team writes is ticked by the team, so the person can tell who marked what.
      if (c.widget === "checklist" && Array.isArray(cmd.items))
        patch.items = (cmd.items as Record<string, unknown>[]).map((i) => ({
          text: String(i?.text ?? ""),
          ...(i?.done === true ? { done: true, by: "ai" } : {}),
        }));
      for (const k of ["w", "h"] as const) if (num(cmd[k]) && (cmd[k] as number) >= 40) patch[k] = cmd[k];
      const clean = Object.keys(patch).length ? sanitizeOps([{ op: "patch", id: c.id, patch }]) : null;
      if (!clean) {
        skipped.push(`update: nothing valid to change on ${c.id}`);
        continue;
      }
      take(clean);
      counts.changed++;
    } else if (cmd.op === "move") {
      if (!num(cmd.x) || !num(cmd.y)) {
        skipped.push(`move: ${String(cmd.id)} needs x and y`);
      } else if (str(cmd.id) && isTeamNode(cmd.id)) {
        // The lead and the team are not cards, and they keep the place Satgas gives them.
        skipped.push(`move: ${cmd.id} is part of the team, which stays where it is`);
      } else {
        const c = usable(cmd.id, "move");
        if (!c) continue;
        take(shift(unitOf(c, state.cards), cmd.x - c.x, cmd.y - c.y));
        counts.moved++;
      }
    } else if (cmd.op === "arrange") {
      const layout = cmd.layout === "row" || cmd.layout === "column" ? cmd.layout : "grid";
      const picked = cmd.all
        ? state.cards.filter((c) => !c.locked && !state.cards.some((f) => f.kind === "frame" && inside(c, f)))
        : ids(cmd.ids)
            .map((id) => usable(id, "arrange"))
            .filter((c): c is Card => !!c);
      // Each card once, inside its frame or group, so a frame and its contents move together.
      const seen = new Set<string>();
      const units: Card[][] = [];
      for (const c of picked) {
        if (seen.has(c.id)) continue;
        const u = unitOf(c, state.cards);
        for (const m of u) seen.add(m.id);
        units.push(u);
      }
      if (units.length < 2) continue;
      take(arrange(units, layout));
      counts.moved += units.length;
    } else if (cmd.op === "link") {
      const a = card(cmd.from);
      const b = card(cmd.to);
      if (!a || !b || a.id === b.id) {
        skipped.push(`link: needs two different cards (${String(cmd.from)} → ${String(cmd.to)})`);
        continue;
      }
      if (state.links.some((l) => l.source === a.id && l.target === b.id)) continue;
      const id = `e-${a.id}-${b.id}`.slice(0, 64);
      take([{ op: "link", link: { id, source: a.id, target: b.id } }]);
      counts.linked++;
    } else if (cmd.op === "check") {
      const c = usable(cmd.id, "check");
      if (!c) continue;
      const items = c.items ?? [];
      const at = num(cmd.item)
        ? cmd.item
        : items.findIndex((i) => str(cmd.item) && i.text.trim().toLowerCase() === (cmd.item as string).trim().toLowerCase());
      if (c.widget !== "checklist" || at < 0 || at >= items.length) {
        skipped.push(`check: ${c.id} has no item ${String(cmd.item)}`);
        continue;
      }
      const done = cmd.done !== false;
      const next = items.map((it, i) => (i === at ? { text: it.text, ...(done ? { done: true, by: "ai" as const } : {}) } : it));
      take([{ op: "patch", id: c.id, patch: { items: next } }]);
      counts.changed++;
    } else if (cmd.op === "unlink") {
      const gone = state.links.filter(
        (l) => (l.source === cmd.from && l.target === cmd.to) || (l.source === cmd.to && l.target === cmd.from),
      );
      if (!gone.length) skipped.push(`unlink: no connector between ${String(cmd.from)} and ${String(cmd.to)}`);
      take(gone.map((l) => ({ op: "delete", id: l.id })));
      counts.unlinked += gone.length;
    } else {
      skipped.push(`unknown op ${String(cmd.op)}`);
    }
  }
  return { ops, counts, skipped };
}

// The ```satgas:edit blocks in an agent's reply, each a JSON array of commands (a single command is accepted too).
const EDIT = /(?<=^|\n)[ \t]{0,3}(`{3,})satgas:edit[^\n]*\n([\s\S]*?)\n?[ \t]{0,3}\1(?!`)/g;

export function editBlocks(text: string): unknown[] {
  const out: unknown[] = [];
  for (const m of text.matchAll(EDIT)) {
    try {
      const parsed = JSON.parse(m[2] ?? "");
      out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // A block that is not JSON changes nothing; the agent's report still says what it meant to do.
    }
  }
  return out;
}

export const stripEdits = (text: string) => text.replace(EDIT, "").replace(/\n{3,}/g, "\n\n");

// What a person's change to the canvas did, in words for the lead: added, typed, moved, resized, drew, connected,
// deleted. Keyed per card and verb, so a drag that sends many moves becomes one line.
export interface CanvasEvent {
  at: number;
  key: string;
  text: string;
}

const labelOf = (c: Card | undefined) =>
  c ? `${c.kind}${c.title ? ` "${oneLine(c.title)}"` : c.text ? ` "${oneLine(c.text)}"` : ""} (${c.id})` : "a card";

export function describeOps(before: Board, ops: BoardOp[], now = Date.now()): CanvasEvent[] {
  const cards = new Map(before.cards.map((c) => [c.id, c]));
  const out: CanvasEvent[] = [];
  const add = (key: string, text: string) => out.push({ at: now, key, text });
  for (const op of ops) {
    if (op.op === "put") {
      const was = cards.get(op.card.id);
      if (op.card.kind === "drawing")
        add(`draw:${op.card.id}`, `drew ink${contentOf(op.card, [...cards.values()], "").replace(/\n\s*ink:/, ":")}`);
      else if (!was)
        add(
          `add:${op.card.id}`,
          `added ${labelOf(op.card)}${op.card.text && !op.card.title ? `: ${clip(op.card.text.replace(/\s+/g, " "), 400)}` : ""}`,
        );
      else add(`edit:${op.card.id}`, `changed ${labelOf(op.card)}`);
      cards.set(op.card.id, op.card);
    } else if (op.op === "patch") {
      const was = cards.get(op.id);
      const keys = Object.keys(op.patch);
      const next = was ? ({ ...was, ...op.patch } as Card) : undefined;
      if (keys.some((k) => k === "text" || k === "title" || k === "rows"))
        add(
          `edit:${op.id}`,
          `edited ${labelOf(next)}${typeof op.patch.text === "string" ? `: ${clip(op.patch.text.replace(/\s+/g, " "), 400)}` : ""}`,
        );
      else if (keys.some((k) => k === "w" || k === "h")) add(`size:${op.id}`, `resized ${labelOf(next)}`);
      else if (keys.some((k) => k === "x" || k === "y"))
        add(`move:${op.id}`, `moved ${labelOf(next)} to ${Math.round(next?.x ?? 0)},${Math.round(next?.y ?? 0)}`);
      else if (keys.includes("locked")) add(`lock:${op.id}`, `${op.patch.locked ? "locked" : "unlocked"} ${labelOf(next)}`);
      else if (keys.length) add(`style:${op.id}`, `restyled ${labelOf(next)}`);
      if (next) cards.set(op.id, next);
    } else if (op.op === "delete") {
      add(`del:${op.id}`, `deleted ${labelOf(cards.get(op.id))}`);
      cards.delete(op.id);
    } else if (op.op === "link") add(`link:${op.link.id}`, `connected ${op.link.source} to ${op.link.target}`);
    else if (op.op === "move" && isTeamNode(op.id)) add(`team:${op.id}`, `moved ${op.id} on the canvas`);
  }
  return out;
}

// Keeps the newest line per card and verb, so the log stays short however much the person drags.
export function mergeEvents(log: CanvasEvent[], fresh: CanvasEvent[], max = 80): CanvasEvent[] {
  const latest = new Map<string, CanvasEvent>();
  for (const e of [...log, ...fresh]) {
    latest.delete(e.key);
    latest.set(e.key, e);
  }
  return [...latest.values()].slice(-max);
}
