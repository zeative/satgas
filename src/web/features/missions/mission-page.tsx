import { Link } from "@tanstack/react-router";
import {
  Copy,
  Download,
  FileDown,
  GitFork,
  GitMerge,
  GitPullRequest,
  ImageDown,
  LoaderCircle,
  Maximize2,
  MessagesSquare,
  MoreHorizontal,
  PanelLeftOpen,
  PanelRight,
  Pencil,
  RotateCcw,
  RotateCw,
  Search,
  Shapes,
  Share,
  Sheet,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { type CSSProperties, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClaudeMark, CodexMark } from "@/components/brand-marks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoMark } from "@/components/logo";
import { RichText } from "@/components/rich-text";
import { StatusIcon } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSearch } from "@/context/search-provider";
import { isMac, t } from "@/i18n";
import { copyReport, deleteMission, finalReport, forkMission, isLiveRun, mergeMission, runAgain } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { setBoardView, useBoardView } from "@/stores/board-view";
import { usePanel } from "@/stores/panel";
import { resetReview, useReview } from "@/stores/review";
import { loadRuns, organizeBoard, setBoardIcon, setBoardLearning, useRuns, watch } from "@/stores/runs";
import { toggleWorkspace, useWorkspace } from "@/stores/workspace";
import { taskCodes } from "../../../shared/graph";
import { type AgentKind, isUnread, type Run } from "../../../shared/types";
import { exportBackup, exportTables, requestBoardExport } from "../board/export";
import { focusBoard, landOnCard } from "../board/focus";
import { WorkspacePanel } from "../workspace/workspace-panel";
import { BoardName } from "./board-name";
import { ChatPanel } from "./chat-panel";
import { CiteButton } from "./cite";
import { PanelResizer } from "./panel-resizer";
import { PullsButton } from "./pulls";
import { RenameSessionDialog, SessionCrumb, SessionSidebar } from "./sessions";

const BoardIconPicker = lazy(() => import("./board-icon-picker"));
// The diff renderer, its highlighter and worker load only when a review is opened.
// Chat Only and phones need no canvas until someone opens it; the details panel loads when first asked for.
const BoardCanvas = lazy(() => import("../board/board-canvas").then((m) => ({ default: m.BoardCanvas })));
const Inspector = lazy(() => import("./inspector").then((m) => ({ default: m.Inspector })));
const DiffReview = lazy(() => import("../workspace/diff-review"));
const FileView = lazy(() => import("../workspace/file-view"));

// Floating panels get their own GPU layer, so a composited card underneath can never paint through them.
const PANEL = "absolute inset-y-3 right-3 z-20 w-[min(var(--panel-w),calc(100%-1.5rem))] transform-gpu max-md:inset-0 max-md:w-full";

