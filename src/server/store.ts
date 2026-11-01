import { chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { applyOps, type BoardOp, emptyBoard, toWire } from "../shared/board";
import type { BoardPreview, LogLine, NodeState, Run, RunSummary, ServerEvent } from "../shared/types";
import { config } from "./config";

type Publisher = (topic: string, event: ServerEvent) => void;

interface StoreState {
  runs: Map<string, Run>;
  logs: Map<string, Record<string, LogLine[]>>;
  pendingLogs: Map<string, Record<string, LogLine[]>>;
  logSeq: Map<string, number>;
  saveTimers: Map<string, Timer>;
  // The latest write per run; each save waits for the one before it, so two writes never race.
  saving: Map<string, Promise<void>>;
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
  saving: new Map(),
  publish: () => {},
  loaded: false,
};
const state: StoreState = g.__satgasStore;
// A store created by older code before a hot reload lacks newer fields.
state.saving ??= new Map();
const { runs, logs, pendingLogs, logSeq, saveTimers, saving } = state;

const runsDir = () => join(config.dataDir, "runs");
// Uploaded images live next to the mission file and go away with it.
export const assetsDir = (runId: string) => join(runsDir(), runId, "assets");

export function setPublisher(p: Publisher) {
  state.publish = p;
}

const publish: Publisher = (topic, event) => state.publish(topic, event);

export const topicOf = (runId: string) => `run:${runId}`;

export async function loadRuns() {
  if (state.loaded) return;
  state.loaded = true;
  // Run files and settings hold prompts, logs and keys; only this user may read them.
  await mkdir(runsDir(), { recursive: true, mode: 0o700 });
  await chmod(config.dataDir, 0o700).catch(() => {});
  for (const f of await readdir(runsDir())) {
    // Left behind by a write that a crash interrupted; the run file itself is intact.
    if (f.endsWith(".tmp")) await rm(join(runsDir(), f), { force: true });
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
      // The client drops lines it has already seen by seq, so numbering continues after a restart.
      let last = 0;
      for (const lines of Object.values<unknown>(data.logs ?? {})) {
        if (Array.isArray(lines)) for (const l of lines as LogLine[]) last = Math.max(last, Number(l?.seq) || 0);
      }
      logSeq.set(run.id, last);
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
    icon: r.icon || undefined,
    prompt: r.prompt,
    cwd: r.cwd,
    status: r.status,
    createdAt: r.createdAt,
    endedAt: r.endedAt,
    nodeCount: r.nodes.length,
    preview: preview(r),
  };
}

const PREVIEW_LIMIT = 40;

// Task positions as people left them, plus the larger cards; drawings and tiny items would only add noise.
function preview(r: Run): BoardPreview | undefined {
  if (!r.nodes.length && !r.board?.cards.length) return undefined;
  const moved = r.board?.moved ?? {};
  const nodes = r.nodes.slice(0, PREVIEW_LIMIT);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const links: [number, number][] = nodes.flatMap((n, i) =>
    [...n.dependsOn, ...(n.after ?? [])].flatMap((d) => (index.has(d) ? [[index.get(d) as number, i] as [number, number]] : [])),
  );
  return {
    tasks: nodes.map((n) => ({ x: moved[n.id]?.x ?? n.x, y: moved[n.id]?.y ?? n.y, status: n.status })),
    links,
    cards: (r.board?.cards ?? [])
      .filter((c) => c.kind !== "drawing")
      .slice(0, PREVIEW_LIMIT)
      .map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, kind: c.kind })),
  };
}

export const newRunId = () => crypto.randomUUID().slice(0, 8);

export function createRun(prompt: string, cwd: string, id = newRunId()): Run {
  const run: Run = { id, prompt, cwd, status: "planning", createdAt: Date.now(), nodes: [] };
  runs.set(run.id, run);
  logs.set(run.id, {});
  publish("runs", { type: "summary", run: summarize(run) });
  scheduleSave(run.id);
  return run;
}

// A board's own workspace lives under the data folder; a folder someone picked elsewhere is never removed.
export function ownWorkspace(cwd: string): boolean {
  const root = resolve(config.dataDir, "workspaces");
  const dir = resolve(cwd);
  return dir.startsWith(root + sep) && dir !== root;
}

export async function deleteRun(id: string): Promise<boolean> {
  const run = runs.get(id);
  if (!run) return false;
  const timer = saveTimers.get(id);
  if (timer) clearTimeout(timer);
  saveTimers.delete(id);
  pendingLogs.delete(id);
  runs.delete(id);
  logs.delete(id);
  logSeq.delete(id);
  // A write already under way would otherwise put the file back after it is removed.
  await saving.get(id);
  await rm(join(runsDir(), `${id}.json`), { force: true });
  await rm(join(runsDir(), id), { recursive: true, force: true });
  if (ownWorkspace(run.cwd)) await rm(resolve(run.cwd), { recursive: true, force: true });
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

export function boardOps(runId: string, ops: BoardOp[], origin?: string): boolean {
  const run = runs.get(runId);
  if (!run) return false;
  run.board = applyOps(run.board ?? emptyBoard(), ops);
  publish(topicOf(runId), { type: "board", runId, ops: toWire(ops), origin });
  // The home page draws each board's thumbnail from its summary.
  publish("runs", { type: "summary", run: summarize(run) });
  scheduleSave(runId);
  return true;
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

function save(id: string): Promise<void> {
  const next = (saving.get(id) ?? Promise.resolve()).then(() => write(id));
  saving.set(id, next);
  void next.then(() => {
    if (saving.get(id) === next) saving.delete(id);
  });
  return next;
}

// Written to a temp file and renamed, so a crash mid-write never leaves half a run file.
async function write(id: string) {
  const run = runs.get(id);
  if (!run) return;
  const file = join(runsDir(), `${id}.json`);
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify({ run, logs: logs.get(id) ?? {} }), { mode: 0o600 });
    await rename(tmp, file);
  } catch (e) {
    console.error(`Could not save mission ${id}: ${(e as Error).message}`);
    await rm(tmp, { force: true }).catch(() => {});
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
  for (const id of ids) void save(id);
  await Promise.all([...saving.values()]);
}
