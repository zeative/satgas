import { expect, test } from "bun:test";
import { roughPaths } from "../../../../src/web/features/board/rough";

test("a sketchy shape draws the same every time, and differently for another card", () => {
  const card = { id: "a", shape: "rect" as const, rough: 1 };
  const once = roughPaths(card, 200, 100);
  expect(once.length).toBeGreaterThan(0);
  expect(roughPaths({ ...card }, 200, 100)).toEqual(once);
  expect(roughPaths({ ...card, id: "b" }, 200, 100)).not.toEqual(once);
});

test("a line follows its points", () => {
  const [d] = roughPaths({ id: "l", line: "arrow", rough: 1, points: [0, 0, 100, 50] }, 100, 50);
  expect(d?.startsWith("M")).toBe(true);
});
