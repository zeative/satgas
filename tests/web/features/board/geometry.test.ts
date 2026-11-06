import { describe, expect, test } from "bun:test";
import { dragBox, lockAngle, snapBox } from "../../../../src/web/features/board/geometry";

describe("dragBox", () => {
  test("drags from the press point and flips up or left", () => {
    expect(dragBox({ x: 10, y: 10 }, { x: 110, y: 60 })).toEqual({ x: 10, y: 10, w: 100, h: 50 });
    expect(dragBox({ x: 10, y: 10 }, { x: -40, y: -20 })).toEqual({ x: -40, y: -20, w: 50, h: 30 });
  });
  test("Shift keeps it square, the longer side winning", () => {
    expect(dragBox({ x: 0, y: 0 }, { x: 100, y: 40 }, { square: true })).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(dragBox({ x: 0, y: 0 }, { x: -30, y: 80 }, { square: true })).toEqual({ x: -80, y: 0, w: 80, h: 80 });
  });
  test("Alt grows it from the centre", () => {
    expect(dragBox({ x: 50, y: 50 }, { x: 70, y: 60 }, { center: true })).toEqual({ x: 30, y: 40, w: 40, h: 20 });
  });
});

test("Shift on a line locks it to 15° steps", () => {
  const end = lockAngle({ x: 0, y: 0 }, { x: 100, y: 4 });
  expect(Math.round(end.x)).toBe(100);
  expect(Math.round(end.y)).toBe(0);
  const diag = lockAngle({ x: 0, y: 0 }, { x: 100, y: 96 });
  expect(Math.round(diag.x)).toBe(Math.round(diag.y));
});

describe("snapBox", () => {
  const other = { x: 200, y: 0, w: 100, h: 100 };
  test("lines up edges within the tolerance and says where", () => {
    const r = snapBox({ x: 0, y: 4, w: 100, h: 100 }, [other], 8);
    expect(r.dy).toBe(-4);
    expect(r.dx).toBe(0);
    expect(r.guides.some((g) => g.axis === "y" && g.at === 0 && g.from === 0 && g.to === 300)).toBe(true);
  });
  test("lines up centres", () => {
    const r = snapBox({ x: 203, y: 300, w: 100, h: 40 }, [other], 8);
    expect(r.dx).toBe(-3);
    expect(r.guides.some((g) => g.axis === "x" && g.at === 250)).toBe(true);
  });
  test("leaves a box alone when nothing is near", () => {
    expect(snapBox({ x: 0, y: 500, w: 50, h: 50 }, [{ x: 400, y: 0, w: 10, h: 10 }], 8)).toEqual({ dx: 0, dy: 0, guides: [] });
  });
});
