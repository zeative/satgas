import { beforeEach, expect, test } from "bun:test";
import { closeReview, closeTab, openFile, openReview, resetReview, useReview } from "../../../src/web/stores/review";

beforeEach(resetReview);
const state = () => useReview.getState();

test("opening files adds tabs once and shows the one opened", () => {
  openFile("a.ts");
  openFile("b.ts");
  openFile("a.ts");
  expect(state().tabs).toEqual(["a.ts", "b.ts"]);
  expect(state().file).toBe("a.ts");
});

test("closing the tab in view moves to its right, else its left, and the last one closes the view", () => {
  for (const p of ["a", "b", "c"]) openFile(p);
  openFile("b");
  closeTab("b");
  expect(state().file).toBe("c");
  closeTab("c");
  expect(state().file).toBe("a");
  closeTab("a");
  expect(state().file).toBeUndefined();
  expect(state().tabs).toEqual([]);
});

test("closing another tab leaves the one in view alone", () => {
  openFile("a");
  openFile("b");
  closeTab("a");
  expect(state().file).toBe("b");
});

test("going back to the canvas or into a review keeps the tabs; leaving the board drops them", () => {
  openFile("a");
  closeReview();
  expect(state().file).toBeUndefined();
  expect(state().tabs).toEqual(["a"]);
  openReview({ kind: "board" });
  expect(state().tabs).toEqual(["a"]);
  resetReview();
  expect(state().tabs).toEqual([]);
});
