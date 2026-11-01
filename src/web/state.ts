import { batch, effect, type Signal, signal } from "@preact/signals";
import type { ClientMessage, LogLine, Run, RunSummary, ServerEvent } from "../shared/types";
import { t } from "./i18n";

export const runs = signal<RunSummary[] | null>(null);
export const runsError = signal<string | null>(null);
export const currentId = signal<string | null>(readHash());
export const run = signal<Run | null>(null);
export const selected = signal<string | null>(null);
export const conn = signal<"connecting" | "open" | "closed">("connecting");
export const defaultCwd = signal("");
export const concurrency = signal<number | null>(null);
export const appVersion = signal<string | null>(null);
export const now = signal(Date.now());
// Slow clock for relative timestamps ("2 min ago"); the fast one above only runs during live missions.
export const minute = signal(Date.now());
window.setInterval(() => {
  minute.value = Date.now();
}, 30_000);

// One signal per node so a streaming log only re-renders the panel that shows it.
const logStore = new Map<string, Signal<LogLine[]>>();
export function logsOf(nodeId: string): Signal<LogLine[]> {
  const existing = logStore.get(nodeId);
  if (existing) return existing;
  const created = signal<LogLine[]>([]);
  logStore.set(nodeId, created);
  return created;
}

const MAX_LOGS = 400;

function readHash(): string | null {
  return location.hash.match(/^#\/run\/([\w-]+)/)?.[1] ?? null;
}

export function openRun(id: string | null) {
  location.hash = id ? `/run/${id}` : "/new";
}

window.addEventListener("hashchange", () => {
  currentId.value = readHash();
});

// The clock only ticks while something is actually running.
let ticker: number | undefined;
effect(() => {
  const r = run.value;
  const live = r && (r.status === "planning" || r.status === "running");
  if (live && ticker === undefined) ticker = window.setInterval(() => (now.value = Date.now()), 1000);
  if (!live && ticker !== undefined) {
    clearInterval(ticker);
    ticker = undefined;
  }
});

let ws: WebSocket | undefined;
let retry = 0;

function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect() {
  conn.value = "connecting";
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    conn.value = "open";
    send({ type: "watch", runId: currentId.peek() });
    loadRuns();
  };
  ws.onclose = () => {
    conn.value = "closed";
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data) as ServerEvent);
}

function handle(ev: ServerEvent) {
  switch (ev.type) {
    case "snapshot":
      if (ev.run.id !== currentId.peek()) return;
      batch(() => {
        for (const s of logStore.values()) s.value = [];
        for (const [id, lines] of Object.entries(ev.logs)) logsOf(id).value = lines;
        run.value = ev.run;
      });
      return;
    case "run": {
      const r = run.peek();
      if (r?.id === ev.id) run.value = { ...r, ...ev.patch };
      return;
    }
    case "node": {
      const r = run.peek();
      if (r?.id !== ev.runId) return;
      run.value = { ...r, nodes: r.nodes.map((n) => (n.id === ev.id ? { ...n, ...ev.patch } : n)) };
      return;
    }
    case "logs":
      if (ev.runId !== currentId.peek()) return;
      batch(() => {
        for (const [id, lines] of Object.entries(ev.batch)) {
          const s = logsOf(id);
          const last = s.peek().at(-1)?.seq ?? 0;
          const fresh = lines.filter((l) => l.seq > last);
          if (!fresh.length) continue;
          const next = s.peek().concat(fresh);
          s.value = next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
        }
      });
      return;
    case "summary": {
      const list = runs.peek() ?? [];
      const i = list.findIndex((r) => r.id === ev.run.id);
      runs.value = i < 0 ? [ev.run, ...list] : list.map((r) => (r.id === ev.run.id ? ev.run : r));
      return;
    }
    case "removed":
      batch(() => {
        runs.value = (runs.peek() ?? []).filter((r) => r.id !== ev.id);
        if (run.peek()?.id === ev.id) run.value = null;
      });
      return;
  }
}

effect(() => {
  const id = currentId.value;
  batch(() => {
    selected.value = null;
    if (run.peek()?.id !== id) run.value = null;
  });
  send({ type: "watch", runId: id });
});

export async function loadRuns() {
  try {
    const res = await fetch("/api/runs");
    if (!res.ok) throw new Error();
    runs.value = await res.json();
    runsError.value = null;
  } catch {
    runsError.value = t.missionsError;
  }
}

export async function loadConfig() {
  try {
    const cfg = await (await fetch("/api/config")).json();
    defaultCwd.value = cfg.defaultCwd ?? "";
    concurrency.value = typeof cfg.concurrency === "number" ? cfg.concurrency : null;
    appVersion.value = typeof cfg.version === "string" ? cfg.version : null;
  } catch {
    // The composer still works with a manually typed folder.
  }
}

async function request(method: "POST" | "DELETE", url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export async function createRun(prompt: string, cwd: string): Promise<Run> {
  const r: Run = await request("POST", "/api/runs", { prompt, cwd });
  // Insert immediately so the run view never flashes "not found" before the socket summary lands.
  handle({ type: "summary", run: { id: r.id, prompt: r.prompt, cwd: r.cwd, status: r.status, createdAt: r.createdAt, nodeCount: 0 } });
  return r;
}

export async function cancelRun(id: string) {
  await request("POST", `/api/runs/${id}/cancel`, {});
}

export async function deleteRun(id: string) {
  await request("DELETE", `/api/runs/${id}`);
}

connect();
loadConfig();
