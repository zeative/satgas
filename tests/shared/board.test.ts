import { describe, expect, test } from "bun:test";
import {
  applyOps,
  type Board,
  type BoardOp,
  type Card,
  cardKindForFile,
  emptyBoard,
  inverseOps,
  parseDelimited,
  sanitizeOps,
  toWire,
} from "../../src/shared/board";

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, kind: "note", x: 0, y: 0, w: 200, h: 100, createdAt: 1, ...extra });

describe("applyOps", () => {
  test("puts, patches, links and deletes cards together with their connectors", () => {
    let b = applyOps(emptyBoard(), [
      { op: "put", card: card("a") },
      { op: "put", card: card("b") },
      { op: "link", link: { id: "l1", source: "a", target: "b" } },
      { op: "patch", id: "a", patch: { text: "hi", x: 40 } },
    ]);
    expect(b.cards.find((c) => c.id === "a")).toMatchObject({ text: "hi", x: 40 });
    expect(b.links).toHaveLength(1);
    b = applyOps(b, [{ op: "delete", id: "a" }]);
    expect(b.cards.map((c) => c.id)).toEqual(["b"]);
    expect(b.links).toEqual([]);
  });

  test("records task node moves without touching cards", () => {
    const b = applyOps(emptyBoard(), [{ op: "move", id: "t1", x: 10, y: 20 }]);
    expect(b.moved).toEqual({ t1: { x: 10, y: 20 } });
    expect(b.cards).toEqual([]);
  });

  test("never mutates the board it was given", () => {
    const before = emptyBoard();
    applyOps(before, [{ op: "put", card: card("a") }]);
    expect(before.cards).toEqual([]);
  });
});

