import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import {
  appendLog,
  createRun,
  deleteRun,
  dropFileLists,
  flushAll,
  getLogs,
  getRun,
  listRuns,
  loadRuns,
  ownWorkspace,
  patchRun,
} from "../../src/server/store";
import type { Card } from "../../src/shared/board";
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
  const line = (seq: number) => ({ seq, t: 1, kind: "info", text: `line ${seq}` });
  await Bun.write(
    join(dir, "runs", "live1.json"),
    JSON.stringify({ run: interrupted, logs: { planner: [line(3), line(9)], a: [line(6)] } }),
  );
  await Bun.write(join(dir, "runs", "broken.json"), "{not json");
  await Bun.write(join(dir, "runs", "live1.json.4f2a.tmp"), "{half");
  await loadRuns();
});

afterAll(async () => {
  // Saves still waiting on their timer would otherwise land in the real data folder.
  await flushAll();
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

test("log numbering continues after a restart, so the client does not drop new lines as already seen", () => {
  appendLog("live1", "a", { kind: "info", text: "after restart" });
  expect(getLogs("live1").a?.at(-1)?.seq).toBe(10);
});

test("a temp file left by an interrupted write is cleaned up on load", async () => {
  expect(await Bun.file(join(dir, "runs", "live1.json.4f2a.tmp")).exists()).toBe(false);
});

test("run files are written whole and private, and the data folder is private", async () => {
  const run = createRun("private", "/w");
  await flushAll();
  expect((await readdir(join(dir, "runs"))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  expect((await stat(join(dir, "runs", `${run.id}.json`))).mode & 0o777).toBe(0o600);
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
});

test("a flush waits for a save that is already under way", async () => {
  const run = createRun("in flight", "/w");
  patchRun(run.id, { title: "Latest" });
  void flushAll();
  await flushAll();
  expect((await Bun.file(join(dir, "runs", `${run.id}.json`)).json()).run.title).toBe("Latest");
});

test("a save under way cannot bring a deleted mission back", async () => {
  const run = createRun("deleted mid-write", "/w");
  void flushAll();
  await deleteRun(run.id);
  await Bun.sleep(20);
  expect(await Bun.file(join(dir, "runs", `${run.id}.json`)).exists()).toBe(false);
});

test("deleting a board removes its own workspace but never a folder picked elsewhere", async () => {
  const own = join(dir, "workspaces", "ownws01");
  const picked = join(dir, "picked");
  await mkdir(own, { recursive: true });
  await mkdir(picked, { recursive: true });
  await Bun.write(join(own, "index.html"), "made by an agent");
  await Bun.write(join(picked, "keep.txt"), "mine");
  expect(ownWorkspace(own)).toBe(true);
  expect(ownWorkspace(join(dir, "workspaces"))).toBe(false);
  expect(ownWorkspace(picked)).toBe(false);
  expect(ownWorkspace(join(dir, "workspaces", "..", "picked"))).toBe(false);

  const a = createRun("own", own, "ownws01");
  const b = createRun("picked", picked);
  await deleteRun(a.id);
  await deleteRun(b.id);
  expect(
    await stat(own).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  expect(
    await stat(join(picked, "keep.txt")).then(
      () => true,
      () => false,
    ),
  ).toBe(true);
});

test("keeps saving when a scheduled save is long overdue, as when timers stop firing", async () => {
  const run = createRun("stall", "/w");
  await flushAll();
  patchRun(run.id, { title: "first" });
  const realNow = Date.now;
  Date.now = () => realNow() + 10_000;
  try {
    patchRun(run.id, { title: "second" });
  } finally {
    Date.now = realNow;
  }
  // Written at once, well before the half-second timer would have fired.
  await Bun.sleep(80);
  const saved = await Bun.file(join(dir, "runs", `${run.id}.json`)).json();
  expect(saved.run.title).toBe("second");
});

test("a board from before file lists left the canvas loses them, and no file is forgotten", () => {
  const list = (id: string, from: string) =>
    ({ id, kind: "files", x: 0, y: 0, w: 300, h: 200, from, files: [{ path: "a.ts", change: "added" }], createdAt: 1 }) as Card;
  const note = { id: "n", kind: "note", x: 0, y: 0, w: 1, h: 1, createdAt: 1 } as Card;
  const known = [{ path: "b.ts", change: "modified" as const }];
  const run = {
    nodes: [{ id: "old" }, { id: "new", changes: { files: known } }],
    board: {
      cards: [list("l1", "old"), list("l2", "new"), note],
      links: [
        { id: "x", source: "l1", target: "n" },
        { id: "y", source: "n", target: "n2" },
      ],
      moved: {},
    },
  } as unknown as Run;
  dropFileLists(run);
  expect(run.board?.cards.map((c) => c.id)).toEqual(["n"]);
  expect(run.board?.links.map((l) => l.id)).toEqual(["y"]);
  expect(run.nodes[0]?.changes?.files).toEqual([{ path: "a.ts", change: "added" }]);
  expect(run.nodes[1]?.changes?.files).toEqual(known);
});

// `bun --hot` loads the runs again while missions work; it once replaced live logs with the file's older copy.
test("loading again keeps what is in memory, so a running mission's newest log lines survive", async () => {
  const run = createRun("still working", "/w");
  patchRun(run.id, { status: "running" });
  appendLog(run.id, "task", { kind: "info", text: "only in memory" });
  await flushAll();
  appendLog(run.id, "task", { kind: "info", text: "after the last save" });
  await loadRuns();
  expect(getRun(run.id)?.status).toBe("running");
  expect(getLogs(run.id).task?.map((l) => l.text)).toEqual(["only in memory", "after the last save"]);
});
