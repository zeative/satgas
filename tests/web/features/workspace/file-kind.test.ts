import { expect, test } from "bun:test";
import { fileKind, looksBinary } from "../../../../src/web/features/workspace/file-kind";

test("names how each kind of file is shown, whatever the case of its extension", () => {
  expect(fileKind("design/refs/a.JPG")).toBe("image");
  expect(fileKind("logo.svg")).toBe("svg");
  expect(fileKind("out/deck.pdf")).toBe("pdf");
  expect(fileKind("demo.mov")).toBe("video");
  expect(fileKind("voice.m4a")).toBe("audio");
});

test("anything else is read as text, including a name that only contains an extension", () => {
  expect(fileKind("src/index.ts")).toBe("text");
  expect(fileKind("notes.png.md")).toBe("text");
  expect(fileKind("Makefile")).toBe("text");
});

test("a NUL marks a file as binary, and only near its start", () => {
  expect(looksBinary("PK\u0003\u0004\0\0")).toBe(true);
  expect(looksBinary("plain text, in bahasa juga")).toBe(false);
  expect(looksBinary(`${"a".repeat(9000)}\0`)).toBe(false);
});
