import { expect, test } from "bun:test";
import { cleanTitle } from "../../src/shared/types";

test("a board name is one trimmed line of at most 80 characters", () => {
  expect(cleanTitle("  Rencana\n konten   Q1 ")).toBe("Rencana konten Q1");
  expect(cleanTitle("x".repeat(100))).toHaveLength(80);
  expect(cleanTitle("   ")).toBeNull();
  expect(cleanTitle(42)).toBeNull();
});
