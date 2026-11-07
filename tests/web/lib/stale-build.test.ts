import { afterEach, beforeEach, expect, test } from "bun:test";
import { isStaleBuild, reloadForNewBuild } from "../../../src/web/lib/stale-build";

const g = globalThis as { window?: unknown };
const before = g.window;
let reloads = 0;
beforeEach(() => {
  reloads = 0;
  g.window = { location: { reload: () => reloads++ } };
});
afterEach(() => {
  g.window = before;
});

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test("the errors an old build throws after an update are told apart from real failures", () => {
  expect(isStaleBuild(new TypeError("'text/html' is not a valid JavaScript MIME type."))).toBe(true);
  expect(isStaleBuild(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
  expect(isStaleBuild(new Error("Importing a module script failed."))).toBe(true);
  expect(isStaleBuild(new Error("Cannot read properties of undefined"))).toBe(false);
});

test("it reloads once, and not again right away, so a real failure cannot loop", () => {
  const s = store();
  expect(reloadForNewBuild(s, 1_000_000)).toBe(true);
  expect(reloadForNewBuild(s, 1_010_000)).toBe(false);
  expect(reloadForNewBuild(s, 1_040_000)).toBe(true);
  expect(reloads).toBe(2);
});
