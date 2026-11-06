import { randomUuid } from "./random-uuid";
// Work that starts without anyone typing: on an interval, at a time of day, or when another service calls a webhook.
// Each run is a new board, or a follow-up round on one board the schedule is bound to.

export interface Filter {
  // `headers.x-github-event` or `body.action`; `[]` matches any item of an array (`body.labels[].name`).
  path: string;
  op: "equals" | "notEquals" | "startsWith" | "in" | "exists";
  value?: string | string[];
}

export interface Signature {
  header: string;
  encoding: "hex" | "base64";
  // Text before the digest, like `sha256=` for GitHub.
  prefix: string;
  secret: string;
}

export type Trigger =
  | { type: "interval"; everyMinutes: number }
  // Local server time; no weekdays means every day (0 is Sunday).
  | { type: "daily"; time: string; weekdays: number[] }
  | { type: "webhook"; token: string; filters: Filter[]; signature?: Signature; dedupeKey?: string; dedupeSeconds?: number };

export interface Schedule {
  id: string;
  title: string;
  prompt: string;
  // A board to add each run to as a follow-up round; without one every run gets a new board.
  boardId?: string;
  // The folder new boards work in; empty gives each its own workspace.
  cwd?: string;
  trigger: Trigger;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  lastBoardId?: string;
  lastError?: string;
  runs: number;
}

export const MIN_EVERY_MINUTES = 5;
export const MAX_SCHEDULES = 50;
export const MAX_FILTERS = 16;
export const SCHEDULE_PROMPT_MAX = 20_000;
export const SECRET_MASK = "••••";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

// When it should run next, or null for webhooks and paused schedules.
export function nextRun(s: Pick<Schedule, "trigger" | "enabled" | "lastRunAt" | "createdAt">, now = Date.now()): number | null {
  if (!s.enabled) return null;
  const t = s.trigger;
  if (t.type === "interval") return Math.max(now, (s.lastRunAt ?? s.createdAt) + t.everyMinutes * 60_000);
  if (t.type !== "daily") return null;
  const [h, m] = t.time.split(":").map(Number);
  const after = Math.max(now, (s.lastRunAt ?? 0) + 60_000);
  for (let day = 0; day < 8; day++) {
    const d = new Date(after);
    d.setDate(d.getDate() + day);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    if (d.getTime() >= after && (!t.weekdays.length || t.weekdays.includes(d.getDay()))) return d.getTime();
  }
  return null;
}

// The values at a path, following `[]` into arrays; a request with no such field gives none.
export function valuesAt(event: { headers: Record<string, string>; body: unknown }, path: string): unknown[] {
  const [root, ...rest] = path.split(".");
  let current: unknown[] = root === "headers" ? [event.headers] : root === "body" ? [event.body] : [];
  for (const raw of rest) {
    const each = raw.endsWith("[]");
    const key = each ? raw.slice(0, -2) : raw;
    const next: unknown[] = [];
    for (const v of current) {
      if (!v || typeof v !== "object") continue;
      const got = (v as Record<string, unknown>)[root === "headers" ? key.toLowerCase() : key];
      if (each) {
        if (Array.isArray(got)) next.push(...got);
      } else if (got !== undefined) next.push(got);
    }
    current = next;
  }
  return current;
}

export function matches(filters: Filter[], event: { headers: Record<string, string>; body: unknown }): boolean {
  return filters.every((f) => {
    const found = valuesAt(event, f.path);
    if (f.op === "exists") return found.length > 0;
    const texts = found.filter((v) => typeof v !== "object" || v === null).map(String);
    if (f.op === "notEquals") return !texts.includes(String(f.value ?? ""));
    if (f.op === "in") return texts.some((t) => (Array.isArray(f.value) ? f.value : []).includes(t));
    if (f.op === "startsWith") return texts.some((t) => t.startsWith(String(f.value ?? "")));
    return texts.includes(String(f.value ?? ""));
  });
}

