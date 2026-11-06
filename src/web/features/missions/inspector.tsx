import {
  ArrowLeft,
  BookOpen,
  Brain,
  CircleAlert,
  CornerDownRight,
  FilePen,
  FileText,
  GitBranch,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Paperclip,
  Plug,
  Search,
  Shapes,
  SquareDashedMousePointer,
  SquareTerminal,
  Wrench,
  X,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { RichText } from "@/components/rich-text";
import { StatusIcon, statusLabel } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow } from "@/hooks/use-now";
import { fmtClock, fmtDateTime, fmtElapsed, t } from "@/i18n";
import { isLiveRun } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";
import { stripBlocks } from "../../../shared/board-blocks";
import { classifyFailure, isSystemFailure } from "../../../shared/failures";
import { crew, type Member, memberIdOf } from "../../../shared/team";
import type { LogLine, NodeState, Run } from "../../../shared/types";
import { MiniFace } from "../team/face";
import { actDetail, actVerb } from "./act-label";
import { type ActKind, classify } from "./activity";
import { finalTasks } from "./rounds";

const SHOWN_LOGS = 250;

interface Props {
  run: Run;
  codes: Map<string, string>;
  selected: NodeState | undefined;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  className?: string;
}

type PanelProps = Omit<Props, "selected" | "className">;

export function Inspector({ run, codes, selected, onSelect, onClose, className }: Props) {
  return (
    <aside
      aria-label={selected ? selected.title : t.details}
      className={cn("flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg", className)}
    >
      {selected ? (
        <TaskPanel key={selected.id} run={run} task={selected} onSelect={onSelect} onClose={onClose} />
      ) : (
        <MissionPanel key={run.id} run={run} codes={codes} onSelect={onSelect} onClose={onClose} />
      )}
    </aside>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={onClose}
      aria-label={t.closePanel}
      title={t.closePanel}
    >
      <X />
    </Button>
  );
}

type MissionTab = "overview" | "report" | "planner";

function MissionPanel({ run, codes, onSelect, onClose }: PanelProps) {
  // Follow the mission's natural focus (planner, then overview, then report) until the user picks a tab.
  const [picked, setPicked] = useState<MissionTab | null>(null);
  const natural: MissionTab = run.status === "done" ? "report" : run.status === "planning" || !run.nodes.length ? "planner" : "overview";
  const tab = picked ?? natural;
  const plannerLogs = useRuns((s) => s.logs.planner) ?? [];

  const ordered = [...run.nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  const people = new Map(crew(run).map((m) => [m.id, m]));
  const finals = finalTasks(run.nodes);
  const firstFailed = ordered.find((n) => n.status === "failed");

  return (
    <Tabs value={tab} onValueChange={(v) => setPicked(v as MissionTab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-center gap-2 ps-1">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{t.mission}</h2>
          <CloseButton onClose={onClose} />
        </div>
        {run.status === "failed" && run.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t.failedTitle}</AlertTitle>
            <AlertDescription>
              <p>
                <RichText text={run.error} />
              </p>
              {firstFailed && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => onSelect(firstFailed.id)}>
                  {t.openFailed}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {run.status === "cancelled" && (
          <Alert>
            <AlertDescription>{t.cancelledRun}</AlertDescription>
          </Alert>
        )}
        <TabsList className="w-full">
          <TabsTrigger value="overview">{t.overview}</TabsTrigger>
          <TabsTrigger value="report">{t.report}</TabsTrigger>
          <TabsTrigger value="planner">{t.planner}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto p-4">
        {ordered.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t.tasks}</h3>
            {ordered.map((n) => (
              <TaskRow key={n.id} task={n} member={people.get(memberIdOf(n))} onSelect={onSelect} />
            ))}
          </section>
        )}
        <section className="mt-6 flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{t.mission}</h3>
          <p className="text-[13px] leading-[22px] whitespace-pre-wrap text-foreground/80 [overflow-wrap:break-word]">{run.prompt}</p>
        </section>
        {!!run.rounds?.length && (
          <section className="mt-6 flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">{t.followUps}</h3>
            <ol className="flex flex-col gap-2 text-[13px] leading-[22px]">
              {run.rounds.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: follow-ups are append-only, so positions never shift.
                <li key={i} className="whitespace-pre-wrap [overflow-wrap:break-word]">
                  {r}
                </li>
              ))}
            </ol>
          </section>
        )}
        <dl className="mt-6 grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-xs">
          <dt className="text-muted-foreground">{t.folder}</dt>
          <dd className="font-mono [overflow-wrap:anywhere]">{run.cwd}</dd>
          <dt className="text-muted-foreground">{t.started}</dt>
          <dd>{fmtDateTime(run.createdAt)}</dd>
        </dl>
      </TabsContent>

      <TabsContent value="report" className="min-h-0 flex-1 overflow-y-auto p-4">
        {finals.length ? (
          <div className="flex flex-col gap-6">
            {finals.map((n) => (
              <article key={n.id} className="flex flex-col gap-2">
                {finals.length > 1 && (
                  <h3 className="text-xs font-medium text-muted-foreground">{`${codes.get(n.id) ?? ""} · ${n.title}`}</h3>
                )}
                <Markdown text={stripBlocks(n.output)} className="text-[13px] leading-[22px] text-foreground/80" />
              </article>
            ))}
          </div>
        ) : (
          <Empty>{isLiveRun(run) ? t.reportPending : run.status === "done" ? t.noFinalReport : t.missionStopped}</Empty>
        )}
      </TabsContent>

      <TabsContent value="planner" className="min-h-0 flex-1 p-0">
        <LogView lines={plannerLogs} />
      </TabsContent>
    </Tabs>
  );
}

