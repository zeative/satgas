import { expect, test } from "bun:test";
import { unionRect, viewportFor, zoomAround } from "../../../../src/web/features/board/frame";

const inset = { top: 64, left: 72, bottom: 96, right: 468 };

test("a small board at the zoom cap is centred in the part the panel leaves visible", () => {
  const b = { x: 0, y: 0, width: 400, height: 300 };
  const v = viewportFor(b, 1785, 900, 0.2, 1, inset);
  expect(v.zoom).toBe(1);
  // Middle of the uncovered strip: (72 + (1785 - 468)) / 2.
  expect(v.x + (b.width / 2) * v.zoom).toBe((72 + 1785 - 468) / 2);
  expect(v.y + (b.height / 2) * v.zoom).toBe((64 + 900 - 96) / 2);
});

test("a large board shrinks to fit inside the uncovered area", () => {
  const b = { x: -500, y: -200, width: 5000, height: 1000 };
  const v = viewportFor(b, 1785, 900, 0.2, 1, inset);
  expect(b.x * v.zoom + v.x).toBeGreaterThanOrEqual(72 - 1e-9);
  expect((b.x + b.width) * v.zoom + v.x).toBeLessThanOrEqual(1785 - 468 + 1e-9);
});

test("zooming around a point keeps that point still", () => {
  const view = { x: 100, y: 50, zoom: 0.5 };
  const next = zoomAround(view, 1, 400, 300);
  // The board point under (400, 300) before is still under it after.
  expect((400 - view.x) / view.zoom).toBeCloseTo((400 - next.x) / next.zoom);
  expect((300 - view.y) / view.zoom).toBeCloseTo((300 - next.y) / next.zoom);
});

test("union of rects", () => {
  expect(unionRect([])).toBeNull();
  expect(
    unionRect([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: -5, y: 20, width: 10, height: 5 },
    ]),
  ).toEqual({ x: -5, y: 0, width: 15, height: 25 });
});
