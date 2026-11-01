import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { LogLine, NodeState, Run, RunSummary, ServerEvent } from "../shared/types";
import { config } from "./config";

type Publisher = (topic: string, event: ServerEvent) => void;

interface StoreState {
  runs: Map<string, Run>;
  logs: Map<string, Record<string, LogLine[]>>;
  pendingLogs: Map<string, Record<string, LogLine[]>>;
  logSeq: Map<string, number>;
  saveTimers: Map<string, Timer>;
  publish: Publisher;
  flushTimer?: Timer;
  loaded: boolean;
}

// Kept on globalThis so a `bun --hot` reload swaps code without forgetting live missions.
const g = globalThis as typeof globalThis & { __satgasStore?: StoreState };
g.__satgasStore ??= {
  runs: new Map(),
  logs: new Map(),
  pendingLogs: new Map(),
  logSeq: new Map(),
  saveTimers: new Map(),
  publish: () => {},
  loaded: false,
};
const state: StoreState = g.__satgasStore;
const { runs, logs, pendingLogs, logSeq, saveTimers } = state;

const runsDir = () => join(config.dataDir, "runs");

export function setPublisher(p: Publisher) {
  state.publish = p;
}

const publish: Publisher = (topic, event) => state.publish(topic, event);

export const topicOf = (runId: string) => `run:${runId}`;

export async function loadRuns() {
  if (state.loaded) return;
  state.loaded = true;
  await mkdir(runsDir(), { recursive: true });
  for (const f of await readdir(runsDir())) {
    if (!f.endsWith(".json")) continue;
    try {
      const data = await Bun.file(join(runsDir(), f)).json();
      const run: Run = data.run;
      // A run still marked live on boot was interrupted by a server stop; never show it as running.
      if (run.status === "planning" || run.status === "running") {
        run.status = "failed";
        run.error = "The server stopped while this mission was running.";
        run.endedAt ??= Date.now();
        for (const n of run.nodes) if (n.status === "running" || n.status === "pending") n.status = "cancelled";
      }
      runs.set(run.id, run);
      logs.set(run.id, data.logs ?? {});
    } catch {
      // A corrupt file must not block startup.
    }
  }
}

export const getRun = (id: string) => runs.get(id);
export const getLogs = (id: string) => logs.get(id) ?? {};

export function listRuns(): RunSummary[] {
  return [...runs.values()].sort((a, b) => b.createdAt - a.createdAt).map(summarize);
}

function summarize(r: Run): RunSummary {
  return {
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    cwd: r.cwd,
    status: r.status,
    createdAt: r.createdAt,
    endedAt: r.endedAt,
    nodeCount: r.nodes.length,
  };
}

export function createRun(prompt: string, cwd: string): Run {
  const run: Run = { id: crypto.randomUUID().slice(0, 8), prompt, cwd, status: "planning", createdAt: Date.now(), nodes: [] };
  runs.set(run.id, run);
  logs.set(run.id, {});
  publish("runs", { type: "summary", run: summarize(run) });
  scheduleSave(run.id);
  return run;
}

export async function deleteRun(id: string): Promise<boolean> {
  if (!runs.has(id)) return false;
  const timer = saveTimers.get(id);
  if (timer) clearTimeout(timer);
  saveTimers.delete(id);
  pendingLogs.delete(id);
  runs.delete(id);
  logs.delete(id);
  logSeq.delete(id);
  await rm(join(runsDir(), `${id}.json`), { force: true });
  publish("runs", { type: "removed", id });
  publish(topicOf(id), { type: "removed", id });
  return true;
}

export function patchRun(id: string, patch: Partial<Run>) {
  const run = runs.get(id);
  if (!run) return;
  Object.assign(run, patch);
  publish(topicOf(id), { type: "run", id, patch });
  publish("runs", { type: "summary", run: summarize(run) });
  scheduleSave(id);
}

export function patchNode(runId: string, nodeId: string, patch: Partial<NodeState>) {
  const node = runs.get(runId)?.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  Object.assign(node, patch);
  publish(topicOf(runId), { type: "node", runId, id: nodeId, patch });
  scheduleSave(runId);
}

// Logs are buffered and flushed on a short interval so a chatty agent cannot flood the socket or the DOM.
export function appendLog(runId: string, nodeId: string, line: Omit<LogLine, "t" | "seq">) {
  const seq = (logSeq.get(runId) ?? 0) + 1;
  logSeq.set(runId, seq);
  const entry: LogLine = { seq, t: Date.now(), ...line };
  const all = logs.get(runId);
  if (!all) return;
  const list = [...(all[nodeId] ?? []), entry];
  all[nodeId] = list.length > config.maxLogLines ? list.slice(-config.maxLogLines) : list;
  const pending = pendingLogs.get(runId) ?? {};
  pending[nodeId] = [...(pending[nodeId] ?? []), entry];
  pendingLogs.set(runId, pending);
  if (!state.flushTimer) state.flushTimer = setTimeout(flushLogs, 100);
}

function flushLogs() {
  state.flushTimer = undefined;
  for (const [runId, batch] of pendingLogs) publish(topicOf(runId), { type: "logs", runId, batch });
  pendingLogs.clear();
}

// Writes are coalesced per run so a busy mission touches disk at most twice a second.
function scheduleSave(id: string) {
  if (saveTimers.has(id)) return;
  saveTimers.set(
    id,
    setTimeout(() => {
      saveTimers.delete(id);
      void save(id);
    }, 500),
  );
}

async function save(id: string) {
  const run = runs.get(id);
  if (!run) return;
  try {
    await Bun.write(join(runsDir(), `${id}.json`), JSON.stringify({ run, logs: logs.get(id) ?? {} }));
  } catch (e) {
    console.error(`Could not save mission ${id}: ${(e as Error).message}`);
  }
}

export async function flushAll() {
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    flushLogs();
  }
  const ids = [...saveTimers.keys()];
  for (const id of ids) clearTimeout(saveTimers.get(id));
  saveTimers.clear();
  await Promise.all(ids.map(save));
}
