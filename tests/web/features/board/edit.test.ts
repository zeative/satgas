import { describe, expect, test } from "bun:test";
import { applyOps, type Board, type Card } from "../../../../src/shared/board";
import {
  alignMoves,
  arrangeOps,
  bounds,
  cloneOps,
  decodeClip,
  distributeMoves,
  encodeClip,
  flipOps,
  frameAround,
  groupOps,
  inside,
  layerOf,
  moveUnits,
  styleOf,
  styleOps,
  tidyMoves,
  ungroupOps,
  withGroups,
} from "../../../../src/web/features/board/edit";

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, kind: "note", x: 0, y: 0, w: 100, h: 100, createdAt: 1, ...extra });
const board = (cards: Card[], links: Board["links"] = []): Board => ({ cards, links, moved: {} });
let n = 0;
const makeId = () => `n${++n}`;

describe("clipboard", () => {
  test("round-trips cards and only the links between copied cards", () => {
    const b = board(
      [card("a"), card("b"), card("c")],
      [
        { id: "l1", source: "a", target: "b" },
        { id: "l2", source: "b", target: "c" },
      ],
    );
    const clip = decodeClip(encodeClip(b, new Set(["a", "b"])) ?? "");
    expect(clip?.cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(clip?.links.map((l) => l.id)).toEqual(["l1"]);
  });

  test("ignores foreign text and malformed cards", () => {
    expect(decodeClip("hello")).toBeNull();
    expect(decodeClip(JSON.stringify({ type: "other", cards: [card("a")] }))).toBeNull();
    expect(decodeClip(JSON.stringify({ type: "satgas/cards", cards: [{ id: "a", kind: "virus" }] }))).toBeNull();
  });
});

describe("cloneOps", () => {
  test("gives copies fresh ids, shifts them, rewires links and drops origin and lock", () => {
    const { ops, ids } = cloneOps(
      { cards: [card("a", { from: "t1", locked: true }), card("b", { x: 200 })], links: [{ id: "l1", source: "a", target: "b" }] },
      24,
      24,
      makeId,
    );
    const next = applyOps(board([]), ops);
    expect(next.cards.map((c) => c.id)).toEqual(ids);
    expect(next.cards[0]).toMatchObject({ x: 24, y: 24 });
    expect(next.cards[0]?.from).toBeUndefined();
    expect(next.cards[0]?.locked).toBeUndefined();
    expect(next.links).toHaveLength(1);
    expect(next.links[0]).toMatchObject({ source: ids[0], target: ids[1] });
  });
});

describe("arrangeOps", () => {
  const b = board([card("a"), card("b"), card("c"), card("f", { kind: "frame" })]);

  test("front and back move past every other card in the same layer band", () => {
    const front = applyOps(b, arrangeOps(b, new Set(["a"]), "front"));
    const a = front.cards.find((c) => c.id === "a") as Card;
    expect(front.cards.filter((c) => c.kind !== "frame" && c.id !== "a").every((c) => layerOf(c) < layerOf(a))).toBe(true);
    const back = applyOps(b, arrangeOps(b, new Set(["c"]), "back"));
    const c = back.cards.find((x) => x.id === "c") as Card;
    expect(back.cards.filter((x) => x.kind !== "frame" && x.id !== "c").every((x) => layerOf(x) > layerOf(c))).toBe(true);
  });

  test("forward only steps over an overlapping card above it, and frames stay in their own band", () => {
    const ops = arrangeOps(b, new Set(["b"]), "forward");
    expect(ops).toEqual([{ op: "patch", id: "b", patch: { z: 2 } }]);
    expect(arrangeOps(b, new Set(["f"]), "front")).toEqual([]);
    const apart = board([card("a"), card("b", { x: 500 })]);
    expect(arrangeOps(apart, new Set(["a"]), "forward")).toEqual([]);
  });

  test("leaves locked cards alone", () => {
    expect(arrangeOps(board([card("a", { locked: true }), card("b")]), new Set(["a"]), "front")).toEqual([]);
  });
});

describe("flipOps", () => {
  test("mirrors stroke points inside the card box", () => {
    const d = card("d", { kind: "drawing", w: 100, h: 50, points: [10, 5, 90, 45] });
    expect(flipOps([d], "x")).toEqual([{ op: "patch", id: "d", patch: { points: [90, 5, 10, 45] } }]);
    expect(flipOps([d], "y")).toEqual([{ op: "patch", id: "d", patch: { points: [10, 45, 90, 5] } }]);
    expect(flipOps([card("n")], "x")).toEqual([]);
  });
});

describe("styles", () => {
  test("copies a style and applies only what each kind can wear", () => {
    const style = styleOf([card("t", { kind: "text" }), card("s", { kind: "shape", color: "green", shape: "ellipse" })]);
    expect(style).toEqual({ color: "green", shape: "ellipse" });
    const ops = styleOps(
      [card("n", { color: "yellow" }), card("s2", { kind: "shape", shape: "rect" }), card("x", { kind: "doc" })],
      style ?? {},
    );
    expect(ops).toEqual([
      { op: "patch", id: "n", patch: { color: "green" } },
      { op: "patch", id: "s2", patch: { color: "green", shape: "ellipse" } },
    ]);
  });

  test("line looks go to lines and shapes, never to ink or notes", () => {
    const line = card("l", { kind: "drawing", line: "line" });
    const ink = card("i", { kind: "drawing" });
    const shape = card("s", { kind: "shape", dash: "dotted" });
    const note = card("n");
    expect(styleOps([line, ink, shape, note], { dash: "dashed", stroke: 4, line: "arrow" })).toEqual([
      { op: "patch", id: "l", patch: { dash: "dashed", stroke: 4, line: "arrow" } },
      { op: "patch", id: "s", patch: { dash: "dashed", stroke: 4 } },
    ]);
    expect(styleOps([shape], { dash: "solid", fill: "none", opacity: 1 })).toEqual([
      { op: "patch", id: "s", patch: { dash: undefined, fill: "none" } },
    ]);
    expect(styleOf([card("x", { kind: "shape", fill: "solid", stroke: 2 })])).toEqual({ fill: "solid", stroke: 2 });
  });
});

test("frameAround leaves room around the cards and for the frame name", () => {
  const f = frameAround(bounds([card("a"), card("b", { x: 300, y: 200 })]), "f1", "Frame");
  expect(f).toMatchObject({ kind: "frame", x: -40, y: -56, w: 480, h: 396, text: "Frame" });
});

describe("groups", () => {
  test("group and ungroup patch only what changes", () => {
    expect(groupOps([card("a")], "g")).toEqual([]);
    expect(groupOps([card("a"), card("b", { group: "g" })], "g")).toEqual([{ op: "patch", id: "a", patch: { group: "g" } }]);
    expect(ungroupOps([card("a", { group: "g" }), card("b")])).toEqual([{ op: "patch", id: "a", patch: { group: undefined } }]);
  });

  test("picking any card of a group picks the whole group", () => {
    const cards = [card("a", { group: "g" }), card("b", { group: "g" }), card("c")];
    expect([...withGroups(new Set(["a"]), cards)].sort()).toEqual(["a", "b"]);
    expect([...withGroups(new Set(["c"]), cards)]).toEqual(["c"]);
  });
});

describe("layout", () => {
  const item = (id: string, x: number, y: number, w = 100, h = 100) => ({ id, x, y, w, h });

  test("aligns edges and centers to the selection bounds", () => {
    const items = [item("a", 0, 0, 100, 50), item("b", 200, 100, 50, 100)];
    expect(alignMoves(items, "left")).toEqual([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 0, y: 100 },
    ]);
    expect(alignMoves(items, "right").map((m) => m.x)).toEqual([150, 200]);
    expect(alignMoves(items, "middle").map((m) => m.y)).toEqual([75, 50]);
  });

  test("distributes with equal gaps, keeping the ends", () => {
    const moves = distributeMoves([item("a", 0, 0), item("b", 150, 0), item("c", 500, 0)], "x");
    expect(moves.map((m) => m.x)).toEqual([0, 250, 500]);
    expect(distributeMoves([item("a", 0, 0), item("b", 9, 0)], "x")).toEqual([]);
  });

  test("tidies into a grid in reading order", () => {
    const moves = tidyMoves([item("d", 300, 300), item("a", 0, 0), item("b", 500, 10), item("c", 40, 200)], 20);
    expect(moves).toEqual([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 120, y: 0 },
      { id: "c", x: 0, y: 120 },
      { id: "d", x: 120, y: 120 },
    ]);
  });

  test("moves a group as one box", () => {
    const items = [item("a", 0, 0), item("g1", 300, 50), item("g2", 420, 50)];
    const moves = moveUnits(
      items,
      (id) => (id.startsWith("g") ? "G" : undefined),
      (u) => alignMoves(u, "top"),
    );
    expect(moves).toEqual([
      { id: "g1", x: 300, y: 0 },
      { id: "g2", x: 420, y: 0 },
    ]);
  });

  test("finds what sits wholly inside a frame", () => {
    expect(
      inside({ x: 0, y: 0, w: 300, h: 300 }, [item("in", 10, 10), item("half", 250, 10), item("out", 400, 0)]).map((i) => i.id),
    ).toEqual(["in"]);
  });
});
