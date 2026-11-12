import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editLines } from "../../../src/server/agents/process";

test("an edit touches the lines its old text sits on, as many as its new text has", async () => {
  const dir = await mkdtemp(join(tmpdir(), "satgas-lines-"));
  const file = join(dir, "Hero.tsx");
  await writeFile(file, "a\nb\n<h1>Old</h1>\nc\n");
  expect(editLines("Edit", { file_path: file, old_string: "<h1>Old</h1>", new_string: "<h1>\n  New\n</h1>" })).toEqual([3, 5]);
  expect(editLines("Read", { file_path: file, offset: 2, limit: 2 })).toEqual([2, 3]);
  expect(editLines("Write", { file_path: file, content: "x" })).toBeUndefined();
  expect(editLines("Edit", { file_path: file, old_string: "missing", new_string: "x" })).toBeUndefined();
  await rm(dir, { recursive: true, force: true });
});
