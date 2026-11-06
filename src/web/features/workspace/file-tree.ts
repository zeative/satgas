import type { FileChange } from "../../../shared/board";
import type { NodeState } from "../../../shared/types";

export interface Dir {
  name: string;
  path: string;
  dirs: Dir[];
  files: string[];
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

// A folder holding only one folder reads as one row, "app/(terminal)", as VS Code's compact folders do. It keeps the
// deepest path, so opening it and the changes under it line up.
function tidy(dir: Dir): Dir {
  let dirs = dir.dirs.map(tidy);
  let { name, path, files } = dir;
  const only = dirs[0];
  if (path && dirs.length === 1 && !files.length && only) {
    name = `${name}/${only.name}`;
    path = only.path;
    files = only.files;
    dirs = only.dirs;
  }
  return {
    name,
    path,
    files: [...files].sort((a, b) => byName(baseName(a), baseName(b))),
    dirs: [...dirs].sort((a, b) => byName(a.name, b.name)),
  };
}

// A list of paths as a tree, folders first and in name order; a path ending in "/" is an empty folder.
export function treeOf(paths: string[]): Dir {
  const root: Dir = { name: "", path: "", dirs: [], files: [] };
  const dirs = new Map<string, Dir>([["", root]]);
  const dirOf = (path: string): Dir => {
    const known = dirs.get(path);
    if (known) return known;
    const cut = path.lastIndexOf("/");
    const parent = dirOf(cut < 0 ? "" : path.slice(0, cut));
    const dir: Dir = { name: path.slice(cut + 1), path, dirs: [], files: [] };
    parent.dirs.push(dir);
    dirs.set(path, dir);
    return dir;
  };
  for (const p of paths) {
    if (p.endsWith("/")) dirOf(p.slice(0, -1));
    else {
      const cut = p.lastIndexOf("/");
      dirOf(cut < 0 ? "" : p.slice(0, cut)).files.push(p);
    }
  }
  return tidy(root);
}

// What this board did to each file, skipping what was undone. A file one task added stays "added" through later edits.
export function changesOf(nodes: NodeState[]): Map<string, FileChange["change"]> {
  const out = new Map<string, FileChange["change"]>();
  for (const n of nodes)
    for (const f of n.changes?.files ?? []) {
      if (n.changes?.reverted?.includes(f.path)) continue;
      if (f.change === "deleted" || out.get(f.path) !== "added") out.set(f.path, f.change);
    }
  return out;
}

// Every folder above a changed file, so a closed folder can say it holds some without walking the tree per row.
export function foldersHolding(changed: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const p of changed) for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) out.add(p.slice(0, i));
  return out;
}
