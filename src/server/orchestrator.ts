import type { FileChange } from "../shared/board";
import type { NodeState, Run } from "../shared/types";
import { runClaude } from "./agents/claude";
import { runCodex } from "./agents/codex";
import type { AgentRequest } from "./agents/process";
import { cardsForTask, finalReportCard, placeOnShelf, withMoves } from "./artifacts";
import { config } from "./config";
import { plan } from "./planner";
import { buildNodePrompt } from "./prompt";
import { placeRound, roundContext } from "./rounds";
import { schedule } from "./scheduler";
import { appendLog, boardOps, createRun, getRun, patchNode, patchRun } from "./store";

type Live = Map<string, { ctrl: AbortController; done: Promise<void> }>;
// Survives `bun --hot` reloads, so cancel and shutdown still reach missions started before the reload.
const g = globalThis as typeof globalThis & { __satgasLive?: Live };
g.__satgasLive ??= new Map();
const live: Live = g.__satgasLive;

export function startRun(prompt: string, cwd: string, id?: string): Run {
  const run = createRun(prompt, cwd, id);
  launch(run, 0, prompt);
  return run;
}

// A follow-up prompt on an existing board: plans and runs a new round next to what is already there.
export function continueRun(id: string, prompt: string): "ok" | "busy" | "missing" {
  const run = getRun(id);
  if (!run) return "missing";
  if (live.has(id)) return "busy";
  const rounds = [...(run.rounds ?? []), prompt];
  patchRun(id, { status: "planning", rounds, startedAt: Date.now(), endedAt: undefined, error: undefined });
  launch(run, rounds.length, prompt);
  return "ok";
}

function launch(run: Run, round: number, prompt: string) {
  const ctrl = new AbortController();
  const done = execute(run, round, prompt, ctrl.signal)
    .catch((e) => patchRun(run.id, { status: "failed", error: (e as Error).message, endedAt: Date.now() }))
    .finally(() => live.delete(run.id));
  live.set(run.id, { ctrl, done });
}

export const isLive = (id: string) => live.has(id);

export function cancelRun(id: string): boolean {
  const entry = live.get(id);
  if (!entry) return false;
  entry.ctrl.abort();
  return true;
}

// Stops every agent process and waits (bounded) for runs to record their final state.
export async function shutdown(timeoutMs = 4000) {
  const entries = [...live.values()];
  for (const e of entries) e.ctrl.abort();
  await Promise.race([Promise.allSettled(entries.map((e) => e.done)), Bun.sleep(timeoutMs)]);
}

async function execute(run: Run, round: number, prompt: string, signal: AbortSignal) {
  let fresh: NodeState[];
  try {
    const cards = run.board?.cards ?? [];
    if (round > 0) appendLog(run.id, "planner", { kind: "info", text: `Follow-up: ${prompt}` });
    const context = round > 0 ? roundContext(run.prompt, run.rounds ?? [], run.nodes, cards, config.upstreamChars) : undefined;
    const p = await plan({ mission: prompt, context, cwd: run.cwd, signal, onLog: (l) => appendLog(run.id, "planner", l) });
    fresh = placeRound(withMoves(run), cards, p.nodes, round);
    appendLog(run.id, "planner", { kind: "info", text: `Plan ready: ${fresh.length} task${fresh.length === 1 ? "" : "s"}` });
    // The board keeps the title of its first mission; follow-ups only add tasks.
    const naming = round === 0 ? { title: p.title, summary: p.summary } : {};
    patchRun(run.id, { status: "running", ...naming, nodes: [...run.nodes, ...fresh] });
  } catch (e) {
    const cancelled = signal.aborted;
    patchRun(run.id, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? undefined : (e as Error).message,
      endedAt: Date.now(),
    });
    return;
  }

  const byId = new Map(fresh.map((n) => [n.id, n]));
  const outcome = await schedule(fresh, {
    concurrency: config.concurrency,
    signal,
    run: (id) => {
      const node = byId.get(id);
      return node ? runNode(run, node, signal) : Promise.reject(new Error(`Unknown task ${id}`));
    },
    onSkip: (id, blockedBy) => patchNode(run.id, id, { status: "skipped", blockedBy }),
  });

  for (const n of fresh) {
    if (outcome.get(n.id) === "cancelled" && n.status !== "cancelled") patchNode(run.id, n.id, { status: "cancelled" });
  }

  const status = signal.aborted ? "cancelled" : [...outcome.values()].every((o) => o === "done") ? "done" : "failed";
  if (status === "done") {
    const report = finalReportCard(fresh, round === 0 ? (run.title ?? run.prompt.slice(0, 60)) : prompt.slice(0, 60), round);
    if (report) boardOps(run.id, [{ op: "put", card: report }]);
  }
  const failed = fresh.filter((n) => n.status === "failed").map((n) => n.title);
  patchRun(run.id, {
    status,
    endedAt: Date.now(),
    error: status === "failed" ? `Failed: ${failed.join(", ")}` : undefined,
  });
}

async function runNode(run: Run, node: NodeState, signal: AbortSignal): Promise<void> {
  patchNode(run.id, node.id, { status: "running", startedAt: Date.now() });
  const written = new Map<string, FileChange["change"]>();
  const req: AgentRequest = {
    prompt: buildNodePrompt(run, node, config.upstreamChars),
    cwd: run.cwd,
    signal,
    onLog: (l) => appendLog(run.id, node.id, l),
    // A file created and then edited in the same task is still new.
    onFile: (path, change) => written.set(path, written.get(path) === "added" ? "added" : change),
  };
  try {
    const { output } = node.agent === "codex" ? await runCodex(req) : await runClaude(req);
    patchNode(run.id, node.id, { status: "done", output: output.trim(), endedAt: Date.now() });
  } catch (e) {
    const cancelled = signal.aborted;
    patchNode(run.id, node.id, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? undefined : (e as Error).message,
      endedAt: Date.now(),
    });
    throw e;
  } finally {
    if (!signal.aborted && written.size) await showOnBoard(run, node, written);
  }
}

// What a task produced goes on the board even when the task failed; a board problem must never fail the task.
async function showOnBoard(run: Run, node: NodeState, written: Map<string, FileChange["change"]>) {
  try {
    const cards = placeOnShelf(run, await cardsForTask(run, node, written), node.round ?? 0);
    if (cards.length)
      boardOps(
        run.id,
        cards.map((card) => ({ op: "put", card })),
      );
  } catch (e) {
    appendLog(run.id, node.id, { kind: "error", text: `Could not add the results to the board: ${(e as Error).message}` });
  }
}
