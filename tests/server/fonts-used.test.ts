import { expect, test } from "bun:test";
import { fontsNote, recentFonts } from "../../src/server/fonts-used";

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