type TaskTab = "activity" | "report" | "brief";

function TaskPanel({ run, task, onSelect, onClose }: Omit<PanelProps, "codes"> & { task: NodeState }) {
  const [picked, setPicked] = useState<TaskTab | null>(null);
  const tab = picked ?? (task.status === "done" ? "report" : "activity");
  const lines = useRuns((s) => s.logs[task.id]) ?? [];
  const live = task.status === "running";
  const now = useNow(live);
  const elapsed = task.startedAt ? fmtElapsed((live ? now : (task.endedAt ?? task.startedAt)) - task.startedAt) : null;
  const deps = task.dependsOn.map((d) => run.nodes.find((n) => n.id === d)).filter((n): n is NodeState => !!n);
  const blocker = task.blockedBy ? run.nodes.find((n) => n.id === task.blockedBy) : undefined;
  const unmet = deps.filter((d) => d.status !== "done");
  const people = new Map(crew(run).map((m) => [m.id, m]));
  const me = people.get(memberIdOf(task));

  return (
    <Tabs value={tab} onValueChange={(v) => setPicked(v as TaskTab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => onSelect(null)}>
            <ArrowLeft />
            {t.backToMission}
          </Button>
          <span className="flex-1" />
          <CloseButton onClose={onClose} />
        </div>
        {/* Title first; who has it on the left and how it went on the right, in one quiet line. */}
        <div className="flex flex-col gap-1.5 px-1">
          <h2 className="text-[15px] leading-snug font-medium">{task.title}</h2>
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            {me && (
              <span className="flex min-w-0 items-center gap-1.5">
                <MiniFace seed={me.id} className="size-4 shrink-0" />
                <span className="truncate">
                  <span className="text-foreground">{me.name}</span>
                  {me.role !== me.name ? <span> · {me.role}</span> : null}
                </span>
              </span>
            )}
            <span className="ms-auto flex shrink-0 items-center gap-1.5">
              <StatusIcon status={task.status} className="size-3.5" />
              <span className={cn(live && "satgas-shimmer")}>{statusLabel(task.status)}</span>
              {elapsed && <span className="tabular-nums">· {elapsed}</span>}
            </span>
          </div>
        </div>
        {task.status === "failed" && task.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t.taskFailed}</AlertTitle>
            <AlertDescription>
              <FailureText task={task} name={me?.name ?? task.title} />
            </AlertDescription>
          </Alert>
        )}
        {task.branch && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t.fork.branch(task.branch)}</span>
          </p>
        )}
        {task.status === "skipped" && (
          <Alert>
            <AlertDescription>{t.skippedBecause(blocker?.title ?? task.blockedBy ?? "?")}</AlertDescription>
          </Alert>
        )}
        {task.status === "cancelled" && (
          <Alert>
            <AlertDescription>{t.cancelledNote}</AlertDescription>
          </Alert>
        )}
        {task.status === "pending" && run.status === "running" && (
          <Alert>
            <AlertDescription>{unmet.length ? t.waitingFor(unmet.map((d) => `"${d.title}"`).join(", ")) : t.waitingSlot}</AlertDescription>
          </Alert>
        )}
        <TabsList className="mt-2.5 grid h-8 w-full grid-cols-3">
          <TabsTrigger value="activity" className="text-[13px]">
            {t.activity}
            {lines.length > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{lines.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="report" className="text-[13px]">
            {t.report}
          </TabsTrigger>
          <TabsTrigger value="brief" className="text-[13px]">
            {t.brief}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="activity" className="min-h-0 flex-1 p-0">
        <LogView lines={lines} />
      </TabsContent>
      <TabsContent value="report" className="min-h-0 flex-1 overflow-y-auto p-4">
        {task.output ? (
          <Markdown text={stripBlocks(task.output)} className="text-[13px] leading-[22px] text-foreground/80" />
        ) : (
          <Empty>
            {task.status === "pending" || task.status === "running"
              ? t.nodeReportPending
              : task.status === "done"
                ? t.noReport
                : t.taskStopped}
          </Empty>
        )}
      </TabsContent>
      <TabsContent value="brief" className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{t.instructions}</h3>
          <Markdown text={task.task} className="gap-2 text-[13px] leading-[22px] text-foreground/80" />
        </section>
        <section className="mt-6 flex flex-col gap-1">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t.dependsOn}</h3>
          {deps.length ? (
            deps.map((d) => <TaskRow key={d.id} task={d} member={people.get(memberIdOf(d))} onSelect={onSelect} />)
          ) : (
            <p className="text-[13px] text-muted-foreground">{t.noDependencies}</p>
          )}
        </section>
      </TabsContent>
    </Tabs>
  );
}

