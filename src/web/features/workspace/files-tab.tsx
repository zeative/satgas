import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { openFile, useReview } from "@/stores/review";
import { loadTree } from "@/stores/runs";
import type { FileChange } from "../../../shared/board";
import type { Run } from "../../../shared/types";
import { CHANGE_MARK } from "./changes-tab";
import { FileIcon } from "./file-icon";
import { baseName, changesOf, type Dir, foldersHolding, treeOf } from "./file-tree";
import { Guides, indentOf, ROW, TreeChevron, TreeLoading, TreeNote, TreeRow, useTreeKeys } from "./tree-row";

const tw = t.workspace;

export const fileHref = (runId: string, path: string) => `/api/runs/${runId}/files/${path.split("/").map(encodeURIComponent).join("/")}`;

// Which folders someone opened or closed stays with the board for this visit, across tab switches and the panel closing.
const openedByRun = new Map<string, ReadonlyMap<string, boolean>>();

interface Tree {
  changes: Map<string, FileChange["change"]>;
  holding: Set<string>;
  isOpen: (dir: Dir, depth: number) => boolean;
  toggle: (dir: Dir, depth: number) => void;
}

// The board's folder the way VS Code's Explorer shows it: tight rows edge to edge, a chevron for folders, an icon for each
// kind of file, and what this board changed coloured with its letter. Opening a file shows it read-only.
export function FilesTab({ run }: { run: Run }) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [opened, setOpened] = useState(() => openedByRun.get(run.id) ?? new Map<string, boolean>());
  const keys = useTreeKeys();
  // Reloads when a task finishes, since that is when the folder changes.
  const finished = run.nodes.filter((n) => n.endedAt).length;
  const changes = useMemo(() => changesOf(run.nodes), [run.nodes]);
  const holding = useMemo(() => foldersHolding(changes.keys()), [changes]);
  const root = useMemo(() => (paths ? treeOf(paths) : null), [paths]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: finished is the signal to look again.
  useEffect(() => {
    let alive = true;
    loadTree(run.id)
      .then((p) => {
        if (!alive) return;
        setPaths(p);
        setError(null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [run.id, finished]);

  const tree = useMemo<Tree>(() => {
    // Folders holding this board's changes start open near the top, so the work is a glance away without unrolling all of it.
    const isOpen = (d: Dir, depth: number) => opened.get(d.path) ?? (holding.has(d.path) && depth < 2);
    return {
      changes,
      holding,
      isOpen,
      toggle: (d, depth) => {
        const next = new Map(openedByRun.get(run.id) ?? opened).set(d.path, !isOpen(d, depth));
        openedByRun.set(run.id, next);
        setOpened(next);
      },
    };
  }, [changes, holding, opened, run.id]);

  const q = filter.trim().toLowerCase();
  const shown = q ? (paths ?? []).filter((p) => !p.endsWith("/") && p.toLowerCase().includes(q)) : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the rows inside; this only catches them as they bubble.
    <div ref={keys.ref} onKeyDown={keys.onKeyDown} className="flex flex-col pb-2">
      <div className="sticky top-0 z-10 bg-card p-1.5">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tw.filter}
            aria-label={tw.filter}
            className="h-6 w-full rounded-md bg-muted ps-6.5 pe-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </div>
      {error && !paths ? (
        <TreeNote tone="text-destructive">{error}</TreeNote>
      ) : !paths || !root ? (
        <TreeLoading />
      ) : !paths.length ? (
        <TreeNote>{tw.emptyFolder}</TreeNote>
      ) : shown ? (
        shown.length ? (
          <ul className="flex flex-col">
            {shown.slice(0, 200).map((p) => (
              <FileRow key={p} path={p} change={changes.get(p)} depth={0} trail />
            ))}
          </ul>
        ) : (
          <TreeNote>{tw.noMatch}</TreeNote>
        )
      ) : (
        // Indent guides appear while the pointer is over the tree, as they do in VS Code.
        <div className="group/tree">
          <DirList dir={root} depth={0} tree={tree} />
        </div>
      )}
    </div>
  );
}

function DirList({ dir, depth, tree }: { dir: Dir; depth: number; tree: Tree }) {
  return (
    <ul className="flex flex-col">
      {dir.dirs.map((d) => (
        <DirRow key={d.path} dir={d} depth={depth} tree={tree} />
      ))}
      {dir.files.map((p) => (
        <FileRow key={p} path={p} change={tree.changes.get(p)} depth={depth} />
      ))}
    </ul>
  );
}

function DirRow({ dir, depth, tree }: { dir: Dir; depth: number; tree: Tree }) {
  const open = tree.isOpen(dir, depth);
  const holds = tree.holding.has(dir.path);
  return (
    <li>
      <button
        type="button"
        data-row={depth}
        aria-expanded={open}
        title={dir.path}
        onClick={() => tree.toggle(dir, depth)}
        className={ROW}
        style={{ paddingInlineStart: indentOf(depth) }}
      >
        <Guides depth={depth} />
        <TreeChevron open={open} />
        <span className={cn("min-w-0 flex-1 truncate", holds && CHANGE_MARK.modified.tone)}>{dir.name}</span>
        {holds && (
          <span role="img" aria-label={tw.touched} title={tw.touched} className="ms-2 size-1.5 shrink-0 rounded-full bg-signal-ink/80" />
        )}
      </button>
      {open && <DirList dir={dir} depth={depth + 1} tree={tree} />}
    </li>
  );
}

function FileRow({ path, change, depth, trail }: { path: string; change?: FileChange["change"]; depth: number; trail?: boolean }) {
  const active = useReview((s) => s.file === path);
  const name = baseName(path);
  const mark = change ? CHANGE_MARK[change] : undefined;
  return (
    <TreeRow
      depth={depth}
      inset={!trail}
      icon={<FileIcon name={name} />}
      label={name}
      tone={mark?.tone}
      trail={trail ? path.slice(0, -name.length - 1) : undefined}
      end={mark && <span className={cn("font-mono", mark.tone)}>{mark.letter}</span>}
      title={path}
      active={active}
      onClick={() => openFile(path)}
    />
  );
}
