import { stripBlocks } from "../../shared/board-blocks";
import { sinks } from "../../shared/graph";
import { crew, memberIdOf } from "../../shared/team";
import type { NodeState, Run } from "../../shared/types";

export type Notice =
  | { key: string; type: "report"; text: string }
  | { key: string; type: "ask"; round: number }
  | { key: string; type: "held"; node: string; text: string }
  | { key: string; type: "secret"; ask: string; text: string }
  | { key: string; type: "setup"; text: string };

const roundOf = (run: Run) => run.rounds?.length ?? 0;
const inRound = (run: Run, round: number) => run.nodes.filter((n) => (n.round ?? 0) === round);
const ENDED = new Set(["done", "failed", "cancelled"]);

const nameOf = (run: Run, node: NodeState) => crew(run).find((m) => m.id === memberIdOf(node))?.name ?? node.role;

// What the round came to, without the canvas blocks a chat cannot show.
export function reportOf(run: Run, round: number): string {
  if (run.status === "failed") return `It failed: ${run.error ?? "the team stopped"}`;
  if (run.status === "cancelled") return "Stopped.";
  const direct = run.answers?.[round];
  if (direct) return stripBlocks(direct).trim();
  const finals = sinks(inRound(run, round)).flatMap((n) => (n.output ? [stripBlocks(n.output).trim()] : []));
  return finals.filter(Boolean).join("\n\n") || "Done.";
}

// Everything on the board that the person should hear about and has not yet: what ended, and what waits on them.
export function noticesFor(run: Run, seen: ReadonlySet<string>): Notice[] {
  const round = roundOf(run);
  const out: Notice[] = [];
  if (run.status === "asking" && run.asks?.[round] && !run.asks[round]?.answers) out.push({ key: `q:${round}`, type: "ask", round });
  for (const n of run.nodes) {
    if (n.held)
      out.push({
        key: `h:${n.id}`,
        type: "held",
        node: n.id,
        text: `${nameOf(run, n)} needs your OK: ${n.title}${n.approval ? `\n${n.approval}` : ""}`,
      });
  }
  for (const a of run.secrets ?? []) {
    if (a.state !== "waiting") continue;
    const node = run.nodes.find((n) => n.id === a.nodeId);
    out.push({
      key: `s:${a.id}`,
      type: "secret",
      ask: a.id,
      text: `${node ? nameOf(run, node) : "A teammate"} needs ${a.label}${a.reason ? `: ${a.reason}` : ""}`,
    });
  }
  for (const [r, rec] of Object.entries(run.setups ?? {})) {
    if (rec.pending.some((p) => p.state === "waiting") || rec.keys.length > 0)
      out.push({ key: `setup:${r}`, type: "setup", text: "The lead wants to set something up and needs your OK" });
  }
  if (ENDED.has(run.status)) out.push({ key: `r:${round}`, type: "report", text: reportOf(run, round) });
  return out.filter((n) => !seen.has(n.key));
}

// The one line that keeps being edited while the team works.
export function statusLine(run: Run): string | null {
  if (run.status === "planning") return "Reading your request";
  if (run.status !== "running") return null;
  const tasks = inRound(run, roundOf(run));
  const done = tasks.filter((n) => n.status === "done").length;
  const now = tasks.find((n) => n.status === "running");
  const head = `Working · ${done} of ${tasks.length} done`;
  return now ? `${head}\n${nameOf(run, now)}: ${now.title}` : head;
}