function TaskRow({ task, member, onSelect }: { task: NodeState; member?: Member; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className="flex h-9 items-center gap-2 rounded-md px-2 text-start text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <StatusIcon status={task.status} />
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      {member && (
        <span className="flex max-w-24 items-center gap-1.5 text-xs text-muted-foreground" title={`${member.name} · ${member.role}`}>
          <MiniFace seed={member.id} className="size-4" />
          <span className="truncate">{member.name}</span>
        </span>
      )}
      <span className="text-xs text-muted-foreground">{t.node[task.status]}</span>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

// Follows new lines only while the reader sits at the bottom of the log.
function LogView({ lines }: { lines: LogLine[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-runs on every new batch so the view keeps following the tail.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!lines.length) return <Empty>{t.noActivity}</Empty>;
  const offset = Math.max(0, lines.length - SHOWN_LOGS);
  const shown = offset ? lines.slice(offset) : lines;

  return (
    <div
      ref={scroller}
      className="h-full overflow-y-auto p-4"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
      }}
    >
      <ol className="flex flex-col gap-1 text-xs leading-5">
        {shown.map((l, i) => {
          const clock = fmtClock(l.t).slice(0, 5);
          // A time only where the minute changes, so the column reads as a few marks rather than a wall of digits.
          const showClock = i === 0 || fmtClock((shown[i - 1] as LogLine).t).slice(0, 5) !== clock;
          return (
            <li key={l.seq} className={cn("grid grid-cols-[36px_minmax(0,1fr)] gap-2", l.kind === "text" && "my-1.5")}>
              <time className="pt-px text-[11px] text-muted-foreground/60 tabular-nums" dateTime={new Date(l.t).toISOString()}>
                {showClock ? clock : null}
              </time>
              {l.kind === "text" ? (
                // What the agent said reads like it does in the chat: rendered, with the same wrapping.
                <Markdown text={stripBlocks(l.text)} className="gap-2 text-[13px] leading-[22px] text-foreground/80" />
              ) : l.kind === "tool" ? (
                <ToolRow text={l.text} />
              ) : (
                <span
                  className={cn(
                    "whitespace-pre-wrap [overflow-wrap:anywhere]",
                    l.kind === "error" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {l.text}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// A system failure reads in plain words first, with what the provider actually said below for whoever needs it.
function FailureText({ task, name }: { task: NodeState; name: string }) {
  const error = task.error ?? "";
  const kind = task.recovery?.kind ?? classifyFailure(error).kind;
  if (!isSystemFailure(kind))
    return (
      <p className="text-[13px] leading-5 [overflow-wrap:anywhere]">
        <RichText text={error} />
      </p>
    );
  return (
    <>
      <p className="text-[13px] leading-5">{t.recovery.stopped(name, t.recovery.why[kind])}</p>
      <p className="mt-1 text-[11px] leading-4 opacity-70 [overflow-wrap:anywhere]">
        <RichText text={error} />
      </p>
    </>
  );
}

const TOOL_ICON: Record<ActKind, typeof Plug> = {
  skill: BookOpen,
  edit: FilePen,
  command: SquareTerminal,
  read: FileText,
  search: Search,
  web: Globe,
  mcp: Plug,
  other: Wrench,
  image: ImageIcon,
  canvas: Shapes,
  card: SquareDashedMousePointer,
  attached: Paperclip,
  upstream: CornerDownRight,
  memory: Brain,
  secret: KeyRound,
};

// One tool call on one line: what kind it was, its name in words and the detail, cut to fit; the whole line on hover.
function ToolRow({ text }: { text: string }) {
  const act = classify(text);
  const Icon = TOOL_ICON[act.kind];
  const name = act.kind === "command" ? act.tool : actVerb(act);
  const detail = actDetail(act);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground" title={text}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="shrink-0 text-foreground/80">{name}</span>
      {detail && <span className="min-w-0 truncate font-mono text-[11px]">{detail}</span>}
    </span>
  );
}
