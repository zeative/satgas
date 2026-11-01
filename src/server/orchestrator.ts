import { layout } from "../shared/graph";
import type { NodeState, Run } from "../shared/types";
import { runClaude } from "./agents/claude";
import { runCodex } from "./agents/codex";
import type { AgentRequest } from "./agents/process";
import { config } from "./config";
import { plan } from "./planner";
import { buildNodePrompt } from "./prompt";
import { schedule } from "./scheduler";
import { appendLog, createRun, patchNode, patchRun } from "./store";

type Live = Map<string, { ctrl: AbortController; done: Promise<void> }>;
// Survives `bun --hot` reloads, so cancel and shutdown still reach missions started before the reload.
const g = globalThis as typeof globalThis & { __satgasLive?: Live };
g.__satgasLive ??= new Map();
const live: Live = g.__satgasLive;

export function startRun(prompt: string, cwd: string): Run {
  const run = createRun(prompt, cwd);
  const ctrl = new AbortController();
  const done = execute(run, ctrl.signal)
    .catch((e) => patchRun(run.id, { status: "failed", error: (e as Error).message, endedAt: Date.now() }))
    .finally(() => live.delete(run.id));
  live.set(run.id, { ctrl, done });
  return run;
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

async function execute(run: Run, signal: AbortSignal) {
  try {
    const p = await plan({ mission: run.prompt, cwd: run.cwd, signal, onLog: (l) => appendLog(run.id, "planner", l) });
    const nodes: NodeState[] = layout(p.nodes).map((n) => ({ ...n, status: "pending" }));
    appendLog(run.id, "planner", { kind: "info", text: `Plan ready: ${nodes.length} task${nodes.length === 1 ? "" : "s"}` });
    patchRun(run.id, { status: "running", title: p.title, summary: p.summary, nodes });
  } catch (e) {
    const cancelled = signal.aborted;
    patchRun(run.id, {
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? undefined : (e as Error).message,
      endedAt: Date.now(),
    });
    return;
  }

  const byId = new Map(run.nodes.map((n) => [n.id, n]));
  const outcome = await schedule(run.nodes, {
    concurrency: config.concurrency,
    signal,
    run: (id) => {
      const node = byId.get(id);
      return node ? runNode(run, node, signal) : Promise.reject(new Error(`Unknown task ${id}`));
    },
    onSkip: (id, blockedBy) => patchNode(run.id, id, { status: "skipped", blockedBy }),
  });

  for (const n of run.nodes) {
    if (outcome.get(n.id) === "cancelled" && n.status !== "cancelled") patchNode(run.id, n.id, { status: "cancelled" });
  }

  const status = signal.aborted ? "cancelled" : [...outcome.values()].every((o) => o === "done") ? "done" : "failed";
  const failed = run.nodes.filter((n) => n.status === "failed").map((n) => n.title);
  patchRun(run.id, {
    status,
    endedAt: Date.now(),
    error: status === "failed" ? `Failed: ${failed.join(", ")}` : undefined,
  });
}

async function runNode(run: Run, node: NodeState, signal: AbortSignal): Promise<void> {
  patchNode(run.id, node.id, { status: "running", startedAt: Date.now() });
  const req: AgentRequest = {
    prompt: buildNodePrompt(run, node, config.upstreamChars),
    cwd: run.cwd,
    signal,
    onLog: (l) => appendLog(run.id, node.id, l),
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
  }
}
