import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FileChange } from "../shared/board";

// Agents often write files with the shell (`cat > file`, scripts, generators) rather than a file tool, so what a task
// changed is also read off the workspace itself: a snapshot before the task, one after, and the difference.

// Folders no task output is shown from; skipped so a snapshot of a large repository stays quick.
const SKIPPED = new Set(["node_modules", "__pycache__", "venv", "dist", "build", "coverage", "target"]);
const MAX_FILES = 5000;

// Absolute path → size and modification time.
export type Snapshot = Map<string, string>;

// null when the workspace is too large to compare whole; a cut snapshot would report false additions and deletions.
export async function snapshot(cwd: string): Promise<Snapshot | null> {
  const out: Snapshot = new Map();
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
        const s = await stat(path).catch(() => null);
        if (s) out.set(path, `${s.size}:${s.mtimeMs}`);
      }
    }
  };
  await walk(cwd, 0);
  return full ? null : out;
}

export function changes(before: Snapshot, after: Snapshot): Map<string, FileChange["change"]> {
  const out = new Map<string, FileChange["change"]>();
  for (const [path, sig] of after) {
    const was = before.get(path);
    if (was === undefined) out.set(path, "added");
    else if (was !== sig) out.set(path, "modified");
  }
  for (const path of before.keys()) if (!after.has(path)) out.set(path, "deleted");
  return out;
}
