import { expect, test } from "bun:test";
import { watchLongPress } from "../../../../src/web/features/board/long-press";

function touch(el: EventTarget, type: string, points: { clientX: number; clientY: number }[]) {
  const e = new Event(type);
  Object.defineProperty(e, "touches", { value: points });
  el.dispatchEvent(e);
}
const setup = () => {
  (globalThis as { MouseEvent?: unknown }).MouseEvent ??= class extends Event {};
  const el = new EventTarget();
  let menus = 0;
  el.addEventListener("contextmenu", () => menus++);
  return { el, count: () => menus };
};
const at = { clientX: 50, clientY: 50 };

test("a held finger opens the board's menu, once", async () => {
  const { el, count } = setup();
  const stop = watchLongPress(el, 10);
  touch(el, "touchstart", [at]);
  await Bun.sleep(30);
  expect(count()).toBe(1);
  stop();
});

test("moving, lifting or a second finger keeps the menu closed", async () => {
  const { el, count } = setup();
  const stop = watchLongPress(el, 10);
  touch(el, "touchstart", [at]);
  touch(el, "touchmove", [{ clientX: 90, clientY: 50 }]);
  touch(el, "touchstart", [at]);
  el.dispatchEvent(new Event("touchend"));
  touch(el, "touchstart", [at, at]);
  await Bun.sleep(30);
  expect(count()).toBe(0);
  stop();
});

test("a small wobble still counts as holding", async () => {
  const { el, count } = setup();
  const stop = watchLongPress(el, 10);
  touch(el, "touchstart", [at]);
  touch(el, "touchmove", [{ clientX: 54, clientY: 53 }]);
  await Bun.sleep(30);
  expect(count()).toBe(1);
  stop();
});
