import { expect, test } from "bun:test";
import { setCanvasMoving, useCanvasMoving } from "../../../src/web/stores/frames";

// Every live page listens to this flag, so it must only change when the canvas really starts or stops moving.
test("the canvas moving flag only notifies on a real change", () => {
  let calls = 0;
  const off = useCanvasMoving.subscribe(() => calls++);
  setCanvasMoving(true);
  setCanvasMoving(true);
  setCanvasMoving(false);
  setCanvasMoving(false);
  off();
  expect(calls).toBe(2);
  expect(useCanvasMoving.getState().moving).toBe(false);
});
