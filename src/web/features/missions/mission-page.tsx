import { Link } from "@tanstack/react-router";
import {
  Copy,
  Download,
  FileDown,
  ImageDown,
  LoaderCircle,
  MessagesSquare,
  MoreHorizontal,
  PanelRight,
  RotateCcw,
  RotateCw,
  Search,
  Share,
  Sheet,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClaudeMark, CodexMark } from "@/components/brand-marks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoMark } from "@/components/logo";
import { StatusIcon } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSearch } from "@/context/search-provider";
import { isMac, t } from "@/i18n";
import { copyReport, deleteMission, finalReport, isLiveRun, runAgain } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { loadRuns, setBoardIcon, useRuns, watch } from "@/stores/runs";
import { taskCodes } from "../../../shared/graph";
import type { AgentKind, Run } from "../../../shared/types";
import { BoardCanvas, focusBoard } from "../board/board-canvas";
import { exportBackup, exportTables, requestBoardExport } from "../board/export";
import { ChatPanel } from "./chat-panel";
import { GhostPlan } from "./ghost-plan";
import { Inspector } from "./inspector";

const BoardIconPicker = lazy(() => import("./board-icon-picker"));

export function MissionPage({ missionId }: { missionId: string }) {
  const run = useRuns((s) => (s.run?.id === missionId ? s.run : null));
  const known = useRuns((s) => (s.runs ? s.runs.some((r) => r.id === missionId) : null));
  const runsError = useRuns((s) => s.runsError);
  const offline = useRuns((s) => s.conn === "closed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The right side holds the chat by default; a task's or the mission's details take its place until closed.
  const [side, setSide] = useState<"chat" | "details" | null>("chat");
  const panelOpen = side !== null;

  useEffect(() => {
    setSelectedId(null);
    setSide("chat");
    watch(missionId);
    return () => watch(null);
  }, [missionId]);

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

  if (!run) {
    return (
      <main id="content" className="relative flex h-svh flex-col overflow-hidden">
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
            <div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
              <Skeleton className="h-12 w-full max-w-2xl rounded-2xl" />
            </div>
          </div>
        )}
      </main>
    );
  }

  const selected = selectedId ? run.nodes.find((n) => n.id === selectedId) : undefined;
  const toggleChat = () => setSide((v) => (v ? null : "chat"));
  const openDetails = () => {
    setSelectedId(null);
    setSide((v) => (v === "details" ? "chat" : "details"));
  };

  return (
    <main id="content" className="relative flex h-svh flex-col overflow-hidden">
      <BoardTitle run={run} panelOpen={side === "details"} onTogglePanel={openDetails} />
      <BoardPresence run={run} panelOpen={panelOpen} chatOpen={side === "chat"} onToggleChat={toggleChat} />

      <div className="relative min-h-0 flex-1">
        {/* The ghost only stands in for a board that has nothing on it yet; a failed first plan still gets a working board. */}
        {run.status === "planning" && !run.nodes.length && !run.board?.cards.length ? (
          <Planning run={run} />
        ) : (
          <BoardCanvas run={run} codes={codes} selectedTaskId={selectedId} onSelectTask={selectOnCanvas} panelOpen={panelOpen} />
        )}
        {!run.nodes.length && (run.status === "failed" || run.status === "cancelled") && (
          <p
            className={cn(
              "pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-6 text-center text-sm text-muted-foreground",
              panelOpen && "lg:pe-[25.5rem]",
            )}
          >
            {run.status === "failed" ? t.noPlanFailed : t.noPlanCancelled}
          </p>
        )}

        {side === "details" && (
          <Inspector
            run={run}
            codes={codes}
            selected={selected}
            onSelect={setSelectedId}
            onClose={closePanel}
            className="absolute inset-y-3 right-3 z-20 w-[min(24rem,calc(100%-1.5rem))]"
          />
        )}
        {side === "chat" && (
          <ChatPanel
            run={run}
            onOpenTask={selectOnCanvas}
            onOpenReport={openReport}
            onHide={hideChat}
            className="absolute inset-y-3 right-3 z-20 w-[min(24rem,calc(100%-1.5rem))]"
          />
        )}
      </div>
    </main>
  );
}

interface TitleProps {
  run?: Run;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
}

// The board's only chrome at the top: a way home, the board's name, and the actions that are not prompts.
function BoardTitle({ run, panelOpen, onTogglePanel }: TitleProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const live = run ? isLiveRun(run) : false;
  const hasReport = run ? !!finalReport(run) : false;

  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] lg:max-w-md">
      <div className="pointer-events-auto flex h-10 min-w-0 items-center gap-1 rounded-xl border bg-card px-1.5 shadow-sm">
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
            <BoardIcon run={run} />
            <h1 className="truncate pe-1.5 text-sm font-medium" title={run.title ?? run.prompt}>
              {run.title ?? run.prompt}
            </h1>
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
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuItem onClick={onTogglePanel}>
                  <PanelRight />
                  {panelOpen ? t.closePanel : t.details}
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
                <DropdownMenuItem variant="destructive" disabled={live} onClick={() => setConfirmDelete(true)} className="items-start">
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
                  {deleteError && <p className="text-destructive">{deleteError}</p>}
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
    <div className={cn("pointer-events-none absolute top-3 right-3 z-20 flex", panelOpen && "lg:right-[calc(24rem+1.5rem)]")}>
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

function Planning({ run }: { run: Run }) {
  const live = run.status === "planning";
  return (
    <div className="satgas-grid flex h-full flex-col items-center justify-center gap-6 pb-32" aria-busy={live}>
      <GhostPlan />
      {live && <p className="satgas-shimmer text-sm">{t.plotting}</p>}
    </div>
  );
}
