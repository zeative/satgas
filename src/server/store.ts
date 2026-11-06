import { chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { applyOps, type BoardOp, emptyBoard, toWire } from "../shared/board";
import { NODE_W } from "../shared/graph";
import { activityAt, type Lane, laneOf, RANGE_MS } from "../shared/pipeline";
import { crew, currentTask, LEAD_W, PERSON_W, type PersonState, personState, teamLayout } from "../shared/team";
import type { BoardPreview, LogLine, NodeState, NodeStatus, Run, RunSummary, SearchHit, ServerEvent } from "../shared/types";
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
  watch?: (runId: string) => void;
  flushTimer?: Timer;
  // When the pending log flush and each pending save were scheduled, to notice timers that never fire.
  flushSince?: number;
  saveSince: Map<string, number>;
  // Boards whose Pipeline lane changed since the last push, and the timer that pushes them.
  laneDirty: Set<string>;
  laneTimer?: Timer;
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
  saveSince: new Map(),
  laneDirty: new Set(),
  publish: () => {},
  loaded: false,
};
const state: StoreState = g.__satgasStore;
// A store created by older code before a hot reload lacks newer fields.
state.saving ??= new Map();
state.saveSince ??= new Map();
state.laneDirty ??= new Set();
const { runs, logs, pendingLogs, logSeq, saveTimers, saving, saveSince } = state;

// A long-running `bun --hot` process has been seen to stop firing timers while HTTP keeps working; without this,
// boards would silently stop being saved. A timer this overdue is treated as dead and the work is done right away.
const STALLED_MS = 3000;
let stallReported = false;
// A pending timer without a start time was set by code from before a reload, so it counts as overdue.
function stalled(since = 0): boolean {
  if (Date.now() - since < STALLED_MS) return false;
  if (!stallReported) {
    stallReported = true;
    console.error("Timers stopped firing in this process; saving and streaming directly. Restart Satgas to recover fully.");
  }
  return true;
}

const runsDir = () => join(config.dataDir, "runs");
// Uploaded images live next to the mission file and go away with it.
export const assetsDir = (runId: string) => join(runsDir(), runId, "assets");

export function setPublisher(p: Publisher) {
  state.publish = p;
}

// Told which board changed, for what lives outside the page, like a chat app waiting on the team.
export function setRunWatcher(w: (runId: string) => void) {
  state.watch = w;
}

const publish: Publisher = (topic, event) => state.publish(topic, event);

export const topicOf = (runId: string) => `run:${runId}`;

// Boards from before file lists left the canvas: each list goes, and a task that kept its files only there keeps them
// in its `changes`, where the Changes tab reads them. Leaving the cards hidden would hold invisible space on the shelf.
export function dropFileLists(run: Run) {
  const board = run.board;
  const lists = board?.cards.filter((c) => c.kind === "files") ?? [];
  if (!board || !lists.length) return;
  for (const list of lists) {
    const node = run.nodes.find((n) => n.id === list.from);
    if (node && !node.changes?.files.length && list.files?.length) node.changes = { ...node.changes, files: list.files };
  }
  const gone = new Set(lists.map((c) => c.id));
  board.cards = board.cards.filter((c) => !gone.has(c.id));
  board.links = board.links.filter((l) => !gone.has(l.source) && !gone.has(l.target));
}

// The task behind a request open at a stop is gone, so its card could never be answered.
export function closeWaitingSecrets(run: Run) {
  run.secrets = run.secrets?.map((a) => (a.state === "waiting" ? { ...a, state: "expired", answeredAt: Date.now() } : a));
}

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
      dropFileLists(run);
      closeWaitingSecrets(run);
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
export const listRunIds = () => [...runs.keys()];
export const getLogs = (id: string) => logs.get(id) ?? {};

// Every board with something live or recent, for the Pipeline page's first paint; changes then arrive as "lane" events.
export function listLanes(now = Date.now()): Lane[] {
  return [...runs.values()]
    .map((r) => laneOf(r, logs.get(r.id)))
    .filter((l) => l.status === "planning" || l.status === "running" || l.status === "asking" || activityAt(l) >= now - RANGE_MS.week)
    .sort((a, b) => activityAt(b) - activityAt(a));
}

