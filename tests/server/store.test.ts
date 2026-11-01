import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { appendLog, createRun, deleteRun, flushAll, getLogs, getRun, listRuns, loadRuns, patchRun } from "../../src/server/store";
import type { Run } from "../../src/shared/types";

let dir = "";
const originalDir = config.dataDir;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-store-"));
  config.dataDir = dir;
  await mkdir(join(dir, "runs"), { recursive: true });
  const interrupted: Run = {
    id: "live1",
    prompt: "was running",
    cwd: "/w",
    status: "running",
    createdAt: 1,
    nodes: [
      { id: "a", title: "A", role: "r", agent: "claude", task: "t", dependsOn: [], status: "running", x: 0, y: 0 },
      { id: "b", title: "B", role: "r", agent: "claude", task: "t", dependsOn: ["a"], status: "done", x: 0, y: 0 },
    ],
  };
  await Bun.write(join(dir, "runs", "live1.json"), JSON.stringify({ run: interrupted, logs: {} }));
  await Bun.write(join(dir, "runs", "broken.json"), "{not json");
  await loadRuns();
});

afterAll(async () => {
  config.dataDir = originalDir;
  await rm(dir, { recursive: true, force: true });
});

test("a run that was live when the server stopped is never shown as running", () => {
  const run = getRun("live1");
  expect(run?.status).toBe("failed");
  expect(run?.error).toContain("server stopped");
  expect(run?.nodes.map((n) => n.status)).toEqual(["cancelled", "done"]);
});

test("a corrupt run file does not block startup", () => {
  expect(listRuns().map((r) => r.id)).toContain("live1");
});

test("runs, patches and logs are persisted to disk on flush", async () => {
  const run = createRun("new mission", "/w");
  patchRun(run.id, { status: "done", title: "Done mission" });
  appendLog(run.id, "planner", { kind: "info", text: "hello" });
  expect(getLogs(run.id).planner?.map((l) => l.text)).toEqual(["hello"]);
  await flushAll();
  const saved = await Bun.file(join(dir, "runs", `${run.id}.json`)).json();
  expect(saved.run.title).toBe("Done mission");
  expect(saved.logs.planner[0].text).toBe("hello");
});

test("deleting a mission removes it from memory and disk", async () => {
  const run = createRun("to delete", "/w");
  await flushAll();
  const file = join(dir, "runs", `${run.id}.json`);
  expect(await Bun.file(file).exists()).toBe(true);
  expect(await deleteRun(run.id)).toBe(true);
  expect(getRun(run.id)).toBeUndefined();
  expect(await Bun.file(file).exists()).toBe(false);
  expect(await deleteRun(run.id)).toBe(false);
});

test("log lines carry an increasing per-run sequence", () => {
  const run = createRun("seq", "/w");
  appendLog(run.id, "a", { kind: "info", text: "one" });
  appendLog(run.id, "b", { kind: "info", text: "two" });
  const all = getLogs(run.id);
  expect([all.a?.[0]?.seq, all.b?.[0]?.seq]).toEqual([1, 2]);
});
