import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { applyMemory, deleteEntry, getMemory, putEntry, setAuto, undoMemory } from "../../src/server/memory";
import { createRun, flushAll, getRun, patchRun } from "../../src/server/store";
import type { MemoryEntry } from "../../src/shared/memory";

const original = config.dataDir;
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-memory-"));
  await mkdir(join(dir, "runs"), { recursive: true });
  config.dataDir = dir;
});
afterAll(async () => {
  await flushAll();
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

test("the lead saves, refreshes and forgets entries, and a round's changes undo together", async () => {
  const run = createRun("x", dir);
  await applyMemory(run.id, 0, [
    { op: "rule", text: "Commits always in English", why: "they asked" },
    { op: "remember", type: "preference", text: "Replies in Indonesian" },
  ]);
  expect(getMemory().entries.map((e) => e.text)).toEqual(["Replies in Indonesian", "Commits always in English"]);
  expect(getRun(run.id)?.memories?.[0]?.changes.map((c) => c.op)).toEqual(["added", "added"]);
  expect((await stat(join(dir, "memory.json"))).mode & 0o777).toBe(0o600);

  // The same rule again is not a second entry; an update by id replaces it.
  const rule = getMemory().entries.find((e) => e.kind === "rule") as MemoryEntry;
  await applyMemory(run.id, 1, [
    { op: "rule", text: "commits always in english!" },
    { op: "rule", text: "Commits in English, one line", replaces: rule.id },
  ]);
  expect(
    getMemory()
      .entries.filter((e) => e.kind === "rule")
      .map((e) => e.text),
  ).toEqual(["Commits in English, one line"]);
  expect(await undoMemory(run.id, 1)).toBeNull();
  expect(getMemory().entries.find((e) => e.id === rule.id)?.text).toBe("Commits always in English");
  expect(await undoMemory(run.id, 1)).toBe("Already undone.");

  await applyMemory(run.id, 2, [{ op: "forget", id: rule.id }]);
  expect(getMemory().entries.some((e) => e.id === rule.id)).toBe(false);
  await undoMemory(run.id, 2);
  expect(getMemory().entries.some((e) => e.id === rule.id)).toBe(true);
  await undoMemory(run.id, 0);
  expect(getMemory().entries).toEqual([]);
});

test("nothing is learned with auto memory off, on a board that opted out, or when it is a secret", async () => {
  const run = createRun("x", dir);
  await setAuto(false);
  await applyMemory(run.id, 0, [{ op: "remember", type: "about", text: "Lives in Jakarta" }]);
  await setAuto(true);
  patchRun(run.id, { noMemory: true });
  await applyMemory(run.id, 0, [{ op: "remember", type: "about", text: "Lives in Jakarta" }]);
  patchRun(run.id, { noMemory: undefined });
  await applyMemory(run.id, 0, [{ op: "remember", type: "reference", text: "The key is sk-live-abcdefghijklmnop12" }]);
  expect(getMemory().entries).toEqual([]);
  expect(getRun(run.id)?.memories).toBeUndefined();
});

test("the person adds, edits and deletes their own entries", async () => {
  const made = await putEntry({ kind: "rule", text: "Tests live in tests/" });
  if (typeof made === "string") throw new Error(made);
  expect(made.source).toEqual({ by: "person" });
  const edited = await putEntry({ ...made, text: "Tests live in tests/, mirroring src/", enabled: false }, made.id);
  expect(edited).toMatchObject({ id: made.id, enabled: false, text: "Tests live in tests/, mirroring src/" });
  expect(await putEntry({ kind: "memory", text: "a" }, "missing")).toBe("That entry no longer exists.");
  expect(await deleteEntry(made.id)).toBe(true);
  expect(await deleteEntry(made.id)).toBe(false);
});

test("every change the lead makes shows in its activity", async () => {
  const { getLogs } = await import("../../src/server/store");
  const run = createRun("x", dir);
  await applyMemory(run.id, 0, [
    { op: "rule", text: "No emoji in the UI" },
    { op: "remember", type: "about", text: "Builds Satgas" },
  ]);
  const lines = (getLogs(run.id).planner ?? []).map((l) => l.text);
  expect(lines).toContain("Added rule: No emoji in the UI");
  expect(lines).toContain("Remembered: Builds Satgas");
  await undoMemory(run.id, 0);
  expect((getLogs(run.id).planner ?? []).at(-1)?.text).toBe("Undid what this round remembered");
});
