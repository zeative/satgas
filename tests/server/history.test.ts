import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { dropBranch, git, gitInfo, mergeBranch } from "../../src/server/git";
import { checkpoint, fileAt, historyDir, patchBetween, revertTask } from "../../src/server/history";
import type { TaskChanges } from "../../src/shared/types";

const original = config.dataDir;
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-history-"));
  config.dataDir = join(dir, "data");
});
afterAll(async () => {
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

test("a task's diff and undo work in a plain folder, and a later edit is never thrown away silently", async () => {
  const folder = join(dir, "plain");
  await mkdir(join(folder, "node_modules"), { recursive: true });
  await writeFile(join(folder, "app.ts"), "const a = 1;\n");
  await writeFile(join(folder, "node_modules", "big.js"), "x");
  const run = { id: "p1", cwd: folder };
  const before = await checkpoint(run, "before t1");
  await writeFile(join(folder, "app.ts"), "const a = 2;\n");
  await writeFile(join(folder, "new.ts"), "export {};\n");
  const after = await checkpoint(run, "after t1");
  if (!before || !after) throw new Error("no checkpoint");
  const changes: TaskChanges = {
    before,
    after,
    files: [
      { path: "app.ts", change: "modified" },
      { path: "new.ts", change: "added" },
    ],
  };
  const d = await patchBetween(run, before, after, ["app.ts"]);
  expect(d?.patch).toContain("-const a = 1;");
  expect(d?.patch).toContain("+const a = 2;");
  expect(await fileAt(run, before, "app.ts")).toBe("const a = 1;\n");
  expect(await fileAt(run, "now", "app.ts")).toBe("const a = 2;\n");
  expect(await fileAt(run, "now", "../etc/passwd")).toBeNull();
  expect(await fileAt(run, "HEAD; rm -rf", "app.ts")).toBeNull();
  // The excluded folder never enters the history.
  expect((await git(folder, ["--git-dir", historyDir("p1"), "ls-files"])).out.split("\n").sort()).toEqual(["app.ts", "new.ts"]);

  await writeFile(join(folder, "app.ts"), "const a = 3;\n");
  expect(await revertTask(run, changes, ["app.ts", "new.ts"], false)).toEqual({ reverted: [], changedSince: ["app.ts"] });
  expect(await revertTask(run, changes, ["new.ts"], false)).toEqual({ reverted: ["new.ts"], changedSince: [] });
  expect(await Bun.file(join(folder, "new.ts")).exists()).toBe(false);
  expect(await revertTask(run, changes, ["app.ts"], true)).toEqual({ reverted: ["app.ts"], changedSince: ["app.ts"] });
  expect(await Bun.file(join(folder, "app.ts")).text()).toBe("const a = 1;\n");
});

test("in a repository the history stays apart from the person's git, and the Git tab reads it", async () => {
  const repo = join(dir, "repo");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "a.txt"), "a\n");
  await git(repo, ["init", "-q", "-b", "main"]);
  await git(repo, ["add", "-A"]);
  await git(repo, ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "-m", "feat: start"]);
  const run = { id: "r1", cwd: repo };
  expect(await checkpoint(run, "before")).toBeTruthy();
  expect((await git(repo, ["log", "--format=%s"])).out).toBe("feat: start");
  expect((await git(repo, ["status", "--porcelain"])).out).toBe("");

  await git(repo, ["checkout", "-q", "-b", "satgas/r1/t1"]);
  await writeFile(join(repo, "b.txt"), "b\n");
  await git(repo, ["add", "-A"]);
  await git(repo, ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "-m", "feat: b"]);
  await git(repo, ["checkout", "-q", "main"]);
  const info = await gitInfo(repo);
  expect(info).toMatchObject({ repo: true, branch: "main", dirty: 0 });
  expect(info.commits?.[0]?.subject).toBe("feat: start");
  expect(info.branches).toEqual([{ name: "satgas/r1/t1", merged: false, at: expect.any(Number) }]);
  expect(await mergeBranch(repo, "main")).toBe("Only branches Satgas made can be merged here.");
  expect(await mergeBranch(repo, "satgas/r1/t1")).toBeNull();
  expect(await Bun.file(join(repo, "b.txt")).text()).toBe("b\n");
  expect((await gitInfo(repo)).branches).toEqual([]);
  expect(await dropBranch(repo, "satgas/none")).toBeTruthy();
  expect(await gitInfo(dir)).toEqual({ repo: false });
});

test("one patch covers many files, up to the folder as it is now", async () => {
  const folder = join(dir, "patch");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "a.ts"), "a1\n");
  const run = { id: "pp", cwd: folder };
  const before = await checkpoint(run, "before");
  await writeFile(join(folder, "a.ts"), "a2\n");
  await writeFile(join(folder, "b.ts"), "b\n");
  const after = await checkpoint(run, "after");
  if (!before || !after) throw new Error("no checkpoint");
  const between = await patchBetween(run, before, after, ["a.ts", "b.ts"]);
  expect(between?.patch).toContain("+a2");
  expect(between?.patch).toContain("+++ b/b.ts");
  // Edited again after the task: the review to now shows the latest content.
  await writeFile(join(folder, "a.ts"), "a3\n");
  expect((await patchBetween(run, before, null, ["a.ts"]))?.patch).toContain("+a3");
  expect(await patchBetween(run, before, null, [])).toEqual({ patch: "", cut: false });
});
