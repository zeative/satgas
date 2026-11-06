import { expect, test } from "bun:test";
import { readZip } from "../../src/server/zip";
import { makeZip } from "../helpers/zip";

test("reads stored and deflated entries", () => {
  for (const deflate of [true, false]) {
    const files = readZip(makeZip({ "a/SKILL.md": "---\nname: a\n---\nhello", "a/notes.txt": "x".repeat(500) }, deflate));
    expect(new TextDecoder().decode(files.get("a/SKILL.md"))).toBe("---\nname: a\n---\nhello");
    expect(files.get("a/notes.txt")?.length).toBe(500);
  }
});

test("refuses what is not a zip, and archives over the limits", () => {
  expect(() => readZip(new TextEncoder().encode("plain text, no zip here at all"))).toThrow("This is not a zip file.");
  expect(() => readZip(makeZip({ a: "1", b: "2" }), { files: 1, bytes: 1e6 })).toThrow("more than 1 files");
  expect(() => readZip(makeZip({ a: "x".repeat(100) }), { files: 10, bytes: 10 })).toThrow("50 MB");
});
