import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { forkRun, mergeBack, removeFork } from "../../src/server/forks";
import { git } from "../../src/server/git";
import { boardOps, createRun, flushAll, getRun, patchRun } from "../../src/server/store";
import type { Run } from "../../src/shared/types";

const original = config.dataDir;
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-forks-"));
  await mkdir(join(dir, "data", "runs"), { recursive: true });
  config.dataDir = join(dir, "data");
});
afterAll(async () => {
  await flushAll();
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

const note = (id: string, createdAt: number) => ({ id, kind: "note" as const, x: 0, y: 0, w: 200, h: 120, text: id, createdAt });

test("a plain folder forks as a copy, and merging back brings changes but leaves files both sides changed", async () => {
  const folder = join(dir, "plain");
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "a.txt"), "a");
  await writeFile(join(folder, "b.txt"), "b");
  await writeFile(join(folder, "c.txt"), "c");
  const src = createRun("build it", folder);
  patchRun(src.id, { status: "done", title: "Landing page", nodes: [] });
  boardOps(src.id, [{ op: "put", card: note("old", 1) }]);

  const fork = (await forkRun(src.id)) as Run;
  expect(fork.title).toBe("Landing page (fork)");
  expect(fork.forkOf?.id).toBe(src.id);
  expect(fork.cwd).not.toBe(folder);
  expect(await Bun.file(join(fork.cwd, "a.txt")).text()).toBe("a");

  await writeFile(join(fork.cwd, "a.txt"), "a from fork");
  await writeFile(join(fork.cwd, "new.txt"), "new");
  await rm(join(fork.cwd, "c.txt"));
  await writeFile(join(fork.cwd, "b.txt"), "b from fork");
  await writeFile(join(folder, "b.txt"), "b from original");
  boardOps(fork.id, [{ op: "put", card: note("fresh", Date.now() + 1) }]);

  const result = await mergeBack(fork.id);
  if (typeof result === "string") throw new Error(result);
  expect(result.applied.sort()).toEqual(["a.txt", "c.txt", "new.txt"]);
  expect(result.conflicts).toEqual(["b.txt"]);
  expect(result.cards).toBe(1);
  expect(await Bun.file(join(folder, "a.txt")).text()).toBe("a from fork");
  expect(await Bun.file(join(folder, "new.txt")).text()).toBe("new");
  expect(await Bun.file(join(folder, "c.txt")).exists()).toBe(false);
  expect(await Bun.file(join(folder, "b.txt")).text()).toBe("b from original");
  expect(
    getRun(src.id)
      ?.board?.cards.map((c) => c.id)
      .sort(),
  ).toEqual(["fresh", "old"]);

  // A second merge brings only what changed since the first.
  const again = await mergeBack(fork.id);
  if (typeof again === "string") throw new Error(again);
  expect(again.applied).toEqual([]);
  expect(again.cards).toBe(0);
  expect(await mergeBack(src.id)).toBe("This board is not a fork.");
});

test("a repository forks as a worktree on its own branch, carrying uncommitted changes", async () => {
  const repo = join(dir, "repo");
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "app.ts"), "v1");
  await git(repo, ["init", "-q", "-b", "main"]);
  await git(repo, ["add", "-A"]);
  await git(repo, ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "-m", "start"]);
  await writeFile(join(repo, "app.ts"), "v2 uncommitted");
  await writeFile(join(repo, "draft.md"), "draft");
  const src = createRun("work", repo);
  patchRun(src.id, { status: "done" });

  const fork = (await forkRun(src.id)) as Run;
  expect(fork.forkOf?.branch).toStartWith("satgas/fork-");
  expect(await Bun.file(join(fork.cwd, "app.ts")).text()).toBe("v2 uncommitted");
  expect(await Bun.file(join(fork.cwd, "draft.md")).text()).toBe("draft");
  expect((await git(fork.cwd, ["branch", "--show-current"])).out).toBe(fork.forkOf?.branch ?? "");

  await removeFork(fork);
  expect(await Bun.file(join(fork.cwd, "app.ts")).exists()).toBe(false);
  expect((await git(repo, ["worktree", "list"])).out.split("\n")).toHaveLength(1);
});
