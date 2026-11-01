import { expect, test } from "bun:test";
import { keyedSrc } from "../../../../src/web/features/board/context";

test("keyedSrc routes a board's own files through its key and leaves everything else alone", () => {
  expect(keyedSrc("/api/runs/r1/files/site/index.html", "r1", "K")).toBe("/api/runs/r1/files/~K/site/index.html");
  expect(keyedSrc("/api/runs/r1/files/~K/a.png", "r1", "K")).toBe("/api/runs/r1/files/~K/a.png");
  expect(keyedSrc("/api/runs/r2/files/a.png", "r1", "K")).toBe("/api/runs/r2/files/a.png");
  expect(keyedSrc("/api/runs/r1/assets/a.png", "r1", "K")).toBe("/api/runs/r1/assets/a.png");
  expect(keyedSrc("/api/runs/r1/files/a.png", "r1", undefined)).toBe("/api/runs/r1/files/a.png");
  expect(keyedSrc(undefined, "r1", "K")).toBeUndefined();
});
