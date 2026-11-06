import type { CodeViewItem } from "@pierre/diffs";
import { CodeView, type CodeViewHandle, WorkerPoolContextProvider } from "@pierre/diffs/react";
import { ArrowLeft, ChevronRight, ExternalLink, WrapText, X } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OutboundLink } from "@/components/outbound-link";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-provider";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { closeReview, closeTab, openFile, useReview } from "@/stores/review";
import { isPicture, type Run } from "../../../shared/types";
import { CHANGE_MARK } from "./changes-tab";
import { HIGHLIGHT, POOL, REVIEW_STYLE } from "./diff-config";
import { FileIcon } from "./file-icon";
import { baseName, changesOf } from "./file-tree";
import { fileHref } from "./files-tab";

const tw = t.workspace;
const tr = t.review;
const VIEW_MAX = 2_000_000;
// Editor type, a size up from a review's, which fits two versions side by side.
const EDITOR_STYLE = { ...REVIEW_STYLE, "--diffs-font-size": "13px" } as CSSProperties;
// The renderer always keeps a sideways scrollbar under the code, drawn as a band across the view wherever scrollbars are
// set to always show. An editor has one only when a line really runs past the edge, and no padding below the last line.
const EDITOR_CSS = `
  :host { --diffs-scrollbar-gutter: 0px; --diffs-scrollbar-gutter-fallback: 0px; }
  [data-code] { overflow-x: auto; padding-bottom: 0; scrollbar-width: thin; scrollbar-color: transparent transparent; }
  [data-code]:hover { scrollbar-color: var(--diffs-bg-context) transparent; }
`;

type Loaded = { text?: string; error?: string; big?: boolean };
// Switching back to a tab shows what it held at once, then refreshes; and lands where it was left.
const loadedFiles = new Map<string, Loaded>();
const scrolledTo = new Map<string, number>();

