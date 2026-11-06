import { toast } from "sonner";
import { create } from "zustand";
import { t } from "@/i18n";
import { applyOps, type BoardOp, emptyBoard, toWire } from "../../shared/board";
import type { Answer } from "../../shared/questions";
import { randomUuid } from "../../shared/random-uuid";
import { MAIN_SESSION } from "../../shared/sessions";
import type { AgentKind, ClientMessage, GitInfo, LogLine, Run, RunSummary, SearchHit, ServerEvent } from "../../shared/types";
import { currentSession } from "./chat-session";
import { dropLane, loadPipeline, putLane } from "./pipeline";

const MAX_LOGS = 400;

interface RunsState {
  runs: RunSummary[] | null;
  runsError: string | null;
  // The mission currently being watched, with its logs keyed by node id ("planner" for the planner).
  run: Run | null;
  logs: Record<string, LogLine[]>;
  conn: "connecting" | "open" | "closed";
  // Installed agent CLI versions; null for one that is missing, and null overall until the server answers.
  config: {
    defaultCwd: string;
    concurrency: number | null;
    concurrencyFromEnv?: boolean;
    version: string | null;
    agents: Record<AgentKind, string | null> | null;
  };
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
const clientId = randomUuid();

let ws: WebSocket | undefined;
let retry = 0;
let watching: string | null = null;
// Whether the Pipeline page is open, so a reconnect subscribes again and refills it.
let pipelineOn = false;

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
    if (pipelineOn) {
      send({ type: "pipeline", on: true });
      void loadPipeline();
    }
    void loadRuns();
    void loadConfig();
  };
  ws.onclose = () => {
    set({ conn: "closed" });
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
  };
  ws.onmessage = (e) => handle(JSON.parse(e.data) as ServerEvent);
}

export function watchPipeline(on: boolean) {
  pipelineOn = on;
  send({ type: "pipeline", on });
  if (on) void loadPipeline();
}

export function watch(runId: string | null) {
  watching = runId;
  if (get().run?.id !== runId) set({ run: null, logs: {} });
  send({ type: "watch", runId });
}

// A field the server cleared arrives as null; dropping it keeps the object's shape as the server holds it.
function merged<T extends object>(base: T, patch: Partial<T>): T {
  const next: Record<string, unknown> = { ...base, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === null) delete next[k];
  return next as T;
}

function handle(ev: ServerEvent) {
  switch (ev.type) {
    case "snapshot":
      if (ev.run.id === watching) set({ run: ev.run, logs: ev.logs });
      return;
    case "run": {
      const run = get().run;
      if (run?.id === ev.id) set({ run: merged(run, ev.patch) });
      return;
    }
    case "node": {
      const run = get().run;
      if (run?.id !== ev.runId) return;
      set({ run: { ...run, nodes: run.nodes.map((n) => (n.id === ev.id ? merged(n, ev.patch) : n)) } });
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
      dropLane(ev.id);
      return;
    case "lane":
      putLane(ev.lane);
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
        concurrencyFromEnv: cfg.concurrencyFromEnv === true,
        version: typeof cfg.version === "string" ? cfg.version : null,
        agents:
          cfg.agents && typeof cfg.agents === "object" ? { claude: cfg.agents.claude ?? null, codex: cfg.agents.codex ?? null } : null,
      },
    });
  } catch {
    // The composer still works with a typed folder.
  }
}

export async function request(method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

// Shown at once; a refused name puts the old one back and the caller says why.
export async function renameBoard(id: string, title: string) {
  const before = get().run;
  const previous = before?.id === id ? before.title : undefined;
  if (before?.id === id) set({ run: { ...before, title, named: true } });
  try {
    await request("PATCH", `/api/runs/${id}`, { title });
  } catch (e) {
    const now = get().run;
    if (now?.id === id) set({ run: { ...now, title: previous } });
    throw e;
  }
}

// The server echoes the change to every open tab through the run's socket topic; "" removes the icon.
export async function setBoardIcon(id: string, icon: string) {
  await request("PATCH", `/api/runs/${id}`, { icon });
}

// A board made on the server outside the socket's view (a fork) joins the home list at once.
export function handleSummary(r: Run) {
  handle({
    type: "summary",
    run: { id: r.id, title: r.title, prompt: r.prompt, cwd: r.cwd, status: r.status, createdAt: r.createdAt, nodeCount: r.nodes.length },
  });
}

// Without a folder the server gives the board a fresh workspace of its own.
export async function createRun(prompt: string, cwd?: string, attachments: string[] = []): Promise<Run> {
  const r: Run = await request("POST", "/api/runs", {
    prompt,
    lang: navigator.language,
    ...(cwd ? { cwd } : {}),
    ...(attachments.length ? { attachments } : {}),
  });
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

// cards: what was selected on the canvas, sent as what the message is about.
// The message goes to the chat session the board shows, wherever on the board it was sent from.
export const sendPrompt = (id: string, prompt: string, attachments: string[] = [], cards: string[] = []) => {
  const session = currentSession(id);
  return request("POST", `/api/runs/${id}/prompt`, {
    prompt,
    lang: navigator.language,
    ...(attachments.length ? { attachments } : {}),
    ...(cards.length ? { cards } : {}),
    ...(session && session !== MAIN_SESSION ? { session } : {}),
  });
};

export const answerQuestions = (id: string, answers: Answer[]) => request("POST", `/api/runs/${id}/answers`, { answers });

// A file attached to a prompt goes up first; the prompt then names it by the id the server hands back.
export async function uploadAttachment(file: { name: string; type: string; blob: Blob }): Promise<string> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
    body: file.blob,
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !data.id) throw new Error(data.error ?? t.attach.failed(file.name));
  return data.id;
}

