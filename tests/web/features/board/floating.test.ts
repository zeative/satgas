import { describe, expect, test } from "bun:test";
import { connectorEnds } from "../../../../src/web/features/board/floating";

const card = (x: number, y: number, w = 200, h = 100) => ({ x, y, w, h });

describe("floating connectors", () => {
  test("a card to the left is joined from its right side, never doubling back", () => {
    const end = connectorEnds(card(0, 0), card(-400, 300));
    expect([end.from, end.to]).toEqual(["left", "right"]);
    expect([end.sx, end.sy, end.tx, end.ty]).toEqual([0, 50, -200, 350]);
  });

  test("stacked cards join bottom to top", () => {
    const end = connectorEnds(card(0, 0), card(50, 300));
    expect([end.from, end.to]).toEqual(["bottom", "top"]);
  });

  test("side by side wins over a bigger vertical offset", () => {
    expect(connectorEnds(card(0, 0), card(260, 600)).from).toBe("right");
  });

  test("overlapping cards use the axis they are further apart on", () => {
    expect(connectorEnds(card(0, 0), card(150, 20)).from).toBe("right");
    expect(connectorEnds(card(0, 0), card(10, 80)).from).toBe("bottom");
  });

  test("a tree thread drops to a card below even when it sits off to the side", () => {
    expect([connectorEnds(card(0, 0), card(260, 600), true).from, connectorEnds(card(0, 0), card(260, 600), true).to]).toEqual([
      "bottom",
      "top",
    ]);
    expect(connectorEnds(card(0, 0), card(400, 20), true).from).toBe("right");
  });
});