// Files of the board's folder read whole, in tabs over the canvas like an editor's, highlighted off the main thread.
export default function FileView({ run }: { run: Run }) {
  const path = useReview((s) => s.file);
  const tabs = useReview((s) => s.tabs);
  const { resolvedTheme } = useTheme();
  const [wrap, setWrap] = useState(false);
  const [state, setState] = useState<Loaded>({});
  const href = path ? fileHref(run.id, path) : "";
  const picture = !!path && isPicture(path);
  // A file can change under an open tab whenever a task finishes.
  const finished = run.nodes.filter((n) => n.endedAt).length;
  const changes = useMemo(() => changesOf(run.nodes), [run.nodes]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: finished is the signal to look again.
  useEffect(() => {
    if (!href || picture) return;
    let alive = true;
    const done = (next: Loaded) => {
      loadedFiles.set(href, next);
      if (alive) setState(next);
    };
    setState(loadedFiles.get(href) ?? {});
    fetch(href)
      .then(async (res) => {
        if (!res.ok) throw new Error(tw.loadFailed);
        if (Number(res.headers.get("content-length") ?? 0) > VIEW_MAX) return done({ big: true });
        const text = await res.text();
        done(text.length > VIEW_MAX ? { big: true } : { text });
      })
      .catch((e: Error) => done({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [href, picture, finished]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) closeReview();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<CodeViewItem<undefined>[]>(
    () =>
      path && state.text !== undefined
        ? [{ id: `file:${path}`, type: "file", file: { name: path, contents: state.text }, version: 0 }]
        : [],
    [path, state.text],
  );
  const options = useMemo(
    () => ({
      ...HIGHLIGHT,
      themeType: resolvedTheme,
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      disableFileHeader: true,
      unsafeCSS: EDITOR_CSS,
      // Room to scroll the last line up to the top of the view, as an editor lets you.
      layout: { paddingTop: 4, paddingBottom: Math.round(window.innerHeight * 0.7), gap: 0 },
    }),
    [resolvedTheme, wrap],
  );

  // Each file gets its own view: it goes back to where that file was, and remembers from there on.
  const remember = useCallback(
    (top: number) => {
      if (path) scrolledTo.set(path, top);
    },
    [path],
  );
  const restore = useCallback(
    (view: CodeViewHandle<undefined, undefined> | null) => {
      const top = path ? scrolledTo.get(path) : undefined;
      if (view && top) requestAnimationFrame(() => view.scrollTo({ type: "position", position: top }));
    },
    [path],
  );

  if (!path) return null;
  const tool =
    "size-6 rounded text-muted-foreground hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground [&_svg]:size-3.5";
  const note = "p-6 text-xs text-muted-foreground";
  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-label={path}
      className="satgas-file-view absolute inset-0 z-40 flex flex-col bg-background"
    >
      <header className="flex h-9 shrink-0 items-stretch border-b bg-card">
        <button
          type="button"
          onClick={closeReview}
          aria-label={tr.close}
          title={`${tr.close} (Esc)`}
          className="flex w-9 shrink-0 items-center justify-center border-e text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </button>
        <FileTabs tabs={tabs} active={path} changes={changes} />
        <div className="flex shrink-0 items-center gap-0.5 border-s px-1.5">
          {!picture && (
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={wrap}
              aria-label={tr.wrap}
              title={tr.wrap}
              className={tool}
              onClick={() => setWrap((v) => !v)}
            >
              <WrapText />
            </Button>
          )}
          <Button asChild variant="ghost" size="icon" className={tool}>
            <OutboundLink href={href} aria-label={tw.openRaw} title={tw.openRaw}>
              <ExternalLink />
            </OutboundLink>
          </Button>
        </div>
      </header>
      <Breadcrumb path={path} />
      {picture ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <img src={href} alt={path} className="max-h-full max-w-full rounded-md border" />
        </div>
      ) : state.error ? (
        <p className="p-6 text-xs text-destructive">{state.error}</p>
      ) : state.big ? (
        <p className={note}>{tw.tooBig}</p>
      ) : state.text === undefined ? (
        <p className={note}>{tr.loading}</p>
      ) : (
        <div className="flex min-h-0 flex-1">
          <WorkerPoolContextProvider poolOptions={POOL} highlighterOptions={HIGHLIGHT}>
            <CodeView
              key={path}
              ref={restore}
              onScroll={remember}
              items={items}
              options={options}
              className="min-w-0 flex-1"
              style={EDITOR_STYLE}
            />
          </WorkerPoolContextProvider>
        </div>
      )}
    </section>
  );
}

// Open files as editor tabs. Two files of one name say which folder each is from; a middle click closes, as in any editor.
function FileTabs({ tabs, active, changes }: { tabs: string[]; active: string; changes: ReturnType<typeof changesOf> }) {
  const bar = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the tab to bring into view changes with `active`.
  useEffect(() => {
    bar.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, tabs.length]);
  const names = tabs.map(baseName);
  const onKeyDown = (e: KeyboardEvent) => {
    const at = tabs.indexOf(active);
    const next = e.key === "ArrowRight" ? tabs[at + 1] : e.key === "ArrowLeft" ? tabs[at - 1] : undefined;
    if (e.key === "Delete") closeTab(active);
    if (!next) return;
    e.preventDefault();
    openFile(next);
    requestAnimationFrame(() => bar.current?.querySelector<HTMLElement>("[aria-selected='true']")?.focus());
  };
  return (
    <div
      ref={bar}
      role="tablist"
      aria-label={tw.tabs.files}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-1 overflow-x-auto no-scrollbar"
    >
      {tabs.map((p) => {
        const name = baseName(p);
        const on = p === active;
        const twin = names.filter((n) => n === name).length > 1;
        const change = changes.get(p);
        return (
          <div
            key={p}
            className={cn(
              "group/tab relative flex max-w-60 shrink-0 items-center border-e transition-colors",
              // The tab in view joins the editor: it takes its colour and covers the line under the bar.
              on ? "-mb-px bg-background before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-signal" : "hover:bg-muted",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              title={p}
              onClick={() => openFile(p)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(p);
              }}
              className="flex h-full min-w-0 items-center gap-1.5 ps-2.5 pe-1 text-[13px] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring"
            >
              <FileIcon name={name} />
              <span className={cn("truncate", change ? CHANGE_MARK[change].tone : !on && "text-muted-foreground")}>{name}</span>
              {twin && <span className="min-w-0 truncate text-xs text-muted-foreground">{p.slice(0, -name.length - 1)}</span>}
            </button>
            <button
              type="button"
              aria-label={`${tw.closeTab} ${name}`}
              title={tw.closeTab}
              onClick={() => closeTab(p)}
              className={cn(
                "me-1.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                !on && "opacity-0 group-hover/tab:opacity-100",
              )}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Where the open file sits, under the tabs, as VS Code's breadcrumbs show it.
function Breadcrumb({ path }: { path: string }) {
  const parts = path.split("/");
  const name = parts.pop() ?? path;
  return (
    <nav aria-label={path} className="flex h-[22px] shrink-0 items-center gap-0.5 overflow-hidden px-3 text-xs text-muted-foreground">
      {parts.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a path's folders never reorder.
        <span key={i} className="flex shrink-0 items-center gap-0.5">
          <span>{p}</span>
          <ChevronRight className="size-3" aria-hidden="true" />
        </span>
      ))}
      <span className="flex min-w-0 items-center gap-1 text-foreground">
        <FileIcon name={name} />
        <span className="truncate">{name}</span>
      </span>
    </nav>
  );
}
