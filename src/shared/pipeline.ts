import { waitingSecret } from "./secrets";
import { crew, memberIdOf } from "./team";
import type { LogLine, NodeStatus, Run, RunStatus } from "./types";

// The Pipeline page: every board's tasks as one read-only Kanban, one lane per board, kept live by the server.

export type Column = "next" | "work" | "need" | "failed" | "done";
// Needs you holds the questions waiting on the person; a failed task gets its own column so the two never blur.
export const COLUMNS: Column[] = ["next", "work", "need", "failed", "done"];

export interface LaneTask {
  id: string;
  title: string;
  // The member id; their face and name come from the lane's team.
  member: string;
  status: NodeStatus;
  round: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  // Pending: the teammate whose task it waits on.
  waitFor?: string;
  // Running but waiting on the person for a secret: what it asked for.
  needs?: string;
  // Running: the newest step from its log, and how many tool calls it has made.
  last?: LogLine;
  steps?: number;
}

export interface Lane {
  id: string;
  title?: string;
  // Shown when the board has no title yet, like everywhere else in the app.
  prompt: string;
  icon?: string;
  status: RunStatus;
  round: number;
  startedAt?: number;
  endedAt?: number;
  team: { id: string; name: string; role: string }[];
  // The request the lead is planning or asking about, while it does.
  request?: string;
  asked?: number;
  tasks: LaneTask[];
}

const WINDOW_DAYS = 7;
export const RANGE_MS = { today: 0, week: WINDOW_DAYS * 24 * 60 * 60 * 1000 } as const;
export type Range = keyof typeof RANGE_MS;

// Where a task sits. Pending work only waits while its board runs; failures stay in view only for the latest round,
// so a problem a later round already fixed does not linger.
export function columnOf(lane: Pick<Lane, "status" | "round">, task: LaneTask): Column | null {
  if (task.status === "running") return task.needs ? "need" : "work";
  if (task.status === "pending") return lane.status === "running" ? "next" : null;
  if (task.status === "failed") return task.round === lane.round ? "failed" : null;
  if (task.status === "done") return "done";
  return null;
}

// Done counts from local midnight for "today", or the last seven days.
export function since(range: Range, now = Date.now()): number {
  if (range === "week") return now - RANGE_MS.week;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const shownIn = (lane: Lane, task: LaneTask, from: number): Column | null => {
  const col = columnOf(lane, task);
  return col === "done" && (task.endedAt ?? 0) < from ? null : col;
};

// A lane earns a place on the page while something is happening on it or something finished in the range.
export const isActive = (lane: Lane, from: number) =>
  lane.status === "planning" || lane.status === "asking" || lane.tasks.some((t) => shownIn(lane, t, from) !== null);

const lastStep = (lines: LogLine[] = []) => {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l && (l.kind === "tool" || l.kind === "text")) return l;
  }
  return undefined;
};

export function laneOf(run: Run, logs: Record<string, LogLine[]> = {}): Lane {
  const round = run.rounds?.length ?? 0;
  const team = crew(run).map((m) => ({ id: m.id, name: m.name, role: m.role }));
  const names = new Map(team.map((m) => [m.id, m.name]));
  const byId = new Map(run.nodes.map((n) => [n.id, n]));
  const request = round > 0 ? run.rounds?.[round - 1] : run.prompt;
  return {
    id: run.id,
    title: run.title,
    prompt: run.prompt.slice(0, 200),
    icon: run.icon || undefined,
    status: run.status,
    round,
    startedAt: run.startedAt ?? run.createdAt,
    endedAt: run.endedAt,
    team,
    ...(run.status === "planning" || run.status === "asking" ? { request } : {}),
    ...(run.status === "asking" ? { asked: run.asks?.[round]?.questions.length ?? 0 } : {}),
    tasks: run.nodes.map((n) => {
      const blocker = n.status === "pending" ? n.dependsOn.map((d) => byId.get(d)).find((d) => d && d.status !== "done") : undefined;
      const lines = n.status === "running" ? logs[n.id] : undefined;
      const needs = n.status === "running" ? waitingSecret(run.secrets, n.id)?.label : undefined;
      return {
        id: n.id,
        title: n.title,
        member: memberIdOf(n),
        status: n.status,
        round: n.round ?? 0,
        startedAt: n.startedAt,
        endedAt: n.endedAt,
        ...(n.error ? { error: n.error } : {}),
        ...(blocker ? { waitFor: names.get(memberIdOf(blocker)) ?? blocker.role } : {}),
        ...(needs ? { needs } : {}),
        ...(lines ? { last: lastStep(lines), steps: lines.filter((l) => l.kind === "tool").length } : {}),
      };
    }),
  };
}

// Newest activity first, so the board someone is watching sits at the top.
export const activityAt = (lane: Lane) =>
  Math.max(lane.startedAt ?? 0, lane.endedAt ?? 0, ...lane.tasks.map((t) => t.endedAt ?? t.startedAt ?? 0));
