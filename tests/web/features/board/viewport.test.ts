import { expect, test } from "bun:test";
import { cleanView, remember } from "../../../../src/web/features/board/viewport";

test("only a real camera position comes back from storage", () => {
  expect(cleanView({ x: -120.5, y: 40, zoom: 0.8 })).toEqual({ x: -120.5, y: 40, zoom: 0.8 });
  expect(cleanView({ x: 1, y: 2, zoom: 0 })).toBeNull();
  expect(cleanView({ x: "1", y: 2, zoom: 1 })).toBeNull();
  expect(cleanView({ x: Number.NaN, y: 2, zoom: 1 })).toBeNull();
  expect(cleanView(null)).toBeNull();
});

test("keeps each board's view and forgets the oldest past the limit", () => {
  let all = {};
  all = remember(all, "a", { x: 1, y: 1, zoom: 1 }, 1, 2);
  all = remember(all, "b", { x: 2, y: 2, zoom: 1 }, 2, 2);
  all = remember(all, "a", { x: 9, y: 9, zoom: 0.5 }, 3, 2);
  all = remember(all, "c", { x: 3, y: 3, zoom: 1 }, 4, 2);
  expect(Object.keys(all).sort()).toEqual(["a", "c"]);
  expect(cleanView((all as Record<string, unknown>).a)).toEqual({ x: 9, y: 9, zoom: 0.5 });
});
