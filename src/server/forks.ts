import { cp, lstat, mkdir, readdir, readFile, rm, symlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { BoardOp, Card } from "../shared/board";
import type { ForkOf, Run } from "../shared/types";
import { placeOnShelf, withinFrame } from "./artifacts";
import { config } from "./config";
import { git, refPart, repoState } from "./git";
import { appendLog, boardOps, getLogs, getRun, insertRun, newRunId, patchRun } from "./store";

// A fork is a copy of a board with its whole history, working in a copy of its folder (a git worktree on a new branch
// when the folder is a repository), so another direction can be tried without touching the original. Merging back brings
// the files the fork changed, and the cards it made, into the original; a file both sides changed is left for the person.

export interface MergeResult {
  applied: string[];
  conflicts: string[];
  cards: number;
}

const SKIPPED = new Set(["node_modules", "__pycache__", "venv", "dist", "build", "coverage", "target"]);
const MAX_FILES = 5000;

export const forksDir = () => join(config.dataDir, "forks");
const baseFile = (id: string) => join(forksDir(), `${id}.base.json`);

// Relative path → content hash, for every file a fork can change; null when the folder is too large to compare.
export async function contents(root: string): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  let full = false;
  const walk = async (dir: string, depth: number) => {
    if (depth > 8 || full) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIPPED.has(e.name)) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path, depth + 1);
      else if (e.isFile()) {
        if (out.size >= MAX_FILES) {
          full = true;
          return;
        }
        const bytes = await readFile(path).catch(() => null);
        if (bytes) out.set(relative(root, path).split("\\").join("/"), Bun.hash(bytes).toString(36));
      }
    }
  };
  await walk(root, 0);
  return full ? null : out;
}

const linkModules = async (from: string, to: string) => {
  const has = (p: string) =>
    lstat(p).then(
      () => true,
      () => false,
    );
  if ((await has(join(from, "node_modules"))) && !(await has(join(to, "node_modules"))))
    await symlink(join(from, "node_modules"), join(to, "node_modules"), "dir").catch(() => {});
};

// The fork's folder: a worktree of the repository with the original's uncommitted changes carried over, or a plain copy.
async function copyFolder(src: Run, id: string): Promise<{ cwd: string; repo?: string; branch?: string }> {
  const dir = join(forksDir(), id);
  await mkdir(forksDir(), { recursive: true });
  const state = await repoState(src.cwd);
  if (state.repo && state.head && state.root) {
    const branch = `satgas/fork-${refPart(id)}`;
    const added = await git(state.root, ["worktree", "add", "-q", "-b", branch, dir, "HEAD"]);
    if (added.ok) {
      const changed = await git(state.root, ["ls-files", "-m", "-o", "--exclude-standard", "-z"]);
      for (const rel of changed.out.split("\0").filter(Boolean)) {
        await mkdir(dirname(join(dir, rel)), { recursive: true });
        await cp(join(state.root, rel), join(dir, rel), { force: true }).catch(() => {});
      }
      const gone = await git(state.root, ["ls-files", "-d", "-z"]);
      for (const rel of gone.out.split("\0").filter(Boolean)) await rm(join(dir, rel), { force: true });
      // Where the board's folder sits inside the repository; git answers in its own spelling of the path.
      const prefix = await git(src.cwd, ["rev-parse", "--show-prefix"]);
      const cwd = join(dir, prefix.ok ? prefix.out : "");
      await linkModules(src.cwd, cwd);
      return { cwd, repo: state.root, branch };
    }
  }
  await cp(src.cwd, dir, { recursive: true, filter: (from) => !SKIPPED.has(from.split("/").pop() ?? "") });
  await linkModules(src.cwd, dir);
  return { cwd: dir };
}

export async function forkRun(id: string): Promise<Run | string> {
  const src = getRun(id);
  if (!src) return "Board not found.";
  const newId = newRunId();
  const folder = await copyFolder(src, newId);
  const base = await contents(folder.cwd);
  await Bun.write(baseFile(newId), JSON.stringify(base ? Object.fromEntries(base) : null));
  const now = Date.now();
  const copy = structuredClone(src);
  const forkOf: ForkOf = {
    id: src.id,
    title: src.title ?? src.prompt.slice(0, 80),
    cwd: src.cwd,
    at: now,
    ...(folder.repo ? { repo: folder.repo, branch: folder.branch } : {}),
  };
  const run: Run = {
    ...copy,
    id: newId,
    cwd: folder.cwd,
    title: `${forkOf.title} (fork)`.slice(0, 80),
    named: true,
    createdAt: now,
    seenAt: now,
    forkOf,
    // A board mid-work forks as it stands; what was still going on is stopped in the copy.
    status: src.status === "planning" || src.status === "running" ? "cancelled" : src.status,
    nodes: copy.nodes.map((n) => (n.status === "running" || n.status === "pending" ? { ...n, status: "cancelled" } : n)),
    pinned: undefined,
    archived: undefined,
    snoozedUntil: undefined,
    markedUnread: undefined,
    queue: undefined,
    draft: undefined,
    secrets: undefined,
    pulls: undefined,
  };
  insertRun(run, structuredClone(getLogs(src.id)));
  appendLog(newId, "planner", { kind: "info", text: `Forked from ${forkOf.title}` });
  return run;
}

