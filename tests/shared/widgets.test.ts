import { expect, test } from "bun:test";
import { applyOps, type Board, type Card, emptyBoard, sanitizeOps } from "../../src/shared/board";
import { describeBoard, editOps } from "../../src/shared/board-edit";
import { fillVariables, linkedCards, variablesOf } from "../../src/shared/widgets";

const card = (c: Partial<Card> & Pick<Card, "id" | "kind">): Card => ({ x: 0, y: 0, w: 100, h: 100, createdAt: 1, ...c });
const board = (cards: Card[], links: Board["links"] = []): Board => ({ ...emptyBoard(), cards, links });

test("{{name}} takes the board's value, later cards win, and unknown names stay as written", () => {
  const b = board([
    card({
      id: "v1",
      kind: "widget",
      widget: "variables",
      rows: [
        ["site", "old.example"],
        ["env", "staging"],
      ],
    }),
    card({
      id: "v2",
      kind: "widget",
      widget: "variables",
      rows: [
        ["site", "shop.example"],
        ["bad name", "x"],
      ],
    }),
  ]);
  expect([...variablesOf(b)]).toEqual([
    ["site", "shop.example"],
    ["env", "staging"],
  ]);
  expect(fillVariables("Deploy {{ site }} to {{env}}, not {{missing}}", b)).toBe("Deploy shop.example to staging, not {{missing}}");
  expect(fillVariables("no braces", b)).toBe("no braces");
});

test("a trigger's context is what its connectors point at, a frame standing for the cards inside it", () => {
  const b = board(
    [
      card({ id: "t", kind: "widget", widget: "trigger" }),
      card({ id: "f", kind: "frame", x: 0, y: 0, w: 500, h: 500 }),
      card({ id: "in", kind: "note", x: 10, y: 10 }),
      card({ id: "ink", kind: "drawing", x: 20, y: 20 }),
      card({ id: "n", kind: "doc", x: 900 }),
    ],
    [
      { id: "l1", source: "t", target: "f" },
      { id: "l2", source: "t", target: "n" },
      { id: "l3", source: "n", target: "t" },
    ],
  );
  expect(linkedCards(b, "t").sort()).toEqual(["in", "n"]);
});

test("a widget card must say what it is, only widgets may, and what it is never changes", () => {
  const base = { id: "w", x: 0, y: 0, w: 10, h: 10 };
  expect(sanitizeOps([{ op: "put", card: { ...base, kind: "widget" } }])).toBeNull();
  expect(sanitizeOps([{ op: "put", card: { ...base, kind: "note", widget: "trigger" } }])).toBeNull();
  expect(sanitizeOps([{ op: "put", card: { ...base, kind: "widget", widget: "rocket" } }])).toBeNull();
  expect(sanitizeOps([{ op: "patch", id: "w", patch: { widget: "button" } }])).toBeNull();
  const ok = sanitizeOps([
    { op: "put", card: { ...base, kind: "widget", widget: "checklist", items: [{ text: "Ship", done: true, by: "ai" }] } },
  ]);
  expect(ok?.[0]).toMatchObject({ op: "put", card: { widget: "checklist", items: [{ text: "Ship", done: true, by: "ai" }] } });
  expect(sanitizeOps([{ op: "patch", id: "w", patch: { items: [{ text: 5 }] } }])).toBeNull();
});

test("the team ticks checklist items, leaves live widgets and the person's triggers alone, and reads them all", () => {
  const b = board([
    card({ id: "c", kind: "widget", widget: "checklist", items: [{ text: "Tests pass" }, { text: "Docs updated" }] }),
    card({ id: "t", kind: "widget", widget: "trigger", ref: "s1", text: "Check logs" }),
    card({ id: "p", kind: "widget", widget: "pull", ref: "https://github.com/a/b/pull/1" }),
    card({ id: "v", kind: "widget", widget: "variables", rows: [["env", "prod"]] }),
  ]);
  const { ops, skipped } = editOps(b, [
    { op: "check", id: "c", item: "docs updated" },
    { op: "check", id: "c", item: 7 },
    { op: "delete", ids: ["t"] },
    { op: "update", id: "p", text: "x" },
  ]);
  const after = applyOps(b, ops);
  expect(after.cards.find((x) => x.id === "c")?.items).toEqual([{ text: "Tests pass" }, { text: "Docs updated", done: true, by: "ai" }]);
  expect(after.cards.some((x) => x.id === "t")).toBe(true);
  expect(skipped).toEqual(["check: c has no item 7", "delete: t is the person's trigger", "update: p is a live pull widget"]);
  const said = describeBoard(after);
  expect(said).toContain("checklist, 1 of 2 done");
  expect(said).toContain("1. [x] Docs updated");
  expect(said).toContain('trigger: runs "Check logs"');
  expect(said).toContain("variables, used as {{name}} in messages: env=prod");
});