export const cancelRun = (id: string) => request("POST", `/api/runs/${id}/cancel`, {});
// Takes back a message that is still waiting for the team to finish.
export const unqueuePrompt = (id: string, item: string) => request("DELETE", `/api/runs/${id}/queue/${item}`);
// Puts back everything the lead and agents changed on the canvas in one round.
export const undoBoardEdit = (id: string, round: number) => request("POST", `/api/runs/${id}/edits/${round}/undo`, {});
export const undoSetup = (id: string, round: number) => request("POST", `/api/runs/${id}/setup/${round}/undo`, {});
export const decideSetup = (id: string, round: number, index: number, allow: boolean) =>
  request("POST", `/api/runs/${id}/setup/${round}/${index}`, { allow });
export const deleteRun = (id: string) => request("DELETE", `/api/runs/${id}`);
// The person's answer to a task the lead held for their Allow.
export const approveTask = (id: string, node: string, allow: boolean) =>
  request("POST", `/api/runs/${id}/tasks/${node}/approve`, { allow });

// A waiting message reworded, or moved before another one (last with null).
export const editQueued = (id: string, item: string, prompt: string) => request("PATCH", `/api/runs/${id}/queue/${item}`, { prompt });
export const moveQueued = (id: string, item: string, before: string | null) =>
  request("PATCH", `/api/runs/${id}/queue/${item}`, { before });

// The person's answer to a secret an agent asked for; the value goes up once and never comes back.
export const answerSecret = (id: string, ask: string, answer: { value: string } | { decline: true }) =>
  request("POST", `/api/runs/${id}/secrets/${ask}`, answer);

// Home organizing; the server echoes the summary to every tab.
export type Organize = { pinned?: boolean; archived?: boolean; snoozedUntil?: number | null; seen?: boolean };
export async function organizeBoard(id: string, patch: Organize) {
  // Shown at once on the home grid, so a click never waits for the echo.
  const list = get().runs;
  if (list) {
    const local = {
      ...("pinned" in patch ? { pinned: patch.pinned || undefined } : {}),
      ...("archived" in patch ? { archived: patch.archived || undefined, ...(patch.archived ? { pinned: undefined } : {}) } : {}),
      ...("snoozedUntil" in patch ? { snoozedUntil: patch.snoozedUntil ?? undefined } : {}),
      ...("seen" in patch ? (patch.seen ? { seenAt: Date.now(), markedUnread: undefined } : { markedUnread: true }) : {}),
    };
    set({ runs: list.map((r) => (r.id === id ? { ...r, ...local } : r)) });
  }
  await request("PATCH", `/api/runs/${id}`, patch);
}

export async function searchBoards(q: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status}).`);
  return res.json();
}

export const forkBoard = (id: string): Promise<Run> => request("POST", `/api/runs/${id}/fork`, {});
export const mergeBack = (id: string): Promise<{ applied: string[]; conflicts: string[]; cards: number }> =>
  request("POST", `/api/runs/${id}/merge`, {});

export const linkPull = (id: string, url: string) => request("POST", `/api/runs/${id}/pulls`, { url });
export const watchPull = (id: string, repo: string, number: number, watch: boolean) =>
  request("PATCH", `/api/runs/${id}/pulls`, { repo, number, watch });
export const unlinkPull = (id: string, repo: string, number: number) => request("DELETE", `/api/runs/${id}/pulls`, { repo, number });

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status}).`);
  return data as T;
}

export const loadTree = (id: string) => getJson<string[]>(`/api/runs/${id}/tree`);
export const loadGit = (id: string) => getJson<GitInfo>(`/api/runs/${id}/git`);

// Undo a task's files; a file changed again since comes back in changedSince, and is only put back with force.
export async function revertFiles(id: string, node: string, paths: string[], force = false) {
  const res = await fetch(`/api/runs/${id}/revert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ node, paths, force }),
  });
  const data = (await res.json().catch(() => ({}))) as { reverted?: string[]; changedSince?: string[]; error?: string };
  if (!res.ok && !data.changedSince) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return { reverted: data.reverted ?? [], changedSince: data.changedSince ?? [] };
}

export const branchAction = (id: string, action: "merge" | "drop" | "handoff", branch: string) =>
  request("POST", `/api/runs/${id}/git/${action}`, { branch });

export interface ReviewPatch {
  patch: string;
  cut: boolean;
  // The checkpoint the review starts from and where it ends: another checkpoint, or "now" for the folder as it is.
  from?: string;
  to?: string;
  files: { path: string; node: string }[];
}

export type ReviewScope = { kind: "board" } | { kind: "round"; round: number } | { kind: "node"; node: string };

export function loadPatch(id: string, scope: ReviewScope): Promise<ReviewPatch> {
  const q =
    scope.kind === "round"
      ? `scope=round&round=${scope.round}`
      : scope.kind === "node"
        ? `scope=node&node=${encodeURIComponent(scope.node)}`
        : "scope=board";
  return getJson<ReviewPatch>(`/api/runs/${id}/patch?${q}`);
}

export async function loadBlob(id: string, rev: string, path: string): Promise<string> {
  const res = await fetch(`/api/runs/${id}/blob?rev=${encodeURIComponent(rev)}&path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`(${res.status})`);
  return res.text();
}

// Off: nothing said on this board is remembered or turned into a rule.
export const setBoardLearning = (id: string, remember: boolean) => request("PATCH", `/api/runs/${id}`, { remember });