// Lane pushes are coalesced: a busy board sends its whole lane at most four times a second.
const LANE_MS = 250;
function touchLane(id: string) {
  state.laneDirty.add(id);
  if (state.laneTimer) return;
  state.laneTimer = setTimeout(flushLanes, LANE_MS);
}

function flushLanes() {
  clearTimeout(state.laneTimer);
  state.laneTimer = undefined;
  for (const id of state.laneDirty) {
    const run = runs.get(id);
    if (run) publish("pipeline", { type: "lane", lane: laneOf(run, logs.get(id)) });
  }
  state.laneDirty.clear();
}

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
    ...(r.pinned ? { pinned: true } : {}),
    ...(r.archived ? { archived: true } : {}),
    ...(r.snoozedUntil ? { snoozedUntil: r.snoozedUntil } : {}),
    ...(r.seenAt ? { seenAt: r.seenAt } : {}),
    ...(r.markedUnread ? { markedUnread: true } : {}),
    ...(ownWorkspace(r.cwd) ? {} : { ownWorkspace: false }),
  };
}

const SEARCH_LIMIT = 30;

// One line around the first match, so a hit shows why it matched.
function around(text: string, at: number, len: number): string {
  const start = Math.max(0, at - 50);
  const one = text
    .slice(start, at + len + 90)
    .replace(/\s+/g, " ")
    .trim();
  return `${start > 0 ? "…" : ""}${one}${at + len + 90 < text.length ? "…" : ""}`;
}

// Every board whose name, prompts, replies, plans or task reports contain the words, newest first.
export function searchRuns(query: string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return [];
  const hits: SearchHit[] = [];
  for (const r of [...runs.values()].sort((a, b) => b.createdAt - a.createdAt)) {
    const texts = [
      r.title ?? "",
      r.prompt,
      ...(r.rounds ?? []),
      ...Object.values(r.answers ?? {}),
      ...Object.values(r.plans ?? {}),
      ...r.nodes.flatMap((n) => [n.title, n.output ?? ""]),
    ].filter(Boolean);
    const all = texts.join("\n").toLowerCase();
    if (!words.every((w) => all.includes(w))) continue;
    const first = words[0] ?? "";
    const text = texts.find((t) => t.toLowerCase().includes(first)) ?? texts[0] ?? "";
    hits.push({ id: r.id, snippet: around(text, Math.max(0, text.toLowerCase().indexOf(first)), first.length) });
    if (hits.length >= SEARCH_LIMIT) break;
  }
  return hits;
}

const PREVIEW_LIMIT = 40;

const AS_STATUS: Record<PersonState, NodeStatus> = {
  working: "running",
  waiting: "pending",
  failed: "failed",
  done: "done",
  idle: "skipped",
};

// The team in its place, the lead's lines down to everyone, and the larger cards; drawings and tiny items would
// only add noise.
function preview(r: Run): BoardPreview | undefined {
  if (!r.nodes.length && !r.board?.cards.length) return undefined;
  const people = crew(r).slice(0, PREVIEW_LIMIT);
  const spots = teamLayout(people);
  // Each spot is drawn as a box centred where the face is.
  const box = (p: { x: number; y: number }, w: number) => ({ x: p.x + (w - NODE_W) / 2, y: p.y });
  const busy = r.status === "planning" || r.status === "running";
  const tasks = r.nodes.length
    ? [
        { ...box(spots.lead, LEAD_W), status: (busy ? "running" : "done") as NodeStatus },
        ...people.map((m) => ({
          ...box(spots.members.get(m.id) ?? spots.lead, PERSON_W),
          status: AS_STATUS[personState(currentTask(m.id, r.nodes))],
        })),
      ]
    : [];
  const links = people.map((_, i): [number, number] => [0, i + 1]);
  return {
    tasks,
    links,
    cards: (r.board?.cards ?? [])
      .filter((c) => c.kind !== "drawing")
      .slice(0, PREVIEW_LIMIT)
      .map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, kind: c.kind })),
  };
}

