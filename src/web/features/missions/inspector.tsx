import { ArrowLeft, CircleAlert, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { RichText } from "@/components/rich-text";
import { StatusBadge, StatusIcon } from "@/components/status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow } from "@/hooks/use-now";
import { fmtClock, fmtDateTime, fmtElapsed, t } from "@/i18n";
import { isLiveRun } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";
import type { LogLine, NodeState, Run } from "../../../shared/types";
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
        <TaskPanel key={selected.id} run={run} task={selected} codes={codes} onSelect={onSelect} onClose={onClose} />
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
              <TaskRow key={n.id} task={n} code={codes.get(n.id) ?? ""} onSelect={onSelect} />
            ))}
          </section>
        )}
        <section className="mt-6 flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">{t.mission}</h3>
          <p className="text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{run.prompt}</p>
        </section>
        {!!run.rounds?.length && (
          <section className="mt-6 flex flex-col gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">{t.followUps}</h3>
            <ol className="flex flex-col gap-2 text-sm leading-6">
              {run.rounds.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: follow-ups are append-only, so positions never shift.
                <li key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
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
                <Markdown text={n.output} />
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

function TaskPanel({ run, task, codes, onSelect, onClose }: PanelProps & { task: NodeState }) {
  const [picked, setPicked] = useState<TaskTab | null>(null);
  const tab = picked ?? (task.status === "done" ? "report" : "activity");
  const lines = useRuns((s) => s.logs[task.id]) ?? [];
  const live = task.status === "running";
  const now = useNow(live);
  const elapsed = task.startedAt ? fmtElapsed((live ? now : (task.endedAt ?? task.startedAt)) - task.startedAt) : null;
  const deps = task.dependsOn.map((d) => run.nodes.find((n) => n.id === d)).filter((n): n is NodeState => !!n);
  const blocker = task.blockedBy ? run.nodes.find((n) => n.id === task.blockedBy) : undefined;
  const unmet = deps.filter((d) => d.status !== "done");

  return (
    <Tabs value={tab} onValueChange={(v) => setPicked(v as TaskTab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => onSelect(null)}>
            <ArrowLeft />
            {t.backToMission}
          </Button>
          <span className="flex-1" />
          <CloseButton onClose={onClose} />
        </div>
        <div className="flex flex-col gap-1 px-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{codes.get(task.id)}</span> · {task.role} · {t.agent[task.agent]}
          </p>
          <h2 className="text-base leading-snug font-medium">{task.title}</h2>
        </div>
        <StatusBadge status={task.status} className="px-1">
          {elapsed && <span className="text-muted-foreground tabular-nums">{elapsed}</span>}
        </StatusBadge>
        {task.status === "failed" && task.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t.taskFailed}</AlertTitle>
            <AlertDescription>
              <RichText text={task.error} />
            </AlertDescription>
          </Alert>
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
        <TabsList className="w-full">
          <TabsTrigger value="activity">
            {t.activity}
            {lines.length > 0 && <span className="text-muted-foreground tabular-nums">{lines.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="report">{t.report}</TabsTrigger>
          <TabsTrigger value="brief">{t.brief}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="activity" className="min-h-0 flex-1 p-0">
        <LogView lines={lines} />
      </TabsContent>
      <TabsContent value="report" className="min-h-0 flex-1 overflow-y-auto p-4">
        {task.output ? (
          <Markdown text={task.output} />
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
          <p className="text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{task.task}</p>
        </section>
        <section className="mt-6 flex flex-col gap-1">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{t.dependsOn}</h3>
          {deps.length ? (
            deps.map((d) => <TaskRow key={d.id} task={d} code={codes.get(d.id) ?? ""} onSelect={onSelect} />)
          ) : (
            <p className="text-sm text-muted-foreground">{t.noDependencies}</p>
          )}
        </section>
      </TabsContent>
    </Tabs>
  );
}

function TaskRow({ task, code, onSelect }: { task: NodeState; code: string; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className="flex h-9 items-center gap-2 rounded-md px-2 text-start text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <StatusIcon status={task.status} />
      <span className="w-10 font-mono text-xs text-muted-foreground">{code}</span>
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
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
      <ol className="flex flex-col gap-1.5 font-mono text-xs leading-5">
        {shown.map((l) => (
          <li key={l.seq} className="grid grid-cols-[64px_1fr] gap-3">
            <time className="text-muted-foreground/70 tabular-nums" dateTime={new Date(l.t).toISOString()}>
              {fmtClock(l.t)}
            </time>
            <span
              className={cn(
                "whitespace-pre-wrap [overflow-wrap:anywhere]",
                l.kind === "text" && "font-sans text-sm text-foreground",
                l.kind === "tool" && "text-muted-foreground",
                l.kind === "error" && "text-destructive",
                l.kind === "info" && "text-foreground",
              )}
            >
              {l.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
