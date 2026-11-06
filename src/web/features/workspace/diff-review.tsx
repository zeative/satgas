import { type CodeViewItem, type FileDiffMetadata, parsePatchFiles } from "@pierre/diffs";
import { CodeView, type CodeViewHandle, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { ArrowLeft, ChevronsDownUp, ChevronsUpDown, Columns2, Rows3, Undo2, WrapText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/context/theme-provider";
import { t } from "@/i18n";
import { isLiveRun } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { closeReview, openReview, useReview } from "@/stores/review";
import { loadBlob, loadPatch, type ReviewPatch, type ReviewScope } from "@/stores/runs";
import type { Run } from "../../../shared/types";
import { PathLabel } from "./changes-tab";
import { HIGHLIGHT, POOL, REVIEW_STYLE } from "./diff-config";
import { useRevert } from "./revert-dialog";

const tr = t.review;
// A file this long starts folded, so one lockfile cannot make the whole review heavy to open.
const FOLD_LINES = 3000;
const scopeKey = (s: ReviewScope) => (s.kind === "round" ? `round:${s.round}` : s.kind === "node" ? `node:${s.node}` : "board");
const keyScope = (k: string): ReviewScope =>
  k.startsWith("round:")
    ? { kind: "round", round: Number(k.slice(6)) }
    : k.startsWith("node:")
      ? { kind: "node", node: k.slice(5) }
      : { kind: "board" };

function counts(fd: FileDiffMetadata) {
  let add = 0;
  let del = 0;
  for (const h of fd.hunks) {
    add += h.additionLines;
    del += h.deletionLines;
  }
  return { add, del };
}

const CHANGE_LETTER: Record<FileDiffMetadata["type"], { letter: string; tone: string }> = {
  new: { letter: "A", tone: "text-emerald-700 dark:text-emerald-400" },
  deleted: { letter: "D", tone: "text-red-700 dark:text-red-400" },
  change: { letter: "M", tone: "text-signal-ink" },
  "rename-pure": { letter: "R", tone: "text-muted-foreground" },
  "rename-changed": { letter: "R", tone: "text-signal-ink" },
};

// The wide review over the canvas, like a pull request's Files tab: every changed file in one virtualized scroll,
// highlighted off the main thread, with a file list to jump around and undo per file.
export default function DiffReview({ run }: { run: Run }) {
  const { scope, focus } = useReview();
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<{ patch?: ReviewPatch; error?: string; at?: number }>({});
  const [split, setSplit] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [items, setItems] = useState<CodeViewItem<undefined>[]>([]);
  const viewer = useRef<CodeViewHandle<undefined, undefined>>(null);
  // Reloads when a task's recorded changes move on (a new checkpoint, or an undo).
  const changeKey = run.nodes.map((n) => `${n.changes?.after ?? ""}:${n.changes?.reverted?.length ?? 0}`).join("|");
  const key = scope ? scopeKey(scope) : "";

  // biome-ignore lint/correctness/useExhaustiveDependencies: changeKey is the signal to load again.
  useEffect(() => {
    if (!scope) return;
    let alive = true;
    setData({});
    loadPatch(run.id, scope)
      .then((patch) => alive && setData({ patch, at: Date.now() }))
      .catch((e: Error) => alive && setData({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [run.id, key, changeKey]);

  // Each load gets its own cache prefix, so the worker never serves highlighting of an older version of a file.
  const files = useMemo(
    () => (data.patch?.patch ? parsePatchFiles(data.patch.patch, { cacheKeyPrefix: `${run.id}-${data.at}` }).flatMap((p) => p.files) : []),
    [data.patch, data.at, run.id],
  );
  const owner = useMemo(() => new Map((data.patch?.files ?? []).map((f) => [f.path, f.node])), [data.patch]);

  useEffect(() => {
    setItems(
      files.map((fd) => ({
        id: `diff:${fd.name}`,
        type: "diff" as const,
        fileDiff: fd,
        version: 0,
        collapsed: fd.unifiedLineCount > FOLD_LINES,
      })),
    );
  }, [files]);

  // Lands on the file the person clicked once the list is there.
  useEffect(() => {
    if (focus && items.length) requestAnimationFrame(() => viewer.current?.scrollTo({ type: "item", id: `diff:${focus}`, align: "start" }));
  }, [focus, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !(e.target as Element).closest("[role='listbox'], [role='menu']")) closeReview();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const totals = useMemo(
    () =>
      files.reduce(
        (s, fd) => {
          const c = counts(fd);
          return { add: s.add + c.add, del: s.del + c.del };
        },
        { add: 0, del: 0 },
      ),
    [files],
  );
  const allFolded = items.length > 0 && items.every((i) => i.collapsed);
  const setFolded = (collapsed: boolean, id?: string) =>
    setItems((list) => list.map((i) => (!id || i.id === id ? { ...i, collapsed, version: (i.version ?? 0) + 1 } : i)));

  const live = isLiveRun(run);
  const { revert, dialog: revertDialog } = useRevert(run.id);
  const undo = (path: string) => {
    const node = owner.get(path);
    if (node) revert(node, [path]);
  };

  const options = useMemo(
    () => ({
      ...HIGHLIGHT,
      themeType: resolvedTheme,
      diffStyle: split ? ("split" as const) : ("unified" as const),
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      stickyHeaders: true,
      lineDiffType: "word" as const,
      layout: { paddingTop: 12, paddingBottom: 48, gap: 12 },
      loadDiffFiles: async (fd: FileDiffMetadata) => {
        const { from, to } = data.patch ?? {};
        const [before, after] = await Promise.all([
          from ? loadBlob(run.id, from, fd.prevName ?? fd.name) : "",
          to ? loadBlob(run.id, to, fd.name) : "",
        ]);
        return { oldFile: { name: fd.prevName ?? fd.name, contents: before }, newFile: { name: fd.name, contents: after } };
      },
    }),
    [resolvedTheme, split, wrap, data.patch, run.id],
  );

  if (!scope) return null;
  const rounds = [...new Set(run.nodes.filter((n) => n.changes?.files.length).map((n) => n.round ?? 0))].sort((a, b) => a - b);
  const tasks = run.nodes.filter((n) => n.changes?.files.length);
  const toggle = "size-8 text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground";

  return (
    <section role="dialog" aria-modal="false" aria-label={tr.label} className="absolute inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={closeReview}
          title={`${tr.close} (Esc)`}
          className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          {tr.close}
        </Button>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <Select value={key} onValueChange={(v) => openReview(keyScope(v))}>
          <SelectTrigger
            aria-label={tr.scope}
            size="sm"
            className="h-8 max-w-72 border-none bg-transparent text-xs font-medium shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="board">{tr.board}</SelectItem>
            {rounds.map((r) => (
              <SelectItem key={r} value={`round:${r}`}>
                {tr.round(r)}
              </SelectItem>
            ))}
            {tasks.map((n) => (
              <SelectItem key={n.id} value={`node:${n.id}`}>
                {tr.task(n.title)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {files.length > 0 && (
          <span className="font-mono text-xs tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">+{totals.add.toLocaleString()}</span>{" "}
            <span className="text-red-700 dark:text-red-400">−{totals.del.toLocaleString()}</span>
          </span>
        )}
        <div className="ms-auto flex items-center gap-0.5">
          <fieldset className="flex items-center rounded-lg border p-0.5">
            <legend className="sr-only">{`${tr.unified} / ${tr.split}`}</legend>
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={!split}
              aria-label={tr.unified}
              title={tr.unified}
              className={cn(toggle, "size-7")}
              onClick={() => setSplit(false)}
            >
              <Rows3 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={split}
              aria-label={tr.split}
              title={tr.split}
              className={cn(toggle, "size-7")}
              onClick={() => setSplit(true)}
            >
              <Columns2 />
            </Button>
          </fieldset>
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={wrap}
            aria-label={tr.wrap}
            title={tr.wrap}
            className={toggle}
            onClick={() => setWrap((v) => !v)}
          >
            <WrapText />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={allFolded ? tr.expandAll : tr.collapseAll}
            title={allFolded ? tr.expandAll : tr.collapseAll}
            className={toggle}
            onClick={() => setFolded(!allFolded)}
          >
            {allFolded ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </Button>
        </div>
      </header>
      {revertDialog}

      {data.error ? (
        <p className="p-6 text-xs text-destructive">{tr.failed}</p>
      ) : !data.patch ? (
        <p className="p-6 text-xs text-muted-foreground">{tr.loading}</p>
      ) : !files.length ? (
        <div className="flex flex-col items-start gap-3 p-6">
          <p className="text-xs text-muted-foreground">{tr.empty}</p>
          <Button variant="outline" size="sm" onClick={closeReview} className="gap-1.5 text-xs">
            <ArrowLeft />
            {tr.close}
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <WorkerPoolContextProvider poolOptions={POOL} highlighterOptions={HIGHLIGHT}>
            <CodeView
              ref={viewer}
              items={items}
              options={options}
              className="min-w-0 flex-1 px-3"
              style={REVIEW_STYLE}
              renderHeaderMetadata={(item) =>
                item.type === "diff" && owner.get(item.fileDiff.name) && item.fileDiff.type !== "rename-pure" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={live}
                    aria-label={t.workspace.undoFile}
                    title={live ? t.workspace.waitLive : t.workspace.undoFile}
                    onClick={() => undo(item.fileDiff.name)}
                    className="size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
                  >
                    <Undo2 />
                  </Button>
                ) : null
              }
              renderCodeViewFooter={() => (data.patch?.cut ? <p className="px-1 pb-6 text-xs text-muted-foreground">{tr.cut}</p> : null)}
            />
          </WorkerPoolContextProvider>
          <aside aria-label={tr.files} className="flex w-64 shrink-0 flex-col border-s max-lg:hidden">
            <h3 className="flex h-10 shrink-0 items-center justify-between px-3 text-xs font-medium">
              {tr.files}
              <span className="font-normal text-muted-foreground tabular-nums">{files.length}</span>
            </h3>
            <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
              {files.map((fd) => {
                const c = counts(fd);
                const mark = CHANGE_LETTER[fd.type];
                return (
                  <li key={fd.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setFolded(false, `diff:${fd.name}`);
                        requestAnimationFrame(() => viewer.current?.scrollTo({ type: "item", id: `diff:${fd.name}`, align: "start" }));
                      }}
                      className="flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-start text-xs transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none"
                    >
                      <span className={cn("w-3 shrink-0 font-mono text-[11px] font-medium", mark.tone)}>{mark.letter}</span>
                      <PathLabel path={fd.name} className="flex-1" />
                      <span className="shrink-0 font-mono text-[11px] tabular-nums">
                        {c.add > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{c.add}</span>}
                        {c.del > 0 && <span className="ms-1 text-red-700 dark:text-red-400">−{c.del}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}
    </section>
  );
}