export function MissionPage({ missionId, focusTask }: { missionId: string; focusTask?: string }) {
  const run = useRuns((s) => (s.run?.id === missionId ? s.run : null));
  const known = useRuns((s) => (s.runs ? s.runs.some((r) => r.id === missionId) : null));
  const runsError = useRuns((s) => s.runsError);
  const offline = useRuns((s) => s.conn === "closed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The right side holds the chat by default; a task's or the mission's details take its place until closed.
  const [side, setSide] = useState<"chat" | "details" | null>("chat");
  const panelOpen = side !== null;
  const panelWidth = usePanel((s) => s.width);
  const workspaceOpen = useWorkspace((s) => s.open);
  const reviewing = useReview((s) => s.scope !== null);
  const reading = useReview((s) => !!s.file);
  // A review belongs to one board; going to another board or leaving closes it, since the page itself stays mounted.
  // biome-ignore lint/correctness/useExhaustiveDependencies: missionId is the signal to close.
  useEffect(() => resetReview, [missionId]);

  const view = useBoardView(missionId);
  // ⌘J switches between the canvas and Chat Only; it works while typing, since the chat is where one types.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "j") return;
      e.preventDefault();
      setBoardView(missionId, view === "chat" ? "canvas" : "chat");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [missionId, view]);
  // Opening a card or task from Chat Only brings the canvas back and lands on it once the board has drawn.
  const openCanvas = useCallback(
    (cardId?: string) => {
      if (cardId) landOnCard(cardId);
      setBoardView(missionId, "canvas");
    },
    [missionId],
  );

  // ⌘B opens and closes the Workspace panel, unless the person is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return;
      if ((e.target as Element | null)?.closest?.("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      toggleWorkspace();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The canvas's "Waiting on you" asks for the chat when an answer is written there (the lead's questions).
  useEffect(() => {
    const open = () => {
      setSelectedId(null);
      setSide("chat");
    };
    window.addEventListener("satgas:open-chat", open);
    return () => window.removeEventListener("satgas:open-chat", open);
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setSide("chat");
    watch(missionId);
    return () => watch(null);
  }, [missionId]);

  // Opening a board reads it; one that finishes while it is open on screen is read too.
  const unread = run ? isUnread(run) : false;
  useEffect(() => {
    if (!unread) return;
    const read = () => {
      if (document.visibilityState === "visible") void organizeBoard(missionId, { seen: true }).catch(() => {});
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => document.removeEventListener("visibilitychange", read);
  }, [unread, missionId]);

  // A link from the Pipeline names a task: open its details and bring it to the middle once the board is here.
  const focused = useRef<string | null>(null);
  const hasTask = !!focusTask && !!run?.nodes.some((n) => n.id === focusTask);
  useEffect(() => {
    const key = `${missionId}:${focusTask}`;
    if (!focusTask || !hasTask || focused.current === key) return;
    focused.current = key;
    setSelectedId(focusTask);
    setSide("details");
    // Not cleared on cleanup: StrictMode's second pass returns early above and must not cancel the first.
    setTimeout(() => window.dispatchEvent(new CustomEvent("satgas:focus", { detail: focusTask })), 300);
  }, [missionId, focusTask, hasTask]);

  const openReport = useCallback(() => {
    setSelectedId(null);
    setSide("details");
  }, []);
  const hideChat = useCallback(() => {
    setSide(null);
    focusBoard();
  }, []);
  const closePanel = useCallback(() => {
    setSide("chat");
    setSelectedId(null);
    focusBoard();
  }, []);

  // Clicking a node opens its details; clicking empty canvas returns to the chat.
  const selectOnCanvas = useCallback((id: string | null) => {
    if (!id) {
      setSelectedId(null);
      setSide((v) => (v === "details" ? "chat" : v));
      return;
    }
    setSelectedId(id);
    setSide("details");
  }, []);

  // Escape leaves the details for the chat unless a field, menu or dialog owns the key.
  useEffect(() => {
    if (side !== "details") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as Element).closest("input, textarea, [role='dialog'], [role='alertdialog'], [role='menu']")) return;
      closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [side, closePanel]);

  const codes = useMemo(() => taskCodes(run?.nodes ?? []), [run?.nodes]);

  // Questions are answered in the chat, so it comes forward when the planner asks.
  const asking = run?.status === "asking";
  useEffect(() => {
    if (asking) setSide("chat");
  }, [asking]);

  if (!run) {
    return (
      <main
        id="content"
        className="relative flex h-svh flex-col overflow-hidden"
        style={{ "--panel-w": `${panelWidth}px` } as CSSProperties}
      >
        <BoardTitle />
        {known === false ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-12 text-center">
            <h1 className="text-lg font-medium">{t.notFoundTitle}</h1>
            <p className="text-sm text-muted-foreground">{t.notFoundLead}</p>
            <Button asChild size="sm" variant="secondary" className="mt-2">
              <Link to="/">{t.home}</Link>
            </Button>
          </div>
        ) : known === null && runsError && !offline ? (
          <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-12 text-center">
            <p className="text-sm text-muted-foreground">{runsError}</p>
            <Button size="sm" variant="secondary" onClick={() => void loadRuns()}>
              <RotateCw />
              {t.retry}
            </Button>
          </div>
        ) : (
          <div className="relative flex-1" aria-busy="true">
            {offline && (
              <p role="status" className="absolute inset-x-0 top-1/2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                {t.reconnecting}
              </p>
            )}
            {!offline && (
              <p role="status" className="absolute inset-x-0 top-1/2 flex justify-center text-sm">
                <span className="satgas-shimmer">{t.openingBoard}</span>
              </p>
            )}
            <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
              <Skeleton className="h-12 w-full max-w-2xl rounded-2xl" />
            </div>
          </div>
        )}
      </main>
    );
  }

  const selected = selectedId ? run.nodes.find((n) => n.id === selectedId) : undefined;

  if (view === "chat") {
    return (
      <main id="content" className="relative flex h-svh overflow-hidden" style={{ "--panel-w": `${panelWidth}px` } as CSSProperties}>
        {workspaceOpen && <WorkspacePanel key={run.id} run={run} />}
        <SessionSidebar run={run} />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <BoardTitle run={run} docked />
          <div className="flex min-h-0 flex-1">
            <ChatPanel
              run={run}
              page
              onOpenCanvas={openCanvas}
              onOpenTask={(id) => {
                setBoardView(missionId, "canvas");
                selectOnCanvas(id);
              }}
              onOpenReport={() => {
                setBoardView(missionId, "canvas");
                openReport();
              }}
              onHide={() => setBoardView(missionId, "canvas")}
              className="min-w-0 flex-1"
            />
          </div>
          {reviewing && (
            <Suspense fallback={<div className="absolute inset-0 z-40 bg-background" />}>
              <DiffReview run={run} />
            </Suspense>
          )}
          {reading && (
            <Suspense fallback={<div className="absolute inset-0 z-40 bg-background" />}>
              <FileView run={run} />
            </Suspense>
          )}
        </div>
        <RenameSessionDialog />
        <CiteButton runId={run.id} />
      </main>
    );
  }
  // Opens the chat from any panel; only an already open chat closes.
  const toggleChat = () => setSide((v) => (v === "chat" ? null : "chat"));
  const openDetails = () => {
    setSelectedId(null);
    setSide((v) => (v === "details" ? "chat" : "details"));
  };

  return (
    <main id="content" className="relative flex h-svh overflow-hidden" style={{ "--panel-w": `${panelWidth}px` } as CSSProperties}>
      {workspaceOpen && <WorkspacePanel key={run.id} run={run} />}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <BoardTitle run={run} panelOpen={side === "details"} onTogglePanel={openDetails} />
        <BoardPresence run={run} panelOpen={panelOpen} chatOpen={side === "chat"} onToggleChat={toggleChat} />

        <div className="relative min-h-0 flex-1">
          {/* Lead stays on the board for every round and says what it is doing itself. */}
          <Suspense fallback={<div className="absolute inset-0" />}>
            <BoardCanvas key={run.id} run={run} selectedTaskId={selectedId} onSelectTask={selectOnCanvas} panelOpen={panelOpen} />
          </Suspense>
          {!run.nodes.length && (run.status === "failed" || run.status === "cancelled") && (
            <p
              className={cn(
                "pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6 text-center text-sm text-muted-foreground",
                panelOpen && "lg:pe-[calc(var(--panel-w)+1.5rem)]",
              )}
            >
              {run.status === "failed" ? t.noPlanFailed : t.noPlanCancelled}
            </p>
          )}

          {side !== null && <PanelResizer />}
          {side === "details" && (
            <Suspense fallback={null}>
              <Inspector run={run} codes={codes} selected={selected} onSelect={setSelectedId} onClose={closePanel} className={PANEL} />
            </Suspense>
          )}
          {side === "chat" && (
            <ChatPanel run={run} onOpenTask={selectOnCanvas} onOpenReport={openReport} onHide={hideChat} className={PANEL} />
          )}
        </div>
        <RenameSessionDialog />
        <CiteButton runId={run.id} />
        {reviewing && (
          <Suspense fallback={<div className="absolute inset-0 z-40 bg-background" />}>
            <DiffReview run={run} />
          </Suspense>
        )}
        {reading && (
          <Suspense fallback={<div className="absolute inset-0 z-40 bg-background" />}>
            <FileView run={run} />
          </Suspense>
        )}
      </div>
    </main>
  );
}

interface TitleProps {
  run?: Run;
  // Chat Only: a bar across the top of the conversation instead of a card floating over the canvas.
  docked?: boolean;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
}

// The board's only chrome at the top: a way home, the board's name, and the actions that are not prompts.
function BoardTitle({ run, docked, panelOpen, onTogglePanel }: TitleProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [pullsOpen, setPullsOpen] = useState(false);
  const workspaceOpen = useWorkspace((s) => s.open);
  // Set by the menu's Rename; the menu would hand focus back to its button and end the edit at once.
  const renameNext = useRef(false);
  const live = run ? isLiveRun(run) : false;
  const hasReport = run ? !!finalReport(run) : false;

  return (
    <div
      className={
        docked
          ? "flex h-9 shrink-0 items-center border-b px-2"
          : "pointer-events-none absolute top-3 left-3 z-20 flex max-w-[calc(100%-9.75rem)] md:max-w-[calc(100%-1.5rem)] lg:max-w-md"
      }
    >
      <div
        className={cn(
          "pointer-events-auto flex min-w-0 items-center gap-1",
          docked ? "flex-1" : "h-10 rounded-xl border bg-card px-1.5 shadow-sm",
        )}
      >
        {run && !workspaceOpen && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.workspace.open}
              title={`${t.workspace.open} (${isMac ? "⌘B" : "Ctrl B"})`}
              onClick={() => toggleWorkspace(true)}
              className="size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground max-md:hidden"
            >
              <PanelLeftOpen />
            </Button>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border max-md:hidden" />
          </>
        )}
        <Link
          to="/"
          aria-label={t.backHome}
          title={t.backHome}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LogoMark className="size-4.5" />
        </Link>
        {run && (
          <>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
            <StatusIcon status={run.status} className="ms-1" />
            {/* A phone's title bar keeps its width for the board and session names. */}
            <span className="contents max-md:hidden">
              <BoardIcon run={run} />
            </span>
            <BoardName run={run} editing={renaming} onEditingChange={setRenaming} className="pe-1.5 text-sm font-medium" />
            {docked && <SessionCrumb run={run} />}
            {docked && <span className="flex-1" />}
            {docked && (
              <Button
                variant="ghost"
                size="sm"
                title={`${t.view.backToCanvas} (${isMac ? "⌘J" : "Ctrl J"})`}
                onClick={() => setBoardView(run.id, "canvas")}
                className="h-8 shrink-0 gap-1.5 rounded-lg px-2.5 text-muted-foreground hover:text-foreground"
              >
                <Shapes />
                <span className="max-md:sr-only">{t.view.canvas}</span>
              </Button>
            )}
            <PullsButton run={run} open={pullsOpen} onOpenChange={setPullsOpen} />
            <ExportMenu run={run} />
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                  aria-label={t.moreActions}
                  title={t.moreActions}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-64"
                onCloseAutoFocus={(e) => {
                  if (!renameNext.current) return;
                  e.preventDefault();
                  renameNext.current = false;
                  setRenaming(true);
                }}
              >
                {!workspaceOpen && (
                  <DropdownMenuItem className="md:hidden" onClick={() => toggleWorkspace(true)}>
                    <PanelLeftOpen />
                    {t.workspace.open}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => (renameNext.current = true)}>
                  <Pencil />
                  {t.rename}
                </DropdownMenuItem>
                {!docked && (
                  <DropdownMenuItem onClick={onTogglePanel}>
                    <PanelRight />
                    {panelOpen ? t.closePanel : t.details}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setBoardView(run.id, docked ? "canvas" : "chat")}>
                  {docked ? <Shapes /> : <Maximize2 />}
                  {docked ? t.view.backToCanvas : t.view.chat}
                  <DropdownMenuShortcut>{isMac ? "⌘J" : "Ctrl J"}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!hasReport} onClick={() => void copyReport(run)} className="items-start">
                  <Copy className="mt-0.5" />
                  <div className="flex flex-col">
                    <span>{t.copyReport}</span>
                    {!hasReport && <span className="text-xs text-muted-foreground">{t.reportPending}</span>}
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void runAgain(run)}>
                  <RotateCcw />
                  {t.runAsNew}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={live} onClick={() => void forkMission(run)} className="items-start">
                  <GitFork className="mt-0.5" />
                  <div className="flex flex-col">
                    <span>{t.fork.fork}</span>
                    <span className="text-xs text-muted-foreground">{live ? t.fork.waitLive : t.fork.forkHint}</span>
                  </div>
                </DropdownMenuItem>
                {run.forkOf && (
                  <DropdownMenuItem disabled={live} onClick={() => void mergeMission(run)} className="items-start">
                    <GitMerge className="mt-0.5" />
                    <div className="flex min-w-0 flex-col">
                      <span>{t.fork.merge}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {live ? t.fork.waitLive : t.fork.mergeHint(run.forkOf.title)}
                      </span>
                    </div>
                  </DropdownMenuItem>
                )}
                <DropdownMenuCheckboxItem
                  checked={!run.noMemory}
                  onCheckedChange={(on) => void setBoardLearning(run.id, on).catch((e: Error) => toast.error(e.message))}
                  className="items-start"
                >
                  <div className="flex flex-col">
                    <span>{t.memory.learnBoard}</span>
                    <span className="text-xs text-muted-foreground">{t.memory.learnBoardHint}</span>
                  </div>
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem onClick={() => setTimeout(() => setPullsOpen(true))}>
                  <GitPullRequest />
                  {run.pulls?.length ? t.pulls.title : t.pulls.link}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)} className="items-start">
                  <Trash2 className="mt-0.5" />
                  <div className="flex flex-col">
                    <span>{t.deleteMission}</span>
                    {live && <span className="text-xs text-muted-foreground">{t.deleteLive}</span>}
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={(open) => {
                if (deleting) return;
                setConfirmDelete(open);
                setDeleteError(null);
              }}
              title={t.confirmDeleteTitle}
              desc={
                <div className="flex flex-col gap-2">
                  <p>{run.ownWorkspace === false ? t.confirmDeleteKeepFiles : t.confirmDeleteText}</p>
                  {deleteError && (
                    <p className="text-destructive">
                      <RichText text={deleteError} />
                    </p>
                  )}
                </div>
              }
              cancelBtnText={t.keepMission}
              confirmText={deleting ? t.deleting : t.deleteMission}
              destructive
              isLoading={deleting}
              handleConfirm={async () => {
                setDeleting(true);
                setDeleteError(null);
                try {
                  await deleteMission(run);
                  setConfirmDelete(false);
                } catch (e) {
                  setDeleteError((e as Error).message);
                } finally {
                  setDeleting(false);
                }
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// The board's own emoji, picked like Miro's board icon; an empty slot shows a quiet smiley to add one.
function BoardIcon({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  const pick = (icon: string) => {
    setOpen(false);
    setBoardIcon(run.id, icon).catch((e: Error) => toast.error(e.message));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={run.icon ? t.boardIcon.change : t.boardIcon.add}
          title={run.icon ? t.boardIcon.change : t.boardIcon.add}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {run.icon || <SmilePlus className="size-4" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0">
        <Suspense
          fallback={
            <div className="flex h-80 w-[17.5rem] items-center justify-center text-sm text-muted-foreground">{t.boardIcon.loading}</div>
          }
        >
          <BoardIconPicker onPick={pick} />
        </Suspense>
        {run.icon && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => pick("")}>
              <X />
              {t.boardIcon.remove}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Ways to take the board out of Satgas: a picture, a printable PDF, its tables as CSV, or the whole board as a backup.
function ExportMenu({ run }: { run: Run }) {
  const tables = (run.board?.cards ?? []).some((c) => c.kind === "table" && c.rows?.length);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={t.exporter.label}
          title={t.exporter.label}
        >
          <Share />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onSelect={() => requestBoardExport("pdf")}>
          <FileDown />
          {t.exporter.pdf}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => requestBoardExport("png")}>
          <ImageDown />
          {t.exporter.image}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!tables} onSelect={() => exportTables(run)} className="items-start">
          <Sheet className="mt-0.5" />
          <div className="flex flex-col">
            <span>{t.exporter.csv}</span>
            {!tables && <span className="text-xs text-muted-foreground">{t.exporter.noTables}</span>}
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => exportBackup(run)}>
          <Download />
          {t.exporter.backup}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const AGENTS: { kind: AgentKind; Mark: (p: { className?: string }) => React.ReactNode }[] = [
  { kind: "claude", Mark: ClaudeMark },
  { kind: "codex", Mark: CodexMark },
];

// The board's counterpart to collaborator avatars: the agents working on it, ringed in the signal while they work.
function BoardPresence({
  run,
  panelOpen,
  chatOpen,
  onToggleChat,
}: {
  run: Run;
  panelOpen: boolean;
  chatOpen: boolean;
  onToggleChat: () => void;
}) {
  const { setOpen: openSearch } = useSearch();
  const planning = run.status === "planning";
  const present = AGENTS.map(({ kind, Mark }) => {
    const tasks = run.nodes.filter((n) => n.agent === kind);
    const running = tasks.filter((n) => n.status === "running").length + (planning && kind === "claude" ? 1 : 0);
    const done = tasks.filter((n) => n.status === "done").length;
    return { kind, Mark, running, done, shown: tasks.length > 0 || (planning && kind === "claude") };
  }).filter((a) => a.shown);

  return (
    <div className={cn("pointer-events-none absolute top-3 right-3 z-20 flex", panelOpen && "lg:right-[calc(var(--panel-w)+1.5rem)]")}>
      <div className="pointer-events-auto flex h-10 items-center gap-1 rounded-xl border bg-card px-1.5 shadow-sm">
        {present.length > 0 && (
          <>
            <ul aria-label={t.agentsOnBoard} className="flex -space-x-1.5 px-1">
              {present.map(({ kind, Mark, running, done }) => {
                const label = `${t.agent[kind]} · ${planning && kind === "claude" ? t.run.planning : t.agentStatus(running, done)}`;
                return (
                  <li key={kind}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          role="img"
                          aria-label={label}
                          className={cn(
                            "flex size-7 items-center justify-center rounded-full border-2 border-card bg-muted",
                            running > 0 && "ring-2 ring-signal",
                          )}
                        >
                          <Mark className="size-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{label}</TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
          </>
        )}
        <PillButton label={`${t.search} (${isMac ? "⌘K" : "Ctrl K"})`} onClick={() => openSearch(true)}>
          <Search />
        </PillButton>
        <PillButton label={chatOpen ? t.chat.hide : t.chat.open} pressed={chatOpen} onClick={onToggleChat}>
          <MessagesSquare />
        </PillButton>
      </div>
    </div>
  );
}

function PillButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn("size-7 rounded-lg text-muted-foreground hover:text-foreground", pressed && "bg-accent text-foreground")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
