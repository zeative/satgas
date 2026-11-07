import type { Card } from "../../../shared/board";
import { flowSources } from "../../../shared/flow";
import { placeInFlow } from "../../../shared/placement";
import type { LogLine, NodeState, Run } from "../../../shared/types";
import { type ActKind, classify } from "../missions/activity";
import { type Tail, tailOf } from "../team/tail";

// The spot a running task's work is heading for, drawn until its cards arrive there.
export const SLOT_W = 320;
export const SLOT_H = 180;

export interface Step extends Tail {
  kind: ActKind | "text";
  // The last lines its call gave back, once it has.
  out?: string;
  failed?: boolean;
}

// Rows in a slot, and how much of the newest step's output shows under it.
export const STEP_H = 28;
export const SLOT_PAD = 8;
const OUT_LINES = 4;

export interface Slot {
  task: NodeState;
  x: number;
  y: number;
  // The cards the work comes from, wired into the slot while it runs.
  from: string[];
  // Its latest few steps, oldest first: what the slot shows while the work forms.
  steps: Step[];
}

export interface Cursor {
  task: NodeState;
  x: number;
  y: number;
  // The step it is on: every new step moves the pointer, so it travels as the work does.
  step: number;
  now: Tail | null;
  // Writing a file this moment, rather than reading or running something.
  typing: boolean;
}

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;

// The newest step that says what the task is doing, and the file it touches when it reads or writes one.
function latest(lines: LogLine[] | undefined): { now: Tail | null; file: string | null; typing: boolean } {
  for (let i = (lines?.length ?? 0) - 1; i >= 0; i--) {
    const line = lines?.[i];
    const now = line ? tailOf(line) : null;
    if (!line || !now) continue;
    const act = line.kind === "tool" ? classify(line.text) : null;
    const file = act && (act.kind === "edit" || act.kind === "read" || act.kind === "image") && act.detail ? act.detail : null;
    return { now, file, typing: act?.kind === "edit" };
  }
  return { now: null, file: null, typing: false };
}

export const STEPS_SHOWN = 5;

// The newest steps that say something, oldest first, each with what kind of step it was.
function recent(lines: LogLine[] | undefined): Step[] {
  const results = new Map<string, LogLine>();
  for (const l of lines ?? []) if (l.kind === "out" && l.call) results.set(l.call, l);
  const out: Step[] = [];
  for (let i = (lines?.length ?? 0) - 1; i >= 0 && out.length < STEPS_SHOWN; i--) {
    const line = lines?.[i];
    const tail = line ? tailOf(line) : null;
    if (!line || !tail) continue;
    const got = line.call ? results.get(line.call) : undefined;
    const last = got?.text.trim() ? got.text.trimEnd().split("\n").slice(-OUT_LINES).join("\n") : undefined;
    out.push({ ...tail, kind: line.kind === "tool" ? classify(line.text).kind : "text", out: last, failed: got?.failed });
  }
  return out.reverse();
}

// A spot inside a box for one step: each step lands on another line of it, left to right across the text, the way
// someone works down a page. Fixed per step, so a redraw never moves the pointer by itself.
const LINES = 5;
function spotIn(box: { x: number; y: number; w: number; h: number }, step: number, top: number) {
  const h = Math.imul(step + 1, 2654435761) >>> 0;
  const row = h % LINES;
  const across = ((h >>> 8) % 100) / 100;
  const usable = Math.max(0, box.h - top - 24);
  return { x: box.x + 24 + across * Math.max(0, box.w - 96), y: box.y + top + (row / (LINES - 1)) * usable };
}

// A card on the board that shows this file: agents' file cards carry the path as their title.
function cardFor(file: string, cards: Card[]): Card | undefined {
  const name = base(file);
  return cards.find((c) => c.title && (c.title === file || file.endsWith(`/${c.title}`) || base(c.title) === name));
}

// Where the team's running work is: a slot for each running task where its cards will land, and a cursor on the card
// the task is touching right now, or on its slot. Several running tasks get their slots one under the other.
export function liveWork(run: Run, logs: Record<string, LogLine[]>): { slots: Slot[]; cursors: Cursor[] } {
  const running = run.nodes.filter((n) => n.status === "running");
  if (!running.length) return { slots: [], cursors: [] };
  const cards = run.board?.cards ?? [];
  const sources = flowSources(run.nodes, cards);
  const slots: Slot[] = [];
  const cursors: Cursor[] = [];
  // Each slot counts as taken for the next, so two running tasks never draw over each other.
  let board = cards;
  for (const task of running) {
    const [spot] = placeInFlow({ ...run, board: { ...(run.board ?? { links: [], moved: {} }), cards: board } }, task, [
      { id: `slot:${task.id}`, kind: "doc", w: SLOT_W, h: SLOT_H, createdAt: 0 },
    ]);
    if (!spot) continue;
    board = [...board, spot];
    const steps = recent(logs[task.id]);
    slots.push({ task, x: spot.x, y: spot.y, from: sources(task.id), steps });
    const { now, file, typing } = latest(logs[task.id]);
    const on = file ? cardFor(file, cards) : undefined;
    const step = now?.seq ?? 0;
    // On a card it reads, somewhere in it; on its own slot, on the row of the step it is doing now.
    const row = Math.max(0, steps.length - 1);
    const across = ((Math.imul(step + 1, 2654435761) >>> 8) % 100) / 100;
    const at = on ? spotIn(on, step, 24) : { x: spot.x + 40 + across * (SLOT_W - 140), y: spot.y + SLOT_PAD + row * STEP_H + STEP_H / 2 };
    cursors.push({ task, ...at, step, now, typing });
  }
  return { slots, cursors };
}
