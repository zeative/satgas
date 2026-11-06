import { Link } from "@tanstack/react-router";
import {
  AlarmClock,
  AlarmClockOff,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Mail,
  MailOpen,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClaudeMark, CodexMark, GitHubMark } from "@/components/brand-marks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { LogoMark } from "@/components/logo";
import { OutboundLink } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { StatusIcon, statusLabel } from "@/components/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Composer } from "@/features/missions/composer";
import { useNow } from "@/hooks/use-now";
import { useRepo } from "@/hooks/use-repo";
import { fmtAgo, fmtCompact, t } from "@/i18n";
import { deleteMission } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { loadRuns, type Organize, organizeBoard, searchBoards, useRuns } from "@/stores/runs";
import { type AgentKind, isUnread, type RunSummary, type SearchHit } from "../../../shared/types";
import { BoardThumb } from "./board-thumb";

const RECENT = 6;
const SKELETONS = ["a", "b", "c"];

export function HomePage() {
  return (
    <main id="content" className="relative flex-1 overflow-x-clip">
      {/* The same line grid the boards are drawn on, fading out under the prompt. */}
      <div aria-hidden="true" className="satgas-hero-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem]" />
      <PageHeader actions={<HomeActions />} />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pt-[16vh] pb-20 sm:px-6 md:gap-20 md:pt-[22vh]">
        <section aria-labelledby="start-new" className="mx-auto flex w-full max-w-[44rem] flex-col items-center gap-10 text-center">
          <div className="flex flex-col gap-3">
            <h1
              id="start-new"
              className="flex items-center justify-center gap-2 brand-title text-[clamp(1.25rem,6vw,1.75rem)] leading-tight whitespace-nowrap md:gap-3 md:text-[2rem]"
            >
              <LogoMark className="size-6 md:size-8" />
              {t.composeTitle}
            </h1>
          </div>
          <Composer className="w-full text-start" />
        </section>

        <RecentBoards />
      </div>
    </main>
  );
}

const AGENT_MARKS: { kind: AgentKind; Mark: (p: { className?: string }) => React.ReactNode }[] = [
  { kind: "claude", Mark: ClaudeMark },
  { kind: "codex", Mark: CodexMark },
];

