import { toast } from "sonner";
import { create } from "zustand";
import { t } from "@/i18n";
import { applyOps, type BoardOp, emptyBoard, toWire } from "../../shared/board";
import type { AgentKind, ClientMessage, LogLine, Run, RunSummary, ServerEvent } from "../../shared/types";

const MAX_LOGS = 400;

interface RunsState {
  runs: RunSummary[] | null;
  runsError: string | null;
  // The mission currently being watched, with its logs keyed by node id ("planner" for the planner).
  run: Run | null;
  logs: Record<string, LogLine[]>;
  conn: "connecting" | "open" | "closed";
  // Installed agent CLI versions; null for one that is missing, and null overall until the server answers.
  config: { defaultCwd: string; concurrency: number | null; version: string | null; agents: Record<AgentKind, string | null> | null };
}

export const useRuns = create<RunsState>(() => ({
  runs: null,
  runsError: null,
  run: null,
  logs: {},
  conn: "connecting",
  config: { defaultCwd: "", concurrency: null, version: null, agents: null },
}));

const set = useRuns.setState;
const get = useRuns.getState;

// Identifies this tab, so the server echo of its own board changes can be skipped.
const clientId = crypto.randomUUID();

let ws: WebSocket | undefined;
let retry = 0;
let watching: string | null = null;

function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function connect() {
  set({ conn: "connecting" });
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    set({ conn: "open" });
    send({ type: "watch", runId: watching });
    void loadRuns();
    void loadConfig();
  };
  ws.onclose = () => {
    set({ conn: "closed" });
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data) as ServerEvent);
}

export function watch(runId: string | null) {
  watching = runId;
  if (get().run?.id !== runId) set({ run: null, logs: {} });
  send({ type: "watch", runId });
}

function handle(ev: ServerEvent) {
  switch (ev.type) {
    case "snapshot":
      if (ev.run.id === watching) set({ run: ev.run, logs: ev.logs });
      return;
    case "run": {
      const run = get().run;
      if (run?.id === ev.id) set({ run: { ...run, ...ev.patch } });
      return;
    }
    case "node": {
      const run = get().run;
      if (run?.id !== ev.runId) return;
      set({ run: { ...run, nodes: run.nodes.map((n) => (n.id === ev.id ? { ...n, ...ev.patch } : n)) } });
      return;
    }
    case "logs": {
      if (ev.runId !== watching) return;
      const logs = { ...get().logs };
      for (const [id, lines] of Object.entries(ev.batch)) {
        const current = logs[id] ?? [];
        const last = current.at(-1)?.seq ?? 0;
        // Lines already delivered in the snapshot are dropped by sequence number.
        const fresh = lines.filter((l) => l.seq > last);
        if (!fresh.length) continue;
        const next = current.concat(fresh);
        logs[id] = next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
      }
      set({ logs });
      return;
    }
    case "summary": {
      const list = get().runs ?? [];
      const i = list.findIndex((r) => r.id === ev.run.id);
      set({ runs: i < 0 ? [ev.run, ...list] : list.map((r) => (r.id === ev.run.id ? ev.run : r)) });
      return;
    }
    case "board": {
      const run = get().run;
      if (run?.id !== ev.runId || ev.origin === clientId) return;
      set({ run: { ...run, board: applyOps(run.board ?? emptyBoard(), ev.ops) } });
      return;
    }
    case "removed":
      set((s) => ({ runs: (s.runs ?? []).filter((r) => r.id !== ev.id), run: s.run?.id === ev.id ? null : s.run }));
      return;
  }
}

export async function loadRuns() {
  try {
    const res = await fetch("/api/runs");
    if (!res.ok) throw new Error(String(res.status));
    set({ runs: await res.json(), runsError: null });
  } catch {
    set({ runsError: t.missionsError });
  }
}

async function loadConfig() {
  try {
    const cfg = await (await fetch("/api/config")).json();
    set({
      config: {
        defaultCwd: cfg.defaultCwd ?? "",
        concurrency: typeof cfg.concurrency === "number" ? cfg.concurrency : null,
        version: typeof cfg.version === "string" ? cfg.version : null,
        agents:
          cfg.agents && typeof cfg.agents === "object" ? { claude: cfg.agents.claude ?? null, codex: cfg.agents.codex ?? null } : null,
      },
    });
  } catch {
    // The composer still works with a typed folder.
  }
}

async function request(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

// The server echoes the change to every open tab through the run's socket topic; "" removes the icon.
export async function setBoardIcon(id: string, icon: string) {
  await request("PATCH", `/api/runs/${id}`, { icon });
}

// Without a folder the server gives the board a fresh workspace of its own.
export async function createRun(prompt: string, cwd?: string): Promise<Run> {
  const r: Run = await request("POST", "/api/runs", cwd ? { prompt, cwd } : { prompt });
  // Insert right away so the mission page never flashes "not found" before the socket summary lands.
  handle({ type: "summary", run: { id: r.id, prompt: r.prompt, cwd: r.cwd, status: r.status, createdAt: r.createdAt, nodeCount: 0 } });
  return r;
}

// Board changes leave in the order they were made; parallel requests could land out of order and drop a patch.
let boardQueue: Promise<unknown> = Promise.resolve();
// Changes shown here but not yet saved; a reload puts them back on top, since their own echo is skipped.
const unsaved = new Set<{ runId: string; ops: BoardOp[] }>();

// Queued behind every change already sent, so the board that comes back includes them.
async function reloadBoard(runId: string) {
  try {
    const res = await fetch(`/api/runs/${runId}`);
    if (!res.ok) return;
    const fresh = (await res.json()) as Run;
    const current = get().run;
    if (current?.id !== runId) return;
    const pending = [...unsaved].filter((u) => u.runId === runId).flatMap((u) => u.ops);
    set({ run: { ...current, board: applyOps(fresh.board ?? emptyBoard(), pending) } });
  } catch {
    // Unreachable server: the snapshot sent on reconnect brings the board back in line.
  }
}

// Applies locally first so dragging and typing feel instant; a refused change reloads the board from the server.
export async function sendBoardOps(runId: string, ops: BoardOp[]) {
  const run = get().run;
  if (!ops.length || run?.id !== runId) return;
  set({ run: { ...run, board: applyOps(run.board ?? emptyBoard(), ops) } });
  const entry = { runId, ops };
  unsaved.add(entry);
  const sent = boardQueue.then(() => request("POST", `/api/runs/${runId}/board`, { ops: toWire(ops), origin: clientId }));
  boardQueue = sent.catch(() => {});
  try {
    await sent;
  } catch (e) {
    toast.error((e as Error).message);
    boardQueue = boardQueue.then(() => reloadBoard(runId));
  } finally {
    unsaved.delete(entry);
  }
}

export async function uploadImage(runId: string, file: File): Promise<string> {
  const res = await fetch(`/api/runs/${runId}/assets`, { method: "POST", headers: { "content-type": file.type }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status}).`);
  return data.src as string;
}

export const sendPrompt = (id: string, prompt: string) => request("POST", `/api/runs/${id}/prompt`, { prompt });

export const cancelRun = (id: string) => request("POST", `/api/runs/${id}/cancel`, {});
export const deleteRun = (id: string) => request("DELETE", `/api/runs/${id}`);
