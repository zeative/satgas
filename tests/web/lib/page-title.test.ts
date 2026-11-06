import "../../helpers/browser";
import { expect, test } from "bun:test";

const { pageTitle } = await import("../../../src/web/lib/page-title");

const board = { id: "abc", title: "Kopi Senja launch", prompt: "Launch it" };

test("names the page the tab is on", () => {
  expect(pageTitle("/")).toBe("Home · Satgas");
  expect(pageTitle("/integrations")).toBe("Integrations · Satgas");
  expect(pageTitle("/config/usage/")).toBe("Usage · Satgas");
  expect(pageTitle("/somewhere-else")).toBe("Satgas");
});

test("a board shows its own name and icon", () => {
  expect(pageTitle("/boards/abc", board)).toBe("Kopi Senja launch · Satgas");
  expect(pageTitle("/boards/abc", { ...board, icon: "☕" })).toBe("☕ Kopi Senja launch · Satgas");
});

test("a board with no name yet falls back to its request, kept short", () => {
  const prompt = `Build\n  a ${"very ".repeat(30)}long thing`;
  const title = pageTitle("/boards/abc", { id: "abc", prompt });
  expect(title.startsWith("Build a very")).toBe(true);
  expect(title.length).toBeLessThanOrEqual(60 + " · Satgas".length);
});

test("never shows the previous board's name while the next one loads", () => {
  expect(pageTitle("/boards/xyz", board)).toBe("Satgas");
  expect(pageTitle("/boards/abc", null)).toBe("Satgas");
});
