import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { COMMIT_TRAILER, commitMessage } from "../shared/commits";
import type { LogLine, NodeState, Run } from "../shared/types";
import { config } from "./config";
import { git, identity, refPart, repoState } from "./git";
import { getSettings } from "./settings";

// Writing tasks that run side by side in one git repository each get their own branch in a worktree, so two agents
// never write over each other; a finished branch is merged back into the folder's current branch as commits.

export interface TaskTree {
  dir: string;
  branch: string;
  // The commit the branch started from, to tell whether the task committed anything.
  base: string;
}

export type TreeEnd = { merged: true } | { merged: false; branch?: string; conflicts?: string[]; error?: string };

type Log = (line: Omit<LogLine, "t" | "seq">) => void;

export const treesDir = (runId: string) => join(config.dataDir, "worktrees", runId);

// Whether this round's writing tasks get worktrees: on in Configurations, two or more of them, and a clean repository with
// a commit to start from. A folder with uncommitted changes keeps tasks in it, since a branch from HEAD would miss them.
export async function treesFor(run: Run, nodes: NodeState[], log: Log): Promise<boolean> {
  if (!getSettings().worktrees || nodes.filter((n) => n.access !== "read").length < 2) return false;
  const state = await repoState(run.cwd);
  if (!state.repo || !state.head) return false;
  if (!state.clean) {
    log({
      kind: "info",
      text: "The folder has uncommitted changes, so this round's tasks share it instead of each working on its own branch",
    });
    return false;
  }
  return true;
}

export async function openTree(run: Run, node: NodeState, log: Log): Promise<TaskTree | null> {
  const base = await git(run.cwd, ["rev-parse", "HEAD"]);
  if (!base.ok) return null;
  const stamp = Date.now().toString(36);
  const branch = `satgas/${refPart(run.id)}/${refPart(node.id)}-${stamp}`;
  const dir = join(treesDir(run.id), `${refPart(node.id)}-${stamp}`);
  await mkdir(treesDir(run.id), { recursive: true });
  const added = await git(run.cwd, ["worktree", "add", "-q", "-b", branch, dir, base.out]);
  if (!added.ok) {
    log({ kind: "info", text: `Could not make a branch for this task, so it works in the shared folder: ${added.err.split("\n")[0]}` });
    return null;
  }
  await setUp(run.cwd, dir);
  log({ kind: "info", text: `Working on its own branch ${branch}` });
  return { dir, branch, base: base.out };
}

// A new worktree has the code but none of what installs make, so it borrows the folder's node_modules.
async function setUp(cwd: string, dir: string) {
  const here = join(cwd, "node_modules");
  const there = join(dir, "node_modules");
  const has = (p: string) =>
    lstat(p).then(
      () => true,
      () => false,
    );
  if ((await has(here)) && !(await has(there))) await symlink(here, there, "dir").catch(() => {});
}

// Commits what the task left uncommitted (never the linked node_modules) with a message in the person's style.
async function commitRest(tree: TaskTree, title: string, cwd: string): Promise<void> {
  await git(tree.dir, ["add", "-A", "--", ".", ":(exclude)node_modules"]);
  if ((await git(tree.dir, ["diff", "--cached", "--quiet"])).ok) return;
  const recent = await git(cwd, ["log", "-20", "--format=%s"]);
  const message = commitMessage(getSettings().commitStyle, title, recent.ok ? recent.out.split("\n") : []);
  await git(tree.dir, [...(await identity(cwd)), "commit", "-q", "--no-verify", "-m", message, "-m", COMMIT_TRAILER]);
}

// Merges into one folder go one at a time.
const hot = globalThis as typeof globalThis & { __satgasMergeLocks?: Map<string, Promise<unknown>> };
hot.__satgasMergeLocks ??= new Map();
const locks = hot.__satgasMergeLocks;
function locked<T>(key: string, job: () => Promise<T>): Promise<T> {
  const next = (locks.get(key) ?? Promise.resolve()).then(job, job);
  locks.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

async function remove(cwd: string, tree: TaskTree, keepBranch: boolean) {
  await git(cwd, ["worktree", "remove", "--force", tree.dir]);
  await rm(tree.dir, { recursive: true, force: true });
  await git(cwd, ["worktree", "prune"]);
  if (!keepBranch) await git(cwd, ["branch", "-D", tree.branch]);
}

// A finished task's branch goes back into the folder; one that failed or stopped keeps its work on the branch.
export async function closeTree(run: Run, node: NodeState, tree: TaskTree, finished: boolean, log: Log): Promise<TreeEnd> {
  await commitRest(tree, finished ? node.title : `wip: ${node.title}`, run.cwd);
  const ahead = await git(tree.dir, ["rev-list", "--count", `${tree.base}..HEAD`]);
  const changed = ahead.ok && Number(ahead.out) > 0;
  if (!changed) {
    await remove(run.cwd, tree, false);
    return { merged: true };
  }
  if (!finished) {
    await remove(run.cwd, tree, true);
    log({ kind: "info", text: `The work so far is kept on branch ${tree.branch}` });
    return { merged: false, branch: tree.branch };
  }
  return locked(run.cwd, async () => {
    const merge = await git(run.cwd, [
      ...(await identity(run.cwd)),
      "merge",
      "--no-edit",
      "-q",
      "-m",
      `Merge branch ${tree.branch}`,
      "-m",
      COMMIT_TRAILER,
      tree.branch,
    ]);
    if (merge.ok) {
      await remove(run.cwd, tree, false);
      log({ kind: "info", text: `Merged branch ${tree.branch}` });
      return { merged: true } as const;
    }
    const unmerged = await git(run.cwd, ["diff", "--name-only", "--diff-filter=U"]);
    const conflicts = unmerged.ok && unmerged.out ? unmerged.out.split("\n") : [];
    if ((await git(run.cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])).ok) await git(run.cwd, ["merge", "--abort"]);
    await remove(run.cwd, tree, true);
    return { merged: false, branch: tree.branch, conflicts, error: merge.err.split("\n")[0] };
  });
}

// A task path inside its worktree, as the same file in the board's folder once merged.
export function inFolder(path: string, tree: TaskTree | null, cwd: string): string {
  if (!tree) return path;
  // macOS reports temp folders under /private too.
  const p = path.startsWith("/private/") && !tree.dir.startsWith("/private/") ? path.slice("/private".length) : path;
  return p.startsWith(`${tree.dir}/`) ? join(cwd, p.slice(tree.dir.length + 1)) : path;
}

export const removeRunTrees = (runId: string) => rm(treesDir(runId), { recursive: true, force: true });
