import { sinks } from "../shared/graph";
import type { NodeState, Run } from "../shared/types";

// Each agent sees only its task, the mission, and its direct upstream reports, which keeps prompts small and focused.
export function buildNodePrompt(run: Run, node: NodeState, upstreamChars: number): string {
  const upstream = node.dependsOn
    .map((d) => run.nodes.find((n) => n.id === d))
    .filter((n): n is NodeState => !!n)
    .map((n) => `### ${n.title} (${n.role})\n${clipTail(n.output ?? "", upstreamChars)}`)
    .join("\n\n");
  const isFinal = sinks(run.nodes).some((s) => s.id === node.id);
  return [
    `You are the ${node.role} in a Satgas task force working in ${run.cwd}.`,
    `Overall mission:\n${run.prompt}`,
    `Your task: ${node.title}\n${node.task}`,
    upstream && `Reports from the tasks you depend on:\n\n${upstream}`,
    "Do the work directly in the working directory. Stay within your task's scope; other agents may be working in parallel on other parts.",
    isFinal
      ? "When finished, reply with the final report for the user: what was produced, where it lives, and how to use or verify it."
      : "When finished, reply with a concise report (files touched, decisions, results). It is handed to the next tasks.",
    "Reply in the language the mission text is written in.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Keeps the end of a long report, where agents put their conclusions.
function clipTail(s: string, n: number) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}