describe("inverseOps", () => {
  const roundTrip = (board: Board, ops: Parameters<typeof applyOps>[1]) => applyOps(applyOps(board, ops), inverseOps(board, ops));

  test("undoes a create, a patch and a delete that took its connectors along", () => {
    const base = applyOps(emptyBoard(), [
      { op: "put", card: card("a", { text: "keep" }) },
      { op: "put", card: card("b") },
      { op: "link", link: { id: "l1", source: "a", target: "b" } },
    ]);
    expect(roundTrip(base, [{ op: "put", card: card("c") }])).toEqual(base);
    expect(roundTrip(base, [{ op: "patch", id: "a", patch: { text: "changed", w: 300 } }])).toEqual(base);
    const restored = roundTrip(base, [{ op: "delete", id: "a" }]);
    expect(restored.cards.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(restored.links).toEqual(base.links);
  });

  test("undoes a task's first move by handing it back to the layout", () => {
    const base = emptyBoard();
    expect(roundTrip(base, [{ op: "move", id: "t1", x: 50, y: 60 }]).moved).toEqual({});
    expect(sanitizeOps([{ op: "unmove", id: "t1" }])).toEqual([{ op: "unmove", id: "t1" }]);
  });

  test("undoes a move back to the previous position", () => {
    const base = applyOps(emptyBoard(), [{ op: "move", id: "t1", x: 1, y: 2 }]);
    expect(roundTrip(base, [{ op: "move", id: "t1", x: 50, y: 60 }]).moved).toEqual({ t1: { x: 1, y: 2 } });
  });
});

describe("sanitizeOps", () => {
  test("accepts well-formed ops and stamps a creation time", () => {
    const ops = sanitizeOps([{ op: "put", card: { id: "a", kind: "table", x: 0, y: 0, w: 1, h: 1, rows: [["a", "b"]] } }]);
    expect(ops?.[0]).toMatchObject({ op: "put", card: { id: "a", kind: "table", rows: [["a", "b"]] } });
    expect(ops?.[0]?.op === "put" && typeof ops[0].card.createdAt).toBe("number");
  });

  test("rejects unknown ops, unknown kinds, missing geometry and oversized payloads", () => {
    expect(sanitizeOps([{ op: "drop", id: "a" }])).toBeNull();
    expect(sanitizeOps([{ op: "put", card: { id: "a", kind: "video", x: 0, y: 0, w: 1, h: 1 } }])).toBeNull();
    expect(sanitizeOps([{ op: "put", card: { id: "a", kind: "note", x: 0, y: 0 } }])).toBeNull();
    expect(sanitizeOps([{ op: "patch", id: "a", patch: { x: "far" } }])).toBeNull();
    expect(sanitizeOps([{ op: "patch", id: "a", patch: { text: "x".repeat(200_001) } }])).toBeNull();
    expect(sanitizeOps("nope")).toBeNull();
  });
});

describe("files on the board", () => {
  test("maps files to the card that shows them best", () => {
    expect(cardKindForFile("shots/home.PNG")).toBe("image");
    expect(cardKindForFile("site/index.html")).toBe("preview");
    expect(cardKindForFile("data/rivers.csv")).toBe("table");
    expect(cardKindForFile("README.md")).toBe("doc");
    expect(cardKindForFile("src/app.ts")).toBeNull();
  });

  test("parses CSV with quotes, escaped quotes and embedded newlines", () => {
    expect(parseDelimited('name,note\n"Nile","longest, ""by far"""\n"Amazon","two\nlines"\n')).toEqual([
      ["name", "note"],
      ["Nile", 'longest, "by far"'],
      ["Amazon", "two\nlines"],
    ]);
  });

  test("detects tabs and caps rows and columns", () => {
    expect(parseDelimited("a\tb\tc\n1\t2\t3\n4\t5\t6", 2, 2)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("board drawing tools", () => {
  test("text, shape and frame cards pass with their style fields", () => {
    const ops = sanitizeOps([
      { op: "put", card: { id: "s", kind: "shape", x: 0, y: 0, w: 10, h: 10, shape: "diamond", color: "blue", text: "Go" } },
      {
        op: "put",
        card: { id: "d", kind: "drawing", x: 0, y: 0, w: 10, h: 10, points: [0, 0, 1, 1], color: "pink", size: 14, highlight: true },
      },
      { op: "put", card: { id: "f", kind: "frame", x: 0, y: 0, w: 10, h: 10, text: "Sprint" } },
    ]);
    expect(ops?.map((o) => (o.op === "put" ? o.card.kind : o.op))).toEqual(["shape", "drawing", "frame"]);
  });

  test("unknown colors, shapes and silly stroke widths are refused", () => {
    const base = { id: "a", kind: "shape", x: 0, y: 0, w: 1, h: 1 };
    expect(sanitizeOps([{ op: "put", card: { ...base, color: "#ff00ff" } }])).toBeNull();
    expect(sanitizeOps([{ op: "put", card: { ...base, shape: "star" } }])).toBeNull();
    expect(sanitizeOps([{ op: "put", card: { ...base, kind: "drawing", size: 500 } }])).toBeNull();
  });
});

describe("lock and stacking fields", () => {
  test("accepts booleans and bounded numbers, rejects anything else", () => {
    expect(sanitizeOps([{ op: "patch", id: "a", patch: { locked: true, z: 3 } }])).toEqual([
      { op: "patch", id: "a", patch: { locked: true, z: 3 } },
    ]);
    expect(sanitizeOps([{ op: "patch", id: "a", patch: { locked: "yes" } }])).toBeNull();
    expect(sanitizeOps([{ op: "patch", id: "a", patch: { z: 1e9 } }])).toBeNull();
  });
});

describe("removing fields", () => {
  test("a patch removes a field in memory and over the wire, and undo of a new field round-trips", () => {
    const b = applyOps(emptyBoard(), [{ op: "put", card: card("a") }]);
    const ops: BoardOp[] = [{ op: "patch", id: "a", patch: { color: "green", group: "g1" } }];
    const after = applyOps(b, ops);
    const undo = inverseOps(b, ops);
    const wire = sanitizeOps(JSON.parse(JSON.stringify(toWire(undo))));
    expect(wire).not.toBeNull();
    const back = applyOps(after, wire ?? []);
    expect("color" in (back.cards[0] ?? {})).toBe(false);
    expect("group" in (back.cards[0] ?? {})).toBe(false);
  });

  test("position and size cannot be removed", () => {
    expect(sanitizeOps([{ op: "patch", id: "a", patch: { x: null } }])).toBeNull();
  });
});