// `{{headers.x-github-delivery}}` and `{{body.issue.number}}` in a dedupe key become the request's values.
export const fillTemplate = (key: string, event: { headers: Record<string, string>; body: unknown }) =>
  key.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path: string) => valuesAt(event, path).map(String).join(","));

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function filters(v: unknown): Filter[] | string {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_FILTERS) return `Up to ${MAX_FILTERS} filters.`;
  const out: Filter[] = [];
  for (const raw of v as Record<string, unknown>[]) {
    const path = text(raw?.path, 200);
    const op = raw?.op as Filter["op"];
    if (!/^(headers|body)(\.[\w$@-]+(\[\])?)+$/.test(path)) return `A filter path starts with headers. or body., like body.action.`;
    if (!["equals", "notEquals", "startsWith", "in", "exists"].includes(op)) return "A filter has an unknown comparison.";
    if (op === "exists") out.push({ path, op });
    else if (op === "in") {
      const list = (Array.isArray(raw.value) ? raw.value : String(raw.value ?? "").split(","))
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 20);
      if (!list.length) return "An “in” filter needs at least one value.";
      out.push({ path, op, value: list });
    } else out.push({ path, op, value: text(raw.value, 200) });
  }
  return out;
}

// A schedule from the browser, checked and bounded; `before` keeps the webhook token and a masked signing secret.
export function sanitizeSchedule(input: unknown, before?: Schedule, now = Date.now()): Schedule | string {
  const raw = (input ?? {}) as Record<string, unknown>;
  const title = text(raw.title, 80);
  const prompt = text(raw.prompt, SCHEDULE_PROMPT_MAX);
  if (!title) return "Give the schedule a name.";
  if (!prompt) return "Write what the team should do each time.";
  const t = (raw.trigger ?? {}) as Record<string, unknown>;
  let trigger: Trigger;
  if (t.type === "interval") {
    const every = Number(t.everyMinutes);
    if (!Number.isInteger(every) || every < MIN_EVERY_MINUTES || every > 60 * 24 * 31)
      return `Run at most every ${MIN_EVERY_MINUTES} minutes, and at least once a month.`;
    trigger = { type: "interval", everyMinutes: every };
  } else if (t.type === "daily") {
    const time = text(t.time, 5);
    if (!TIME.test(time)) return "Pick a time of day like 09:00.";
    const days = Array.isArray(t.weekdays) ? t.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    trigger = { type: "daily", time, weekdays: [...new Set(days)].sort() };
  } else if (t.type === "webhook") {
    const parsed = filters(t.filters);
    if (typeof parsed === "string") return parsed;
    const old = before?.trigger.type === "webhook" ? before.trigger : undefined;
    const sig = t.signature as Record<string, unknown> | undefined;
    let signature: Signature | undefined;
    if (sig && text(sig.header, 100)) {
      const secret = sig.secret === SECRET_MASK ? (old?.signature?.secret ?? "") : text(sig.secret, 500);
      if (!secret) return "Enter the signing secret, or remove the signature check.";
      signature = {
        header: text(sig.header, 100).toLowerCase(),
        encoding: sig.encoding === "base64" ? "base64" : "hex",
        prefix: typeof sig.prefix === "string" ? sig.prefix.slice(0, 40) : "",
        secret,
      };
    }
    const dedupeKey = text(t.dedupeKey, 200);
    const seconds = Number(t.dedupeSeconds);
    trigger = {
      type: "webhook",
      token: old?.token ?? randomUuid().replace(/-/g, ""),
      filters: parsed,
      ...(signature ? { signature } : {}),
      ...(dedupeKey ? { dedupeKey, dedupeSeconds: Number.isInteger(seconds) && seconds >= 10 && seconds <= 3600 ? seconds : 120 } : {}),
    };
  } else return "Pick when it runs: on an interval, at a time of day, or by webhook.";
  const boardId = text(raw.boardId, 64);
  const cwd = text(raw.cwd, 1000);
  return {
    id: before?.id ?? randomUuid().slice(0, 8),
    title,
    prompt,
    ...(boardId ? { boardId } : {}),
    ...(cwd && !boardId ? { cwd } : {}),
    trigger,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : (before?.enabled ?? true),
    createdAt: before?.createdAt ?? now,
    runs: before?.runs ?? 0,
    ...(before?.lastRunAt ? { lastRunAt: before.lastRunAt } : {}),
    ...(before?.lastBoardId ? { lastBoardId: before.lastBoardId } : {}),
    ...(before?.lastError ? { lastError: before.lastError } : {}),
  };
}

// What the page gets: the signing secret masked.
export const maskSchedule = (s: Schedule): Schedule =>
  s.trigger.type === "webhook" && s.trigger.signature
    ? { ...s, trigger: { ...s.trigger, signature: { ...s.trigger.signature, secret: SECRET_MASK } } }
    : s;