// Brings what the fork changed since it was made (or since the last merge) into the original's folder and board.
export async function mergeBack(id: string): Promise<MergeResult | string> {
  const fork = getRun(id);
  if (!fork?.forkOf) return "This board is not a fork.";
  const target = fork.forkOf.cwd;
  const saved = (await Bun.file(baseFile(id))
    .json()
    .catch(() => null)) as Record<string, string> | null;
  const [mine, theirs] = await Promise.all([contents(fork.cwd), contents(target)]);
  if (!saved || !mine || !theirs) return "One of the folders is too large to compare file by file.";
  const base = new Map(Object.entries(saved));
  const applied: string[] = [];
  const conflicts: string[] = [];
  for (const path of new Set([...base.keys(), ...mine.keys()])) {
    const was = base.get(path);
    const now = mine.get(path);
    if (now === was) continue;
    const there = theirs.get(path);
    if (there === now) {
      base.set(path, now ?? "");
      if (now === undefined) base.delete(path);
      continue;
    }
    // The original changed this file too: whichever way it went, the person decides.
    if (there !== was) {
      conflicts.push(path);
      continue;
    }
    const to = resolve(target, path);
    if (!to.startsWith(resolve(target))) continue;
    if (now === undefined) {
      await rm(to, { force: true });
      base.delete(path);
    } else {
      await mkdir(dirname(to), { recursive: true });
      await cp(join(fork.cwd, path), to, { force: true });
      base.set(path, now);
    }
    applied.push(path);
  }
  await Bun.write(baseFile(id), JSON.stringify(Object.fromEntries(base)));
  const cards = mergeCards(fork);
  const summary = `Merged ${applied.length} file${applied.length === 1 ? "" : "s"}${cards ? ` and ${cards} card${cards === 1 ? "" : "s"}` : ""} from the fork${conflicts.length ? `; ${conflicts.length} changed on both sides were left as they are: ${conflicts.slice(0, 8).join(", ")}` : ""}`;
  appendLog(id, "planner", { kind: "info", text: summary });
  if (getRun(fork.forkOf.id)) appendLog(fork.forkOf.id, "planner", { kind: "info", text: summary });
  patchRun(id, { forkOf: { ...fork.forkOf, at: Date.now() } });
  return { applied, conflicts, cards };
}

// Cards the fork made since it was made or last merged go on the original's shelf; a frame brings what is inside it.
function mergeCards(fork: Run): number {
  const original = fork.forkOf ? getRun(fork.forkOf.id) : undefined;
  if (!original || !fork.forkOf) return 0;
  const since = fork.forkOf.at;
  const all = fork.board?.cards ?? [];
  const known = new Set((original.board?.cards ?? []).map((c) => c.id));
  const fresh = all.filter((c) => c.createdAt > since && !known.has(c.id) && !withinFrame(c, all) && c.kind !== "drawing");
  if (!fresh.length) return 0;
  const ops: BoardOp[] = [];
  placeOnShelf(original, fresh).forEach((card, i) => {
    const from = fresh[i];
    if (!from) return;
    ops.push({ op: "put", card });
    if (from.kind !== "frame") return;
    for (const child of all.filter((c) => c.id !== from.id && withinFrame(c, [from]) && !known.has(c.id)))
      ops.push({ op: "put", card: { ...child, x: child.x - from.x + card.x, y: child.y - from.y + card.y } as Card });
  });
  boardOps(original.id, ops);
  return fresh.length;
}

// A fork's folder goes with its board, and so does its branch: deleting the board means nothing of it is wanted.
export async function removeFork(run: Run) {
  if (!run.forkOf) return;
  const dir = join(forksDir(), run.id);
  if (run.forkOf.repo) await git(run.forkOf.repo, ["worktree", "remove", "--force", dir]);
  await rm(dir, { recursive: true, force: true });
  if (run.forkOf.repo) {
    await git(run.forkOf.repo, ["worktree", "prune"]);
    if (run.forkOf.branch) await git(run.forkOf.repo, ["branch", "-D", run.forkOf.branch]);
  }
  await rm(baseFile(run.id), { force: true });
}
