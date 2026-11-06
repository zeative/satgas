import { expect, test } from "bun:test";
import { applyOps, type Board, type Card, inverseOps } from "../../src/shared/board";
import { stripBlocks } from "../../src/shared/board-blocks";
import { describeBoard, editBlocks, editOps, stripEdits } from "../../src/shared/board-edit";

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, kind: "note", x: 0, y: 0, w: 100, h: 80, createdAt: 1, ...extra });
const board = (cards: Card[], links: Board["links"] = []): Board => ({ cards, links, moved: {} });

test("delete all clears every unlocked card and keeps locked ones", () => {
  const b = board([card("a"), card("b", { locked: true }), card("c")], [{ id: "l1", source: "a", target: "c" }]);
  const { ops, counts, skipped } = editOps(b, [{ op: "delete", all: true }]);
  const after = applyOps(b, ops);
  expect(after.cards.map((c) => c.id)).toEqual(["b"]);
  expect(after.links).toEqual([]);
  expect(counts.removed).toBe(2);
  expect(skipped).toEqual(["delete: b is locked"]);
});

test("the inverse of an edit brings the board back exactly", () => {
  const b = board([card("a", { text: "hi" }), card("c")], [{ id: "l1", source: "a", target: "c" }]);
  const { ops } = editOps(b, [{ op: "delete", all: true }]);
  expect(applyOps(applyOps(b, ops), inverseOps(b, ops))).toEqual(b);
});

test("delete by id skips cards that are not there", () => {
  const { ops, counts, skipped } = editOps(board([card("a")]), [{ op: "delete", ids: ["a", "ghost"] }]);
  expect(ops).toEqual([{ op: "delete", id: "a" }]);
  expect(counts.removed).toBe(1);
  expect(skipped).toEqual(["delete: no card ghost"]);
});

test("update changes only valid fields and refuses a bad color", () => {
  const b = board([card("a")]);
  const ok = editOps(b, [{ op: "update", id: "a", title: "Plan", color: "pink", w: 300 }]);
  expect(applyOps(b, ok.ops).cards[0]).toMatchObject({ title: "Plan", color: "pink", w: 300 });
  const bad = editOps(b, [{ op: "update", id: "a", color: "neon" }]);
  expect(bad.ops).toEqual([]);
  expect(bad.skipped[0]).toContain("nothing valid");
});

test("moving a frame carries the cards inside it", () => {
  const b = board([card("f", { kind: "frame", x: 0, y: 0, w: 400, h: 300 }), card("in", { x: 20, y: 20 }), card("out", { x: 900, y: 0 })]);
  const after = applyOps(b, editOps(b, [{ op: "move", id: "f", x: 100, y: 50 }]).ops);
  const at = (id: string) => after.cards.find((c) => c.id === id);
  expect(at("f")).toMatchObject({ x: 100, y: 50 });
  expect(at("in")).toMatchObject({ x: 120, y: 70 });
  expect(at("out")).toMatchObject({ x: 900, y: 0 });
});

test("the lead and the team cannot be moved by an edit", () => {
  const { ops, counts, skipped } = editOps(board([]), [
    { op: "move", id: "m:raka", x: 10, y: -300 },
    { op: "move", id: "lead", x: 0, y: 0 },
  ]);
  expect(ops).toEqual([]);
  expect(counts.moved).toBe(0);
  expect(skipped).toHaveLength(2);
});

test("arrange lines cards up in a grid without overlaps", () => {
  const b = board([card("a", { x: 500, y: 500 }), card("b", { x: 0, y: 0 }), card("c", { x: 30, y: 10 }), card("d", { x: 900, y: 40 })]);
  const after = applyOps(b, editOps(b, [{ op: "arrange", all: true, layout: "grid" }]).ops);
  const boxes = after.cards;
  for (const p of boxes)
    for (const q of boxes) if (p.id !== q.id) expect(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h).toBe(false);
  expect(Math.min(...boxes.map((c) => c.x))).toBe(0);
});

test("link and unlink connectors between cards", () => {
  const b = board([card("a"), card("b")]);
  const linked = applyOps(b, editOps(b, [{ op: "link", from: "a", to: "b" }]).ops);
  expect(linked.links).toHaveLength(1);
  const gone = editOps(linked, [{ op: "unlink", from: "b", to: "a" }]);
  expect(applyOps(linked, gone.ops).links).toEqual([]);
  expect(gone.counts.unlinked).toBe(1);
});

test("edit blocks are read from a reply and kept out of the chat", () => {
  const reply = 'Cleared it.\n\n```satgas:edit\n[{"op": "delete", "all": true}]\n```\n\nDone.';
  expect(editBlocks(reply)).toEqual([{ op: "delete", all: true }]);
  expect(stripEdits(reply)).toBe("Cleared it.\n\nDone.");
  expect(stripBlocks(reply)).toBe("Cleared it.\n\nDone.");
  expect(editBlocks("```satgas:edit\nnot json\n```")).toEqual([]);
});

test("the board description lists ids, frames and locks", () => {
  const text = describeBoard(
    board([card("f", { kind: "frame", title: "Flow", w: 400, h: 300 }), card("n", { x: 10, y: 10, text: "Hello", locked: true })]),
  );
  expect(text).toContain('- f frame "Flow"');
  expect(text).toContain('  - n note "Hello"');
  expect(text).toContain("locked");
  expect(describeBoard(undefined)).toBe("The board has no cards.");
});

test("what a person does by hand reads as plain events, one line per card and verb", async () => {
  const { describeOps, mergeEvents, describeBoard } = await import("../../src/shared/board-edit");
  const table = {
    id: "t1",
    kind: "table" as const,
    x: 0,
    y: 0,
    w: 300,
    h: 200,
    title: "Prices",
    rows: [
      ["App", "Price"],
      ["A", "1"],
    ],
    createdAt: 1,
  };
  const before = { cards: [table], links: [], moved: {} };
  const ink = { id: "d1", kind: "drawing" as const, x: 50, y: 50, w: 100, h: 40, points: [0, 0, 100, 40], createdAt: 2 };
  const note = { id: "n1", kind: "note" as const, x: 400, y: 0, w: 200, h: 120, text: "Make the price column bold", createdAt: 3 };
  const events = describeOps(
    before,
    [
      { op: "put", card: ink },
      { op: "put", card: note },
      { op: "patch", id: "t1", patch: { x: 10, y: 20 } },
      { op: "patch", id: "t1", patch: { x: 30, y: 40 } },
      { op: "delete", id: "t1" },
    ],
    5,
  );
  expect(events.map((e) => e.text)).toEqual([
    "drew ink: a stroke, drawn over t1",
    'added note "Make the price column bold" (n1): Make the price column bold',
    'moved table "Prices" (t1) to 10,20',
    'moved table "Prices" (t1) to 30,40',
    'deleted table "Prices" (t1)',
  ]);
  // A drag sends many moves; only the last is kept.
  expect(
    mergeEvents([], events)
      .filter((e) => e.key === "move:t1")
      .map((e) => e.text),
  ).toEqual(['moved table "Prices" (t1) to 30,40']);
  const board = describeBoard({ cards: [table, ink], links: [], moved: {} });
  expect(board).toContain("columns: App | Price; 1 rows");
  expect(board).toContain("ink: a stroke, drawn over t1");
});
