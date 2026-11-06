// Small git helpers for task branches and board forks; every call is argv-only, never through a shell.

import { COMMIT_TRAILER } from "../shared/commits";
import type { GitInfo } from "../shared/types";

export interface GitResult {
  ok: boolean;
  code: number;
  out: string;
  err: string;
}

// `raw` keeps stdout exactly as git wrote it, for file contents whose last newline matters.
export async function git(cwd: string, args: string[], input?: string, raw = false): Promise<GitResult> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdin: input === undefined ? "ignore" : "pipe",
      stdout: "pipe",
      stderr: "pipe",
      // Never stop for a password or an editor; a missing answer is a failure, not a hang.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: "true", GIT_MERGE_AUTOEDIT: "no" },
    });
    if (input !== undefined && proc.stdin) {
      proc.stdin.write(input);
      await proc.stdin.end();
    }
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { ok: code === 0, code, out: raw ? out : out.trim(), err: err.trim() };
  } catch (e) {
    return { ok: false, code: -1, out: "", err: (e as Error).message };
  }
}

export interface RepoState {
  repo: boolean;
  // Has at least one commit, so a branch can start from it.
  head: boolean;
  // No changed or untracked files, so a branch from HEAD holds everything the folder holds.
  clean: boolean;
  root?: string;
}

export async function repoState(cwd: string): Promise<RepoState> {
  const top = await git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) return { repo: false, head: false, clean: false };
  const head = (await git(cwd, ["rev-parse", "--verify", "-q", "HEAD"])).ok;
  const status = await git(cwd, ["status", "--porcelain"]);
  return { repo: true, head, clean: status.ok && status.out === "", root: top.out };
}

// Commits made by Satgas itself need a name; the repository's own identity is used whenever it has one.
export async function identity(cwd: string): Promise<string[]> {
  const email = await git(cwd, ["config", "user.email"]);
  return email.ok && email.out ? [] : ["-c", "user.name=Satgas", "-c", "user.email=satgas@localhost"];
}

// Branch names Satgas makes from board and task ids, which may hold any characters.
export const refPart = (s: string) =>
  s
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 40) || "x";

// What the Git tab shows for a board's folder: where it stands, its latest commits and Satgas's own branches.
export async function gitInfo(cwd: string): Promise<GitInfo> {
  const state = await repoState(cwd);
  if (!state.repo) return { repo: false };
  const [branch, upstream, status, log, own, merged] = await Promise.all([
    git(cwd, ["branch", "--show-current"]),
    git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    git(cwd, ["status", "--porcelain"]),
    state.head ? git(cwd, ["log", "-15", "--format=%H%x09%s%x09%an%x09%at"]) : Promise.resolve(null),
    git(cwd, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads/satgas/"]),
    state.head ? git(cwd, ["branch", "--merged", "HEAD", "--list", "satgas/*", "--format=%(refname:short)"]) : Promise.resolve(null),
  ]);
  let ahead: number | undefined;
  let behind: number | undefined;
  if (upstream.ok) {
    const counts = await git(cwd, ["rev-list", "--left-right", "--count", "@{u}...HEAD"]);
    const [b, a] = counts.out.split(/\s+/).map(Number);
    if (counts.ok) [ahead, behind] = [a, b];
  }
  const done = new Set((merged?.out ?? "").split("\n").filter(Boolean));
  return {
    repo: true,
    branch: branch.out || undefined,
    ...(upstream.ok ? { upstream: upstream.out, ahead, behind } : {}),
    dirty: status.out ? status.out.split("\n").length : 0,
    commits: (log?.ok ? log.out.split("\n").filter(Boolean) : []).map((l) => {
      const [sha = "", subject = "", author = "", time = "0"] = l.split("\t");
      return { sha, subject, author, at: Number(time) * 1000 };
    }),
    branches: (own.ok ? own.out.split("\n").filter(Boolean) : []).slice(0, 30).map((l) => {
      const [name = "", time = "0"] = l.split("\t");
      return { name, merged: done.has(name), at: Number(time) * 1000 };
    }),
  };
}

// A kept task branch merged into the folder's current branch by hand; a conflict is backed out and named.
export async function mergeBranch(cwd: string, branch: string): Promise<{ conflicts: string[] } | null | string> {
  if (!branch.startsWith("satgas/")) return "Only branches Satgas made can be merged here.";
  if (!(await git(cwd, ["rev-parse", "-q", "--verify", `refs/heads/${branch}`])).ok) return "That branch no longer exists.";
  const merge = await git(cwd, [
    ...(await identity(cwd)),
    "merge",
    "--no-edit",
    "-q",
    "-m",
    `Merge branch ${branch}`,
    "-m",
    COMMIT_TRAILER,
    branch,
  ]);
  if (merge.ok) {
    await git(cwd, ["branch", "-d", branch]);
    return null;
  }
  const unmerged = await git(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  if ((await git(cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])).ok) await git(cwd, ["merge", "--abort"]);
  const conflicts = unmerged.ok && unmerged.out ? unmerged.out.split("\n") : [];
  return conflicts.length ? { conflicts } : merge.err.split("\n")[0] || "The merge failed.";
}

export async function dropBranch(cwd: string, branch: string): Promise<string | null> {
  if (!branch.startsWith("satgas/")) return "Only branches Satgas made can be deleted here.";
  const r = await git(cwd, ["branch", "-D", branch]);
  return r.ok ? null : r.err.split("\n")[0] || "The branch could not be deleted.";
}

// Every branch Satgas made for one board (its tasks' branches and, for a fork, the fork's own), gone with the board.
export async function dropBoardBranches(cwd: string, runId: string, forkBranch?: string): Promise<void> {
  if (!(await git(cwd, ["rev-parse", "--git-dir"])).ok) return;
  await git(cwd, ["worktree", "prune"]);
  const own = await git(cwd, ["for-each-ref", "--format=%(refname:short)", `refs/heads/satgas/${refPart(runId)}/`]);
  const branches = [...(own.ok && own.out ? own.out.split("\n") : []), ...(forkBranch ? [forkBranch] : [])];
  for (const b of branches) await git(cwd, ["branch", "-D", b]);
}
