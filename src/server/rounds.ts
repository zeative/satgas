import type { Card } from "../shared/board";
import { latestRound, layout, NODE_H, NODE_W, sinks } from "../shared/graph";
import type { NodeState, PlanNode } from "../shared/types";

const ROUND_GAP = 160;

// Lays out a follow-up plan to the right of everything already on the board and threads it onto the last round.
export function placeRound(existing: NodeState[], cards: Card[], plan: PlanNode[], round: number): NodeState[] {
  const laid = layout(plan);
  if (round === 0 || !existing.length) return laid.map((n) => ({ ...n, status: "pending", round }));

  const prefix = (id: string) => `r${round + 1}-${id}`;
  const right = Math.max(...existing.map((n) => n.x + NODE_W), ...cards.map((c) => c.x + c.w));
  const previous = latestRound(existing);
  const prevMid = (Math.min(...previous.map((n) => n.y)) + Math.max(...previous.map((n) => n.y + NODE_H))) / 2;
  const newMid = (Math.min(...laid.map((n) => n.y)) + Math.max(...laid.map((n) => n.y + NODE_H))) / 2;
  const ends = sinks(previous).map((n) => n.id);

  return laid.map((n) => ({
    ...n,
    id: prefix(n.id),
    dependsOn: n.dependsOn.map(prefix),
    x: n.x + right + ROUND_GAP,
    y: n.y + prevMid - newMid,
    status: "pending",
    round,
    after: n.dependsOn.length ? undefined : ends,
  }));
}

// What the planner needs to know about earlier work when a follow-up prompt arrives.
export function roundContext(prompt: string, rounds: string[], nodes: NodeState[], cards: Card[], maxChars = 6000): string {
  const previous = latestRound(nodes);
  const outcome = previous.map((n) => `- ${n.title} (${n.role}): ${n.status}${n.error ? ` — ${n.error}` : ""}`).join("\n");
  const report = sinks(previous)
    .map((n) => n.output?.trim())
    .filter(Boolean)
    .join("\n\n");
  const notes = cards
    .filter((c) => c.kind === "note" && !c.from && c.text?.trim())
    .map((c) => `- ${c.text?.trim()}`)
    .join("\n");
  return [
    `Original mission:\n${prompt}`,
    rounds.length > 1 &&
      `Earlier follow-ups:\n${rounds
        .slice(0, -1)
        .map((r) => `- ${r}`)
        .join("\n")}`,
    `Tasks in the last round:\n${outcome}`,
    report && `Last report:\n${report.length > maxChars ? `…${report.slice(-maxChars)}` : report}`,
    notes && `Notes people left on the board:\n${notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
