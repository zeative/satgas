import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { dropBoardBranches, git } from "../../src/server/git";
import { closeTree, inFolder, openTree, treesFor } from "../../src/server/worktrees";
import type { NodeState, Run } from "../../src/shared/types";

const original = config.dataDir;
let dir = "";
let repo = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-trees-"));
  config.dataDir = join(dir, "data");
  repo = join(dir, "repo");
  await Bun.write(join(repo, "a.txt"), "one\n");
  await git(repo, ["init", "-q", "-b", "main"]);
  await git(repo, ["-c", "user.name=T", "-c", "user.email=t@t", "add", "-A"]);
  await git(repo, ["-c", "user.name=T", "-c", "user.email=t@t", "commit", "-q", "-m", "feat: start"]);
});
afterAll(async () => {
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

const run = () => ({ id: "r1", cwd: repo }) as Run;
const node = (id: string, title = `Task ${id}`, access?: "read") =>
  ({ id, title, role: "dev", agent: "claude", task: "", dependsOn: [], status: "running", x: 0, y: 0, access }) as NodeState;
const noLog = () => {};

test("only a clean repository with two writing tasks works on branches", async () => {
  expect(await treesFor(run(), [node("a"), node("b")], noLog)).toBe(true);
  expect(await treesFor(run(), [node("a"), node("b", "B", "read")], noLog)).toBe(false);
  const lines: string[] = [];
  await writeFile(join(repo, "dirty.txt"), "x");
  expect(await treesFor(run(), [node("a"), node("b")], (l) => lines.push(l.text))).toBe(false);
  expect(lines[0]).toContain("uncommitted changes");
  await rm(join(repo, "dirty.txt"));
  expect(await treesFor({ id: "r1", cwd: dir } as Run, [node("a"), node("b")], noLog)).toBe(false);
});

test("two tasks on their own branches both land in the folder as commits", async () => {
  const a = await openTree(run(), node("a", "Add billing page"), noLog);
  const b = await openTree(run(), node("b", "Fix login bug"), noLog);
  if (!a || !b) throw new Error("no tree");
  await Bun.write(join(a.dir, "billing.txt"), "billing\n");
  await Bun.write(join(b.dir, "login.txt"), "login\n");
  expect(await closeTree(run(), node("a", "Add billing page"), a, true, noLog)).toEqual({ merged: true });
  expect(await closeTree(run(), node("b", "Fix login bug"), b, true, noLog)).toEqual({ merged: true });
  expect(await Bun.file(join(repo, "billing.txt")).text()).toBe("billing\n");
  expect(await Bun.file(join(repo, "login.txt")).text()).toBe("login\n");
  // The repository's commits are conventional, so Satgas's own messages follow suit.
  const log = await git(repo, ["log", "--format=%s"]);
  expect(log.out).toContain("feat: add billing page");
  expect(log.out).toContain("fix: fix login bug");
  expect((await git(repo, ["branch", "--list", "satgas/*"])).out).toBe("");
  expect((await git(repo, ["status", "--porcelain"])).out).toBe("");
});

test("clashing edits keep the second branch and name the conflict", async () => {
  const a = await openTree(run(), node("c"), noLog);
  const b = await openTree(run(), node("d"), noLog);
  if (!a || !b) throw new Error("no tree");
  await Bun.write(join(a.dir, "a.txt"), "from c\n");
  await Bun.write(join(b.dir, "a.txt"), "from d\n");
  expect((await closeTree(run(), node("c"), a, true, noLog)).merged).toBe(true);
  const end = await closeTree(run(), node("d"), b, true, noLog);
  expect(end.merged).toBe(false);
  if (end.merged) return;
  expect(end.conflicts).toEqual(["a.txt"]);
  expect((await git(repo, ["branch", "--list", end.branch ?? ""])).out).toContain("satgas/");
  expect(await Bun.file(join(repo, "a.txt")).text()).toBe("from c\n");
  expect((await git(repo, ["status", "--porcelain"])).out).toBe("");
});

test("a task that stopped keeps its work on its branch; one that changed nothing leaves no branch", async () => {
  const a = await openTree(run(), node("e"), noLog);
  if (!a) throw new Error("no tree");
  await Bun.write(join(a.dir, "half.txt"), "half\n");
  const end = await closeTree(run(), node("e"), a, false, noLog);
  expect(end.merged).toBe(false);
  expect(await Bun.file(join(repo, "half.txt")).exists()).toBe(false);
  const b = await openTree(run(), node("f"), noLog);
  if (!b) throw new Error("no tree");
  expect(await closeTree(run(), node("f"), b, true, noLog)).toEqual({ merged: true });
  expect(inFolder(join(b.dir, "x/y.ts"), b, repo)).toBe(join(repo, "x/y.ts"));
  expect(inFolder("/elsewhere/y.ts", b, repo)).toBe("/elsewhere/y.ts");
});

test("deleting a board drops every branch Satgas made for it, and only those", async () => {
  await git(repo, ["branch", "satgas/r1/a-1"]);
  await git(repo, ["branch", "satgas/r1/b-2"]);
  await git(repo, ["branch", "satgas/r2/a-1"]);
  await git(repo, ["branch", "satgas/fork-r1"]);
  await git(repo, ["branch", "mine"]);
  await dropBoardBranches(repo, "r1", "satgas/fork-r1");
  const left = (await git(repo, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])).out.split("\n").sort();
  expect(left).toEqual(["main", "mine", "satgas/r2/a-1"]);
  await dropBoardBranches(join(dir, "not-a-repo"), "r1");
});