export const newRunId = () => crypto.randomUUID().slice(0, 8);

export function createRun(prompt: string, cwd: string, id = newRunId(), files: string[] = [], lang?: string): Run {
  const run: Run = {
    id,
    prompt,
    cwd,
    status: "planning",
    createdAt: Date.now(),
    // From here on, a board that finishes before the person opens it shows as unread.
    seenAt: Date.now(),
    nodes: [],
    ...(files.length ? { files: { 0: files } } : {}),
    ...(lang ? { lang } : {}),
  };
  runs.set(run.id, run);
  logs.set(run.id, {});
  publish("runs", { type: "summary", run: summarize(run) });
  touchLane(run.id);
  scheduleSave(run.id);
  return run;
}

// A board made whole elsewhere (a fork), with the log it carries over.
export function insertRun(run: Run, lines: Record<string, LogLine[]> = {}) {
  runs.set(run.id, run);
  logs.set(run.id, lines);
  let last = 0;
  for (const list of Object.values(lines)) for (const l of list) last = Math.max(last, l.seq);
  logSeq.set(run.id, last);
  publish("runs", { type: "summary", run: summarize(run) });
  touchLane(run.id);
  scheduleSave(run.id);
}

// A board's own workspace lives under the data folder; a folder someone picked elsewhere is never removed.
export function ownWorkspace(cwd: string): boolean {
  const dir = resolve(cwd);
  return ["workspaces", "forks"].some((name) => {
    const root = resolve(config.dataDir, name);
    return dir.startsWith(root + sep) && dir !== root;
  });
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
  state.laneDirty.delete(id);
  publish("runs", { type: "removed", id });
  publish(topicOf(id), { type: "removed", id });
  publish("pipeline", { type: "removed", id });
  return true;
}

// JSON drops undefined, so a field a patch clears travels as null and the client deletes it; otherwise a stale error,
// end time or queue would stay on screen until a reload.
function cleared<T extends object>(patch: T): T {
  return Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v])) as T;
}

export function patchRun(id: string, patch: Partial<Run>) {
  const run = runs.get(id);
  if (!run) return;
  Object.assign(run, patch);
  publish(topicOf(id), { type: "run", id, patch: cleared(patch) });
  state.watch?.(id);
  publish("runs", { type: "summary", run: summarize(run) });
  touchLane(id);
  scheduleSave(id);
}

export function patchNode(runId: string, nodeId: string, patch: Partial<NodeState>) {
  const node = runs.get(runId)?.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  Object.assign(node, patch);
  publish(topicOf(runId), { type: "node", runId, id: nodeId, patch: cleared(patch) });
  state.watch?.(runId);
  touchLane(runId);
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
  if (state.flushTimer && stalled(state.flushSince)) flushLogs();
  if (!state.flushTimer) {
    state.flushSince = Date.now();
    state.flushTimer = setTimeout(flushLogs, 100);
  }
}

function flushLogs() {
  clearTimeout(state.flushTimer);
  state.flushTimer = undefined;
  for (const [runId, batch] of pendingLogs) {
    publish(topicOf(runId), { type: "logs", runId, batch });
    // A running task's newest step shows on its Pipeline card; the lead's own log does not.
    if (Object.keys(batch).some((id) => id !== "planner")) touchLane(runId);
  }
  pendingLogs.clear();
}

// Writes are coalesced per run so a busy mission touches disk at most twice a second.
function scheduleSave(id: string) {
  if (saveTimers.has(id)) {
    if (!stalled(saveSince.get(id))) return;
    clearTimeout(saveTimers.get(id));
    saveTimers.delete(id);
    saveSince.delete(id);
    void save(id);
    return;
  }
  saveSince.set(id, Date.now());
  saveTimers.set(
    id,
    setTimeout(() => {
      saveTimers.delete(id);
      saveSince.delete(id);
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
  saveSince.clear();
  for (const id of ids) void save(id);
  await Promise.all([...saving.values()]);
}
