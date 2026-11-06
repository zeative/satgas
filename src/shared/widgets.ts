import type { Board, Card } from "./board";

// Widgets are cards that work instead of only showing: a trigger runs work on a schedule, a button runs it on a click,
// a checklist and variables feed the team. The live ones (pull, branch, changes, round, fork, memory) point at data
// Satgas already keeps, by `ref`, and draw it as it is now instead of a copy.
export type WidgetKind =
  | "trigger"
  | "button"
  | "checklist"
  | "variables"
  | "comment"
  | "pull"
  | "branch"
  | "changes"
  | "round"
  | "fork"
  | "memory";

export const WIDGETS: WidgetKind[] = [
  "trigger",
  "button",
  "checklist",
  "variables",
  "comment",
  "pull",
  "branch",
  "changes",
  "round",
  "fork",
  "memory",
];

export interface CheckItem {
  text: string;
  done?: boolean;
  // Who ticked it last, so a person can see what the team marked done.
  by?: "ai" | "person";
}

export const MAX_CHECK_ITEMS = 200;
export const CHECK_TEXT_MAX = 500;

export const WIDGET_SIZE: Record<WidgetKind, { w: number; h: number }> = {
  trigger: { w: 320, h: 248 },
  button: { w: 280, h: 168 },
  checklist: { w: 300, h: 220 },
  variables: { w: 300, h: 180 },
  comment: { w: 260, h: 148 },
  pull: { w: 320, h: 196 },
  branch: { w: 300, h: 164 },
  changes: { w: 320, h: 220 },
  round: { w: 320, h: 196 },
  fork: { w: 300, h: 148 },
  memory: { w: 280, h: 140 },
};

const NAME = /^[A-Za-z_][\w.-]{0,39}$/;
export const validVariable = (name: string) => NAME.test(name);

// Every variables card on the board, later cards winning a name both define.
export function variablesOf(board: Board | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of board?.cards ?? []) {
    if (c.kind !== "widget" || c.widget !== "variables") continue;
    for (const [name, value] of c.rows ?? []) {
      const key = (name ?? "").trim();
      if (validVariable(key)) out.set(key, value ?? "");
    }
  }
  return out;
}

// `{{name}}` in a message becomes the board's value for it; a name the board does not define stays as written.
export function fillVariables(text: string, board: Board | undefined): string {
  const vars = variablesOf(board);
  if (!vars.size || !text.includes("{{")) return text;
  return text.replace(/\{\{\s*([A-Za-z_][\w.-]{0,39})\s*\}\}/g, (whole, name: string) => vars.get(name) ?? whole);
}

const inside = (c: Card, f: Card) =>
  c.id !== f.id && c.kind !== "frame" && c.x >= f.x && c.y >= f.y && c.x + c.w <= f.x + f.w && c.y + c.h <= f.y + f.h;

// What a trigger or button hands the team as context: the cards its connectors point at, a frame standing for the
// cards inside it.
export function linkedCards(board: Board | undefined, id: string): string[] {
  const cards = board?.cards ?? [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out = new Set<string>();
  for (const l of board?.links ?? []) {
    if (l.source !== id) continue;
    const target = byId.get(l.target);
    if (!target) continue;
    if (target.kind === "frame") {
      for (const c of cards) if (c.id !== id && c.kind !== "drawing" && inside(c, target)) out.add(c.id);
    } else out.add(target.id);
  }
  return [...out].slice(0, 50);
}

// The trigger card standing for a schedule on its board, if the schedule has one.
export const triggerOf = (board: Board | undefined, scheduleId: string) =>
  board?.cards.find((c) => c.kind === "widget" && c.widget === "trigger" && c.ref === scheduleId);
