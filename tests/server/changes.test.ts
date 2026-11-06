import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changes, snapshot } from "../../src/server/changes";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-changes-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("finds what the shell added, changed and deleted, and skips hidden and dependency folders", async () => {
  await writeFile(join(dir, "keep.txt"), "same");
  await writeFile(join(dir, "edit.txt"), "old");
  await writeFile(join(dir, "gone.txt"), "bye");
  const before = await snapshot(dir);
  if (!before) throw new Error("no snapshot");

  await writeFile(join(dir, "edit.txt"), "new and longer");
  await rm(join(dir, "gone.txt"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src/app.ts"), "export {}");
  for (const skipped of [".git", "node_modules"]) {
    await mkdir(join(dir, skipped));
    await writeFile(join(dir, skipped, "x"), "x");
  }
  // Same size, newer time: still a change.
  await utimes(join(dir, "keep.txt"), new Date(), new Date(Date.now() + 5000));

  const after = await snapshot(dir);
  if (!after) throw new Error("no snapshot");
  expect(Object.fromEntries([...changes(before, after)].map(([p, c]) => [p.slice(dir.length + 1), c]))).toEqual({
    "edit.txt": "modified",
    "keep.txt": "modified",
    "src/app.ts": "added",
    "gone.txt": "deleted",
  });
});
