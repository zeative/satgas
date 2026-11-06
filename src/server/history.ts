import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FileChange } from "../shared/board";
import type { Run, TaskChanges } from "../shared/types";
import { config } from "./config";
import { git } from "./git";

// A private git history of each board's folder, kept apart from any repository the folder has (its own git dir under
// the data folder, the folder as its work tree). A checkpoint before and after every writing task gives each task an
// exact diff and a way back, for plain folders and repositories alike, without touching the person's own git.

const EXCLUDED = ["node_modules/", ".git/", "dist/", "build/", ".next/", "coverage/", "target/", "__pycache__/", "venv/", ".venv/"];

export const historyDir = (runId: string) => join(config.dataDir, "history", `${runId}.git`);
const at = (run: Pick<Run, "id" | "cwd">) => ["--git-dir", historyDir(run.id), "--work-tree", run.cwd];

// Survives `bun --hot` reloads; checkpoints of one board go one at a time, so two tasks never commit over each other.
const hot = globalThis as typeof globalThis & { __satgasHistory?: Map<string, Promise<unknown>> };
hot.__satgasHistory ??= new Map();
const locks = hot.__satgasHistory;
function locked<T>(id: string, job: () => Promise<T>): Promise<T> {
  const next = (locks.get(id) ?? Promise.resolve()).then(job, job);
  locks.set(
    id,
    next.catch(() => {}),
  );
  return next;
}

async function ensure(run: Pick<Run, "id" | "cwd">): Promise<boolean> {
  const dir = historyDir(run.id);
  if (await Bun.file(join(dir, "HEAD")).exists()) return true;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (!(await git(dir, ["init", "-q", "--bare", dir])).ok) return false;
  await git(dir, ["--git-dir", dir, "config", "core.bare", "false"]);
  await writeFile(join(dir, "info", "exclude"), `${EXCLUDED.join("\n")}\n`);
  // A repository's own objects are borrowed rather than copied, so the history of a big repo stays small.
  const common = await git(run.cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common.ok && common.out) await writeFile(join(dir, "objects", "info", "alternates"), `${join(common.out, "objects")}\n`);
  return true;
}

// The folder as it stands now, as a commit in the board's history; null when git is missing or the folder unreadable.
export function checkpoint(run: Pick<Run, "id" | "cwd">, label: string): Promise<string | null> {
  return locked(run.id, async () => {
    if (!(await ensure(run))) return null;
    if (!(await git(run.cwd, [...at(run), "add", "-A"])).ok) return null;
    const who = ["-c", "user.name=Satgas", "-c", "user.email=satgas@localhost", "-c", "commit.gpgsign=false"];
    await git(run.cwd, [...who, ...at(run), "commit", "-q", "--allow-empty", "--no-verify", "-m", label]);
    const head = await git(run.cwd, [...at(run), "rev-parse", "HEAD"]);
    return head.ok ? head.out : null;
  });
}

const blobAt = async (run: Pick<Run, "id" | "cwd">, rev: string, path: string) => {
  const r = await git(run.cwd, [...at(run), "rev-parse", "-q", "--verify", `${rev}:${path}`]);
  return r.ok ? r.out : null;
};
const blobNow = async (run: Pick<Run, "id" | "cwd">, path: string) => {
  const full = resolve(run.cwd, path);
  if (!(await Bun.file(full).exists())) return null;
  const r = await git(run.cwd, ["hash-object", "--no-filters", "--", full]);
  return r.ok ? r.out : null;
};

// Puts files back as they were before the task. A file changed again since the task is only put back with `force`,
// so a later fix is never thrown away silently.
export async function revertTask(
  run: Pick<Run, "id" | "cwd">,
  changes: TaskChanges,
  paths: string[],
  force: boolean,
): Promise<{ reverted: string[]; changedSince: string[] } | string> {
  const { before, after } = changes;
  if (!before || !after) return "This task's changes were not recorded, so they cannot be undone here.";
  const wanted = changes.files.filter((f) => paths.includes(f.path) && !changes.reverted?.includes(f.path));
  if (!wanted.length) return "Nothing left to undo.";
  const changedSince: string[] = [];
  for (const f of wanted) if ((await blobNow(run, f.path)) !== (await blobAt(run, after, f.path))) changedSince.push(f.path);
  if (changedSince.length && !force) return { reverted: [], changedSince };
  const reverted: string[] = [];
  await locked(run.id, async () => {
    for (const f of wanted) {
      const full = resolve(run.cwd, f.path);
      if (!full.startsWith(resolve(run.cwd))) continue;
      if (await blobAt(run, before, f.path)) {
        if ((await git(run.cwd, [...at(run), "checkout", before, "--", f.path])).ok) reverted.push(f.path);
      } else {
        await rm(full, { force: true });
        reverted.push(f.path);
      }
    }
  });
  return { reverted, changedSince };
}

export const removeHistory = (runId: string) => rm(historyDir(runId), { recursive: true, force: true });

export const changeList = (files: Map<string, FileChange["change"]>): TaskChanges["files"] =>
  [...files].map(([path, change]) => ({ path, change }));

export const PATCH_MAX = 8_000_000;

// One patch for many files: from a checkpoint to another, or to the folder as it is now (`to` null), so a review of a
// round or the whole board also shows what was undone or edited since.
export async function patchBetween(
  run: Pick<Run, "id" | "cwd">,
  from: string,
  to: string | null,
  paths: string[],
): Promise<{ patch: string; cut: boolean } | null> {
  if (!paths.length) return { patch: "", cut: false };
  const range = to ? [from, to] : [from];
  const r = await git(
    run.cwd,
    [...at(run), "diff", "--no-color", "--no-ext-diff", "-U3", "--find-renames", ...range, "--", ...paths],
    undefined,
    true,
  );
  if (!r.ok) return null;
  return { patch: r.out.slice(0, PATCH_MAX), cut: r.out.length > PATCH_MAX };
}

export const BLOB_MAX = 2_000_000;

// A file's text at a checkpoint, or as it is in the folder now, so a review can unfold the unchanged lines around a hunk.
export async function fileAt(run: Pick<Run, "id" | "cwd">, rev: string, path: string): Promise<string | null> {
  const full = resolve(run.cwd, path);
  if (!full.startsWith(`${resolve(run.cwd)}/`)) return null;
  if (rev === "now") {
    const f = Bun.file(full);
    if (!(await f.exists()) || f.size > BLOB_MAX) return null;
    return f.text();
  }
  if (!/^[0-9a-f]{7,64}$/.test(rev)) return null;
  const r = await git(run.cwd, [...at(run), "show", `${rev}:${path}`], undefined, true);
  return r.ok && r.out.length <= BLOB_MAX ? r.out : null;
}
