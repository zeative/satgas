import { priceOf } from "./prices";
import { crew, memberIdOf } from "./team";
import type { ModelUsage, Run, Usage } from "./types";

export const USAGE_RANGES = ["24h", "7", "30", "90"] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

// The tabs of the Usage page other than the default, as the address names them.
export const USAGE_VIEWS = ["tokens", "limits", "storage"] as const;
export type UsageView = (typeof USAGE_VIEWS)[number];

export interface UsageBucket {
  key: string;
  tokens: number;
  cost: number;
}

// `cost` is null where nothing is known about the price: unpriced, which is not the same as free.
export interface UsageRow {
  key: string;
  label: string;
  agent?: string;
  // Whose face a teammate's row shows: their id on the first board they turn up on.
  seed?: string;
  tasks: number;
  tokens: number;
  cost: number | null;
}

export interface UsageReport {
  range: UsageRange;
  buckets: UsageBucket[];
  tokens: number;
  uncached: number;
  read: number;
  write: number;
  output: number;
  cost: number;
  savings: number;
  // What each type of token cost, for the models whose list price is known.
  costs: { input: number; read: number; write: number; output: number };
  counted: number;
  // Finished tasks whose CLI reported no tokens: known to have run, unknown in size.
  unreported: number;
  agents: UsageRow[];
  models: UsageRow[];
  boards: UsageRow[];
  people: UsageRow[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TOP = 12;
export const UNKNOWN_MODEL = "unknown";

// The person's own calendar, wherever the server runs; `offset` is minutes from Date.getTimezoneOffset.
const dayOf = (t: number, offset: number) => new Date(t - offset * 60_000).toISOString().slice(0, 10);
const hourOf = (t: number, offset: number) => new Date(t - offset * 60_000).toISOString().slice(0, 13);

// Per model when the CLI said; a task from before it did counts under an unknown model, and has no price.
const partsOf = (u: Usage): [string, ModelUsage][] =>
  u.byModel && Object.keys(u.byModel).length
    ? Object.entries(u.byModel)
    : [[UNKNOWN_MODEL, { input: Math.max(0, u.input - u.cached), read: u.cached, write: 0, output: u.output }]];

export function usageReport(runs: Run[], { range, now, offset }: { range: UsageRange; now: number; offset: number }): UsageReport {
  const hourly = range === "24h";
  const span = hourly ? DAY : Number(range) * DAY;
  const keyOf = hourly ? hourOf : dayOf;
  const buckets = new Map<string, UsageBucket>();
  const steps = hourly ? 24 : Number(range);
  for (let i = steps - 1; i >= 0; i--) {
    const key = keyOf(now - i * (hourly ? HOUR : DAY), offset);
    buckets.set(key, { key, tokens: 0, cost: 0 });
  }
  const r: UsageReport = {
    range,
    buckets: [],
    tokens: 0,
    uncached: 0,
    read: 0,
    write: 0,
    output: 0,
    cost: 0,
    savings: 0,
    costs: { input: 0, read: 0, write: 0, output: 0 },
    counted: 0,
    unreported: 0,
    agents: [],
    models: [],
    boards: [],
    people: [],
  };
  const maps = {
    agents: new Map<string, UsageRow>(),
    models: new Map<string, UsageRow>(),
    boards: new Map<string, UsageRow>(),
    people: new Map<string, UsageRow>(),
  };
  const bump = (
    map: Map<string, UsageRow>,
    key: string,
    label: string,
    tokens: number,
    cost: number | undefined,
    tasks: number,
    who?: string,
  ) => {
    const row = map.get(key) ?? { key, label, tokens: 0, cost: null, tasks: 0, ...(who ? { agent: who } : {}) };
    row.tokens += tokens;
    row.tasks += tasks;
    if (cost !== undefined) row.cost = (row.cost ?? 0) + cost;
    map.set(key, row);
  };
  for (const run of runs) {
    const people = new Map(crew(run).map((m) => [m.id, m.name]));
    const title = run.title ?? run.prompt.slice(0, 80);
    const add = (u: Usage, at: number, who: string, person: string, seed: string, isTask: boolean) => {
      // A fork copies what its source already spent, and that was counted on the source.
      if (run.forkOf && at < run.forkOf.at) return;
      const bucket = buckets.get(keyOf(at, offset));
      if (!bucket || at < now - span) return;
      const task = isTask ? 1 : 0;
      r.counted += task;
      bump(maps.agents, who, who, 0, undefined, task);
      bump(maps.boards, run.id, title, 0, undefined, task);
      bump(maps.people, person, person, 0, undefined, task);
      const row = maps.people.get(person);
      if (row) row.seed ??= seed;
      for (const [model, m] of partsOf(u)) {
        const tokens = m.input + m.read + m.write + m.output;
        bucket.tokens += tokens;
        r.tokens += tokens;
        r.uncached += m.input;
        r.read += m.read;
        r.write += m.write;
        r.output += m.output;
        if (m.cost !== undefined) {
          bucket.cost += m.cost;
          r.cost += m.cost;
          const p = priceOf(model);
          if (p) {
            const per = (n: number, price: number) => (n * price) / 1_000_000;
            r.costs.input += per(m.input, p.input);
            r.costs.read += per(m.read, p.read);
            r.costs.write += per(m.write, p.write);
            r.costs.output += per(m.output, p.output);
            r.savings += per(m.read, p.input - p.read);
          }
        }
        bump(maps.agents, who, who, tokens, m.cost, 0);
        bump(maps.models, model, model, tokens, m.cost, 0, who);
        bump(maps.boards, run.id, title, tokens, m.cost, 0);
        bump(maps.people, person, person, tokens, m.cost, 0);
      }
    };
    for (const n of run.nodes) {
      if (!n.endedAt || n.endedAt < now - span || (run.forkOf && n.endedAt < run.forkOf.at)) continue;
      if (!n.usage) {
        if (n.status === "done" || n.status === "failed") r.unreported++;
        continue;
      }
      add(n.usage, n.endedAt, n.agent, people.get(memberIdOf(n)) ?? n.role, memberIdOf(n), true);
    }
    for (const u of Object.values(run.leadUsage ?? {})) add(u, u.at, "claude", "Lead", "Lead", false);
  }
  const ranked = (map: Map<string, UsageRow>) => [...map.values()].filter((x) => x.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  r.buckets = [...buckets.values()];
  r.agents = ranked(maps.agents);
  r.models = ranked(maps.models).slice(0, TOP);
  r.boards = ranked(maps.boards).slice(0, TOP);
  r.people = ranked(maps.people).slice(0, TOP);
  return r;
}

export interface LimitWindow {
  name: string;
  // Share still left, 0 to 100.
  left: number;
  resetsAt: number;
  // How long the window lasts, when its name says so; it places the mark for how much time is left.
  span: number | null;
}

export interface LimitsReport {
  at: number | null;
  status: string | null;
  windows: LimitWindow[];
}

const SPANS: [RegExp, number][] = [
  [/^seven_day/, 7 * DAY],
  [/^five_hour/, 5 * HOUR],
];
export const spanOf = (name: string) => SPANS.find(([re]) => re.test(name))?.[1] ?? null;

// Claude Code's rate_limit_event: windows that have already reset are left out, since their figures no longer hold.
export function readLimits(info: unknown, now: number): { status: string | null; windows: LimitWindow[] } {
  const i = (info ?? {}) as { status?: unknown; unifiedWindows?: unknown };
  const windows = Object.entries((i.unifiedWindows ?? {}) as Record<string, { utilization?: unknown; resetsAt?: unknown }>).flatMap(
    ([name, w]) => {
      if (typeof w?.utilization !== "number" || typeof w.resetsAt !== "number") return [];
      const resetsAt = w.resetsAt * 1000;
      if (resetsAt <= now) return [];
      return [{ name, left: Math.round(Math.max(0, Math.min(1, 1 - w.utilization)) * 100), resetsAt, span: spanOf(name) }];
    },
  );
  return { status: typeof i.status === "string" ? i.status : null, windows };
}
