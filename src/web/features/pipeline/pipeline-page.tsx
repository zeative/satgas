import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronDown, Columns3 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow } from "@/hooks/use-now";
import { fmtAgo, t } from "@/i18n";
import { avatarTint, avatarUri } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { loadPipeline, usePipeline } from "@/stores/pipeline";
import { watchPipeline } from "@/stores/runs";
import { activityAt, COLUMNS, type Column, isActive, type Lane, type LaneTask, type Range, shownIn, since } from "../../../shared/pipeline";
import { type CardKind, LaneCard } from "./lane-card";
import { useFlip } from "./use-flip";

const DONE_SHOWN = 2;

const MARK: Record<Column, string> = {
  next: "border-[1.25px] border-dashed border-muted-foreground/70",
  work: "bg-signal",
  need: "border-[1.25px] border-foreground",
  failed: "bg-destructive",
  done: "bg-emerald-600 dark:bg-emerald-500",
};

export function PipelinePage() {
  // Live lane events flow only while this page is open.
  useEffect(() => {
    watchPipeline(true);
    return () => watchPipeline(false);
  }, []);
  const lanes = usePipeline((s) => s.lanes);
  const error = usePipeline((s) => s.error);
  const [range, setRange] = useState<Range>("today");
  const [board, setBoard] = useState<string | null>(null);
  // The "today" boundary moves at midnight; a minute is fine-grained enough.
  const now = useNow(true, 60_000);
  const from = since(range, now);

  const sorted = useMemo(() => Object.values(lanes ?? {}).sort((a, b) => activityAt(b) - activityAt(a)), [lanes]);
  const active = sorted.filter((l) => isActive(l, from) && (!board || l.id === board));
  const counts = useMemo(() => {
    const c: Record<Column, number> = { next: 0, work: 0, need: 0, failed: 0, done: 0 };
    for (const l of active) {
      for (const task of l.tasks) {
        const col = shownIn(l, task, from);
        if (col) c[col]++;
      }
      if (l.status === "asking") c.need++;
    }
    return c;
  }, [active, from]);
  const grid = useRef<HTMLDivElement>(null);
  useFlip(grid);

  return (
    <>
      <PageHeader />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col px-4 pt-14 pb-12 sm:px-6">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
          <h1 className="text-base font-semibold">{t.pipeline.title}</h1>
          {lanes && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
              {[
                t.pipeline.working(counts.work),
                t.pipeline.need(counts.need),
                counts.failed > 0 && t.pipeline.failedCount(counts.failed),
                t.pipeline.boards(active.length),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="ms-auto flex items-center gap-2">
            <BoardFilter lanes={sorted} value={board} onChange={setBoard} />
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)} aria-label={t.pipeline.range}>
              <TabsList className="h-8 rounded-lg border bg-muted/40 p-0.5">
                <TabsTrigger
                  value="today"
                  className="h-6 rounded-md px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-xs"
                >
                  {t.pipeline.today}
                </TabsTrigger>
                <TabsTrigger
                  value="week"
                  className="h-6 rounded-md px-2.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-xs"
                >
                  {t.pipeline.week}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </header>

        {error && !lanes ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-24 text-center text-sm text-muted-foreground">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadPipeline()}>
              {t.retry}
            </Button>
          </div>
        ) : !lanes ? (
          <Loading />
        ) : (
          <div ref={grid} className="grid grid-cols-5 gap-x-2 max-md:min-w-[900px]">
            {COLUMNS.map((c) => (
              <div key={c} className="sticky top-12 z-10 flex h-9 items-center gap-2 border-b bg-background px-2 text-xs font-medium">
                <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", MARK[c])} />
                {t.pipeline.columns[c]}
                <span className="ms-auto font-normal text-muted-foreground tabular-nums">{counts[c]}</span>
              </div>
            ))}
            {active.length === 0 && (
              <div className="col-span-5 flex flex-col items-center gap-2 py-20 text-center">
                <Columns3 className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">{t.pipeline.empty}</p>
                <p className="max-w-sm text-xs text-muted-foreground">{t.pipeline.emptyHint}</p>
              </div>
            )}
            {active.map((lane) => (
              <LaneRow key={lane.id} lane={lane} from={from} now={now} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// One board: a thin label row, then its own five trays, so a card only ever slides sideways within its board.
const LaneRow = memo(function LaneRow({ lane, from, now }: { lane: Lane; from: number; now: number }) {
  const [open, setOpen] = useState(true);
  const [allDone, setAllDone] = useState(false);
  const names = useMemo(() => new Map(lane.team.map((m) => [m.id, m.name])), [lane.team]);
  const cells = useMemo(() => {
    const out: Record<Column, LaneTask[]> = { next: [], work: [], need: [], failed: [], done: [] };
    for (const task of lane.tasks) {
      const col = shownIn(lane, task, from);
      if (col) out[col].push(task);
    }
    out.done.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    return out;
  }, [lane, from]);
  const name = lane.title || lane.prompt;
  const meta =
    lane.status === "planning"
      ? t.pipeline.planning
      : lane.status === "asking"
        ? t.pipeline.asking
        : lane.status === "running"
          ? [lane.round > 0 && t.pipeline.round(lane.round + 1), lane.startedAt && fmtAgo(lane.startedAt, now)].filter(Boolean).join(" · ")
          : lane.endedAt
            ? fmtAgo(lane.endedAt, now)
            : "";
  // The lead's own moments sit with the team's work: planning is work in progress, questions wait on the person.
  const lead = (kind: CardKind) => (
    <LaneCard
      key={`${lane.id}:lead`}
      boardId={lane.id}
      kind={kind}
      name={t.team.lead}
      // The lead wears the same fixed face on every board.
      task={{ id: `${lane.id}:lead`, title: "", member: "Lead", status: "running", round: lane.round }}
      lead={
        kind === "ask"
          ? { title: t.pipeline.questions(lane.asked ?? 0), sub: lane.request ?? "" }
          : { title: lane.request ?? t.pipeline.planning, sub: t.team.planning }
      }
    />
  );

  return (
    <>
      <div className="col-span-5 mt-2 flex h-9 min-w-0 items-center gap-2 px-1 text-xs text-muted-foreground">
        <button
          type="button"
          aria-expanded={open}
          aria-label={t.pipeline.toggleLane(name)}
          onClick={() => setOpen((v) => !v)}
          className="grid size-5 shrink-0 place-items-center rounded transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
        </button>
        <span className="flex shrink-0" aria-hidden="true">
          {lane.team.slice(0, 5).map((m) => (
            <img
              key={m.id}
              src={avatarUri(m.id)}
              alt=""
              draggable={false}
              className="-ms-1 size-4 rounded-full ring-[1.5px] ring-background first:ms-0"
              style={{ background: avatarTint(m.id) }}
            />
          ))}
        </span>
        <Link
          to="/boards/$boardId"
          params={{ boardId: lane.id }}
          className="min-w-0 truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {lane.icon ? `${lane.icon} ` : ""}
          {name}
        </Link>
        {meta && <span className="shrink-0 tabular-nums">{meta}</span>}
        <Link
          to="/boards/$boardId"
          params={{ boardId: lane.id }}
          className="ms-auto inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t.pipeline.open}
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
      {open &&
        COLUMNS.map((c) => {
          const list = cells[c];
          const shown = c === "done" && !allDone ? list.slice(0, DONE_SHOWN) : list;
          return (
            <div key={c} className="flex min-h-13 min-w-0 flex-col gap-1.5 rounded-[14px] bg-muted/40 p-1.5">
              {c === "work" && lane.status === "planning" && lead("work")}
              {c === "need" && lane.status === "asking" && lead("ask")}
              {shown.map((task) => (
                <LaneCard
                  key={task.id}
                  boardId={lane.id}
                  task={task}
                  kind={c === "need" && task.needs ? "ask" : c === "failed" || c === "need" ? "fail" : c}
                  name={names.get(task.member) ?? task.member}
                />
              ))}
              {c === "done" && list.length > DONE_SHOWN && (
                <button
                  type="button"
                  onClick={() => setAllDone((v) => !v)}
                  className="w-fit rounded px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {allDone ? t.chat.showLess : t.pipeline.more(list.length - DONE_SHOWN)}
                </button>
              )}
            </div>
          );
        })}
    </>
  );
});

function BoardFilter({ lanes, value, onChange }: { lanes: Lane[]; value: string | null; onChange: (id: string | null) => void }) {
  const current = lanes.find((l) => l.id === value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 max-w-56 gap-1.5 text-xs font-normal">
          <span className="truncate">{current ? current.title || current.prompt : t.pipeline.allBoards}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64">
        <DropdownMenuItem onClick={() => onChange(null)}>{t.pipeline.allBoards}</DropdownMenuItem>
        {lanes.map((l) => (
          <DropdownMenuItem key={l.id} onClick={() => onChange(l.id)}>
            <span className="truncate">{l.title || l.prompt}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Loading() {
  return (
    <div className="grid grid-cols-5 gap-2 pt-11" aria-busy="true">
      {[0, 1].map((row) => COLUMNS.map((c) => <Skeleton key={`${row}-${c}`} className={cn("h-24 rounded-[14px]", row === 0 && "mt-9")} />))}
    </div>
  );
}
