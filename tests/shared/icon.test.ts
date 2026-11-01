import { expect, test } from "bun:test";
import { cleanIcon } from "../../src/shared/types";

test("a board icon is one emoji, or nothing", () => {
  expect(cleanIcon("🚀")).toBe("🚀");
  expect(cleanIcon("👩🏽‍💻")).toBe("👩🏽‍💻");
  expect(cleanIcon("")).toBe("");
  expect(cleanIcon(null)).toBe("");
});

test("text, numbers and long strings are refused", () => {
  expect(cleanIcon("hi")).toBeNull();
  expect(cleanIcon("🚀 launch")).toBeNull();
  expect(cleanIcon("1")).toBeNull();
  expect(cleanIcon("🚀".repeat(10))).toBeNull();
  expect(cleanIcon(42)).toBeNull();
});