// Whether this machine can run missions at all: which agent CLIs the server found, and where the source lives.
function HomeActions() {
  const agents = useRuns((s) => s.config.agents);
  const repo = useRepo();

  const ready = agents ? AGENT_MARKS.filter(({ kind }) => agents[kind]) : [];
  const summary = !agents
    ? null
    : ready.length === AGENT_MARKS.length
      ? t.agentsReady
      : ready[0]
        ? t.agentReady(t.agent[ready[0].kind])
        : t.noAgents;

  return (
    <>
      {agents && (
        <div
          role="status"
          className="flex h-8 items-center gap-2 rounded-full border bg-card ps-1.5 pe-1.5 text-xs text-muted-foreground shadow-xs sm:pe-3"
        >
          <span className="flex -space-x-1">
            {AGENT_MARKS.map(({ kind, Mark }) => {
              const version = agents[kind];
              const label = version ? `${t.agent[kind]} ${version}` : `${t.agent[kind]} · ${t.notInstalled}`;
              return (
                <Tooltip key={kind}>
                  <TooltipTrigger asChild>
                    <span
                      role="img"
                      aria-label={label}
                      className={cn(
                        "flex size-5.5 items-center justify-center rounded-full border border-card bg-muted",
                        !version && "opacity-40 grayscale",
                      )}
                    >
                      <Mark className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </span>
          <span className="max-sm:sr-only">{summary}</span>
        </div>
      )}
      {repo &&
        (repo.stars === null ? (
          <Button asChild variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:text-foreground">
            <OutboundLink href={repo.url} aria-label={t.sourceOnGitHub} title={t.sourceOnGitHub}>
              <GitHubMark />
            </OutboundLink>
          </Button>
        ) : (
          <OutboundLink
            href={repo.url}
            title={t.sourceOnGitHub}
            aria-label={`${t.sourceOnGitHub}, ${t.stars(repo.stars)}`}
            className="flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs text-muted-foreground shadow-xs transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GitHubMark className="size-3.5" />
            <Star className="size-3" aria-hidden="true" />
            <span className="tabular-nums">{fmtCompact(repo.stars)}</span>
          </OutboundLink>
        ))}
    </>
  );
}

// Snooze choices: an hour from now, tomorrow morning, or Monday morning.
function snoozeUntil(choice: "hour" | "tomorrow" | "week", now = new Date()): number {
  if (choice === "hour") return now.getTime() + 60 * 60_000;
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + (choice === "tomorrow" ? 1 : (8 - d.getDay()) % 7 || 7));
  return d.getTime();
}

type View = "active" | "archived" | "snoozed";

function RecentBoards() {
  const runs = useRuns((s) => s.runs);
  const error = useRuns((s) => s.runsError);
  const [all, setAll] = useState(false);
  const [view, setView] = useState<View>("active");
  const [query, setQuery] = useState("");
  const hits = useSearch(query);
  // Relative times ("2 min ago") refresh twice a minute; a snooze ending shows within the same beat.
  const now = useNow(true, 30_000);

  const groups = useMemo(() => {
    const list = runs ?? [];
    const snoozed = (r: RunSummary) => !!r.snoozedUntil && r.snoozedUntil > now;
    return {
      pinned: list.filter((r) => r.pinned && !r.archived && !snoozed(r)),
      recent: list.filter((r) => !r.pinned && !r.archived && !snoozed(r)),
      archived: list.filter((r) => r.archived),
      snoozed: list.filter((r) => !r.archived && snoozed(r)),
    };
  }, [runs, now]);

  const searching = query.trim().length > 0;
  const byId = new Map((runs ?? []).map((r) => [r.id, r]));
  const found = hits.list?.flatMap((h) => {
    const r = byId.get(h.id);
    return r ? [{ run: r, snippet: h.snippet }] : [];
  });
  const shown = !runs ? null : view === "archived" ? groups.archived : view === "snoozed" ? groups.snoozed : groups.recent;
  const limited = shown && view === "active" && !all ? shown.slice(0, RECENT) : shown;
  const heading = searching
    ? t.organize.search
    : view === "archived"
      ? t.organize.archived(groups.archived.length)
      : view === "snoozed"
        ? t.organize.snoozed(groups.snoozed.length)
        : t.organize.recent;

  return (
    <section aria-labelledby="recent-boards" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {view !== "active" && !searching && (
            <button
              type="button"
              onClick={() => setView("active")}
              className="flex items-center gap-1 rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              {t.organize.back}
            </button>
          )}
          <h2 id="recent-boards" className="text-sm font-medium text-muted-foreground">
            {heading}
          </h2>
        </div>
        <div className="flex items-center gap-3 max-sm:w-full">
          {view === "active" && !searching && (
            <>
              {groups.snoozed.length > 0 && (
                <button type="button" onClick={() => setView("snoozed")} className={QUIET_LINK}>
                  {t.organize.snoozed(groups.snoozed.length)}
                </button>
              )}
              {groups.archived.length > 0 && (
                <button type="button" onClick={() => setView("archived")} className={QUIET_LINK}>
                  {t.organize.archived(groups.archived.length)}
                </button>
              )}
              {shown && shown.length > RECENT && (
                <button type="button" onClick={() => setAll((v) => !v)} className={QUIET_LINK}>
                  {all ? t.showLess : t.showAll(shown.length)}
                </button>
              )}
            </>
          )}
          <div className="relative max-sm:min-w-40 max-sm:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder={t.organize.search}
              aria-label={t.organize.search}
              className="h-8 w-full rounded-lg border bg-card ps-8 sm:w-48 pe-2.5 text-xs shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
        </div>
      </div>

      {error && !runs ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <p>
            <RichText text={error} />
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadRuns()}>
            {t.retry}
          </Button>
        </div>
      ) : searching ? (
        <SearchResults found={found} busy={hits.busy} query={query.trim()} now={now} />
      ) : limited && !limited.length && !(view === "active" && groups.pinned.length) ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t.missionsEmpty}</p>
      ) : (
        <div className="flex flex-col gap-8">
          {view === "active" && groups.pinned.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Pin className="size-3" aria-hidden="true" />
                {t.organize.pinned}
              </h3>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groups.pinned.map((r) => (
                  <BoardCard key={r.id} run={r} now={now} />
                ))}
              </ul>
            </div>
          )}
          {limited && limited.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {limited.map((r) => (
                <BoardCard key={r.id} run={r} now={now} />
              ))}
            </ul>
          )}
          {!limited && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SKELETONS.map((k) => (
                <li key={k} className="flex flex-col gap-3">
                  <Skeleton className="aspect-[16/10] w-full rounded-xl" />
                  <div className="flex flex-col gap-1.5 px-0.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

const QUIET_LINK =
  "rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// Asks the server once typing pauses; a newer query cancels the one still out.
function useSearch(query: string) {
  const [state, setState] = useState<{ list: SearchHit[] | null; busy: boolean }>({ list: null, busy: false });
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setState({ list: null, busy: false });
      return;
    }
    setState((s) => ({ ...s, busy: true }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchBoards(q, ctrl.signal)
        .then((list) => setState({ list, busy: false }))
        .catch(() => {
          if (!ctrl.signal.aborted) setState({ list: [], busy: false });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);
  return state;
}

function SearchResults({
  found,
  busy,
  query,
  now,
}: {
  found?: { run: RunSummary; snippet: string }[];
  busy: boolean;
  query: string;
  now: number;
}) {
  if (!found) return <p className="text-sm text-muted-foreground">{t.organize.searching}</p>;
  if (!found.length && !busy)
    return (
      <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t.organize.noHits(query)}</p>
    );
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-xs text-muted-foreground">
        {busy ? t.organize.searching : t.organize.hits(found.length)}
      </p>
      <ul className="flex flex-col overflow-hidden rounded-xl border">
        {found.map(({ run, snippet }) => (
          <li key={run.id} className="border-b last:border-b-0">
            <Link
              to="/boards/$boardId"
              params={{ boardId: run.id }}
              className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <StatusIcon status={run.status} className="size-3.5 shrink-0" />
                {run.icon && <span>{run.icon}</span>}
                <span className="truncate">{run.title ?? run.prompt}</span>
                <span className="ms-auto shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                  {fmtAgo(run.createdAt, now)}
                </span>
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{snippet}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SNOOZE_TIME = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

// A framed miniature of the board, cropped at the bottom edge like a sheet on a desk, then its title and when it ran.
function BoardCard({ run, now }: { run: RunSummary; now: number }) {
  const unread = isUnread(run, now);
  const snoozed = !!run.snoozedUntil && run.snoozedUntil > now;
  const act = (patch: Organize) => void organizeBoard(run.id, patch).catch((e: Error) => toast.error(e.message));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const live = run.status === "planning" || run.status === "running";
  return (
    <li className="group relative">
      <Link
        to="/boards/$boardId"
        params={{ boardId: run.id }}
        title={run.prompt}
        className="flex flex-col gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted/70 transition-colors group-hover:bg-muted">
          <div className="satgas-grid absolute inset-x-5 top-5 -bottom-px rounded-t-md border border-b-0 bg-card shadow-xs transition-transform duration-200 ease-out group-hover:-translate-y-1 motion-reduce:transition-none">
            <BoardThumb preview={run.preview} className="absolute inset-0 p-3" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-0.5">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            {unread && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-signal"
                role="img"
                aria-label={t.organize.unread}
                title={t.organize.unread}
              />
            )}
            <span className="truncate">
              {run.icon && <span className="me-1.5">{run.icon}</span>}
              {run.title ?? run.prompt}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusIcon status={run.status} className="size-3.5" />
            <span>{statusLabel(run.status)}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate tabular-nums">
              {snoozed && run.snoozedUntil ? t.organize.snoozedUntil(SNOOZE_TIME.format(run.snoozedUntil)) : fmtAgo(run.createdAt, now)}
            </span>
          </span>
        </div>
      </Link>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            aria-label={t.organize.menu}
            title={t.organize.menu}
            className="absolute top-2 right-2 size-7 rounded-lg border bg-card/90 text-muted-foreground opacity-0 shadow-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:text-foreground data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!run.archived && (
            <DropdownMenuItem onClick={() => act({ pinned: !run.pinned })}>
              {run.pinned ? <PinOff /> : <Pin />}
              {run.pinned ? t.organize.unpin : t.organize.pin}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => act({ seen: unread })}>
            {unread ? <MailOpen /> : <Mail />}
            {unread ? t.organize.markRead : t.organize.markUnread}
          </DropdownMenuItem>
          {snoozed ? (
            <DropdownMenuItem onClick={() => act({ snoozedUntil: null })}>
              <AlarmClockOff />
              {t.organize.wake}
            </DropdownMenuItem>
          ) : (
            !run.archived && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <AlarmClock />
                  {t.organize.snooze}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem onClick={() => act({ snoozedUntil: snoozeUntil("hour") })}>{t.organize.snoozeHour}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => act({ snoozedUntil: snoozeUntil("tomorrow") })}>
                    {t.organize.snoozeTomorrow}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => act({ snoozedUntil: snoozeUntil("week") })}>{t.organize.snoozeWeek}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => act({ archived: !run.archived })}>
            {run.archived ? <ArchiveRestore /> : <Archive />}
            {run.archived ? t.organize.restore : t.organize.archive}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setTimeout(() => setConfirmDelete(true))}>
            <Trash2 />
            {t.deleteMission}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t.confirmDeleteTitle}
        desc={
          <div className="flex flex-col gap-2">
            <p>{run.ownWorkspace === false ? t.confirmDeleteKeepFiles : t.confirmDeleteText}</p>
            {live && <p>{t.deleteLive}</p>}
          </div>
        }
        cancelBtnText={t.keepMission}
        confirmText={t.deleteMission}
        destructive
        handleConfirm={async () => {
          await deleteMission(run, { stay: true });
          setConfirmDelete(false);
        }}
      />
    </li>
  );
}
