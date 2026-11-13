import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { displayFaces, fontsNote, recentFonts } from "../../src/server/fonts-used";

// Telling a task what other builds chose keeps a short list of good fonts from becoming the new default.
test("the note names the faces other builds used, and says nothing when there are none", () => {
  expect(fontsNote([])).toBe("");
  const note = fontsNote(["Archivo", "Satoshi"]);
  expect(note).toContain("Archivo, Satoshi");
  expect(note).toContain("picks different faces");
});

test("boards without an app are skipped, not read", () => {
  expect(() => recentFonts()).not.toThrow();
});

test("the display face is read from each app's own stylesheet, and names that are not faces are left out", () => {
  const cwd = mkdtempSync(join(tmpdir(), "satgas-fonts-"));
  mkdirSync(join(cwd, "web", "src"), { recursive: true });
  writeFileSync(join(cwd, "web", "src", "index.css"), `:root{--font-display:"Clash Display", sans-serif;--font-sans:Satoshi;}`);
  const app = { name: "web", command: "", dir: "web", path: "/apps/r/k/web/", status: "running" as const };
  expect(displayFaces({ cwd, apps: { web: app } })).toEqual(["Clash Display"]);
  writeFileSync(join(cwd, "web", "src", "index.css"), `:root{--font-display:var(--font-sans);}`);
  expect(displayFaces({ cwd, apps: { web: app } })).toEqual([]);
  expect(displayFaces({ cwd })).toEqual([]);
});
