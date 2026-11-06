import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { cleanBoard, remakeable, storageReport } from "../../src/server/housekeeping";
import { createRun, flushAll, patchRun } from "../../src/server/store";

const original = config.dataDir;
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-housekeeping-"));
  await mkdir(join(dir, "runs"), { recursive: true });
  config.dataDir = dir;
});
afterAll(async () => {
  await flushAll();
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

async function workspace(name: string) {
  const cwd = join(dir, "workspaces", name);
  await Bun.write(join(cwd, "src/app.ts"), "keep me");
  await Bun.write(join(cwd, "dist/index.html"), "maybe the result itself");
  await Bun.write(join(cwd, "node_modules/x/index.js"), "x".repeat(8192));
  await Bun.write(join(cwd, "packages/web/.next/cache"), "y".repeat(8192));
  return cwd;
}

test("cleaning takes what can be made again and nothing else", async () => {
  const cwd = await workspace("a");
  const run = createRun("build", cwd);
  patchRun(run.id, { status: "done" });
  const freed = await cleanBoard(run.id);
  expect(typeof freed === "number" && freed > 0).toBe(true);
  expect(await Bun.file(join(cwd, "src/app.ts")).exists()).toBe(true);
  expect(await Bun.file(join(cwd, "dist/index.html")).exists()).toBe(true);
  expect(await Bun.file(join(cwd, "node_modules/x/index.js")).exists()).toBe(false);
  expect(await Bun.file(join(cwd, "packages/web/.next/cache")).exists()).toBe(false);
});

test("a folder the person picked and a board at work are refused", async () => {
  const mine = join(dir, "my-project");
  await Bun.write(join(mine, "node_modules/x/index.js"), "x");
  const picked = createRun("build", mine);
  expect(await cleanBoard(picked.id)).toContain("your own folder");
  expect(await Bun.file(join(mine, "node_modules/x/index.js")).exists()).toBe(true);

  const cwd = await workspace("busy");
  const busy = createRun("build", cwd);
  patchRun(busy.id, { status: "running" });
  expect(await cleanBoard(busy.id)).toContain("working right now");
  expect(await Bun.file(join(cwd, "node_modules/x/index.js")).exists()).toBe(true);
  expect(await cleanBoard("nope")).toBe("Board not found.");
});

test("a link to the person's node_modules is not followed, or it would delete their install", async () => {
  const theirs = join(dir, "their-project");
  await Bun.write(join(theirs, "node_modules/y/index.js"), "y");
  const cwd = join(dir, "workspaces", "linked");
  await mkdir(cwd, { recursive: true });
  await symlink(join(theirs, "node_modules"), join(cwd, "node_modules"));
  expect(await remakeable(cwd)).toEqual([]);
});

test("the report names sizes by kind and counts boards in picked folders without measuring them", async () => {
  await workspace("measured");
  const measured = createRun("build", join(dir, "workspaces", "measured"));
  const report = await storageReport(true);
  expect(report.total).toBeGreaterThan(0);
  expect(report.kinds.some((k) => k.kind === "workspaces")).toBe(true);
  const row = report.boards.find((b) => b.id === measured.id);
  expect(row?.cleanable).toBeGreaterThan(0);
  expect(row?.bytes).toBeGreaterThanOrEqual(row?.cleanable ?? 0);
  expect(report.ownFolders).toBeGreaterThan(0);
  expect(report.boards.every((b) => !b.title.includes("my-project"))).toBe(true);
});
