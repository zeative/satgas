import { expect, test } from "bun:test";
import { lockPageZoom } from "../../../src/web/lib/page-zoom";

const win = new EventTarget() as unknown as Window;
lockPageZoom(win);

function fire(type: string, props: Record<string, unknown> = {}, target?: unknown) {
  const e = new Event(type, { cancelable: true });
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
  if (target) Object.defineProperty(e, "target", { value: target });
  win.dispatchEvent(e);
  return e.defaultPrevented;
}
const page = { closest: () => null };
const canvas = { closest: () => ({}) };

test("a pinch or Ctrl+wheel never zooms the page, and plain scrolling stays", () => {
  expect(fire("wheel", { ctrlKey: true })).toBe(true);
  expect(fire("wheel", { ctrlKey: false })).toBe(false);
  expect(fire("gesturestart")).toBe(true);
});

test("two fingers are stopped on the page but left to the canvas, and one finger always scrolls", () => {
  expect(fire("touchmove", { touches: [1, 2] }, page)).toBe(true);
  expect(fire("touchmove", { touches: [1, 2] }, canvas)).toBe(false);
  expect(fire("touchmove", { touches: [1] }, page)).toBe(false);
});

test("the zoom shortcuts do nothing, and other shortcuts pass", () => {
  for (const key of ["+", "=", "-", "0"]) expect(fire("keydown", { key, metaKey: true })).toBe(true);
  expect(fire("keydown", { key: "k", metaKey: true })).toBe(false);
  expect(fire("keydown", { key: "0" })).toBe(false);
});
