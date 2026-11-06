import type { Card } from "../shared/board";
import { FAILURE_WORDS } from "../shared/failures";
import { latestRound, layout, NODE_H, NODE_W, sinks } from "../shared/graph";
import { type Asked, describeAnswers } from "../shared/questions";
import { roundText, sessionOf, sessionRounds } from "../shared/sessions";
import { crew, type Member, memberIdOf } from "../shared/team";
import type { NodeState, PlanNode, Run } from "../shared/types";

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
// A system failure in words, so a follow-up like "try again" moves the work to where it can succeed.
function recovered(n: NodeState): string {
  const r = n.recovery;
  if (!r) return "";
  const why = `system problem, not the work: ${FAILURE_WORDS[r.kind]} (${r.from})`;
  if (!r.to) return ` [${why}; no other agent was available to retry it]`;
  return n.status === "done" ? ` [${why}; Satgas ran it again on ${r.to} and it finished]` : ` [${why}; the retry on ${r.to} failed too]`;
}

export function roundContext(
  prompt: string,
  rounds: string[],
  nodes: NodeState[],
  cards: Card[],
  maxChars = 6000,
  answers: Record<number, string> = {},
  asks: Record<number, Asked> = {},
  team: Member[] = [],
): string {
  const asked = asks[rounds.length - 1];
  const previous = latestRound(nodes);
  const names = new Map(crew({ team, nodes, createdAt: 0 }).map((m) => [m.id, m.name]));
  const doer = (n: NodeState) => {
    const name = names.get(memberIdOf(n));
    return name && name !== n.role ? `${name}, ${n.role}` : n.role;
  };
  const outcome = previous.map((n) => `- ${n.title} (${doer(n)}): ${n.status}${n.error ? ` — ${n.error}` : ""}${recovered(n)}`).join("\n");
  const report = sinks(previous)
    .map((n) => n.output?.trim())
    .filter(Boolean)
    .join("\n\n");
  // A plan written last round is what an approval refers to, so its full text comes along, not just the report.
  const made = new Set(previous.map((n) => n.id));
  let room = maxChars;
  const docs = cards
    .filter((c) => c.kind === "doc" && c.from && made.has(c.from) && c.text?.trim())
    .map((c) => {
      const text = (c.text ?? "").trim();
      const shown = text.length > room ? `${text.slice(0, Math.max(0, room))}…` : text;
      room = Math.max(0, room - shown.length);
      return `### ${c.title ?? "Doc"}\n${shown}`;
    })
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
    outcome && `Tasks in the last round:\n${outcome}`,
    report && `Last report:\n${report.length > maxChars ? `…${report.slice(-maxChars)}` : report}`,
    docs && `Documents the last round put on the board:\n${docs}`,
    // When the round before this one was answered directly, that answer is what the user is replying to.
    answers[rounds.length - 1] && `Your last reply:\n${answers[rounds.length - 1]}`,
    asked &&
      (asked.answers
        ? `What the user answered when you asked before the last round:\n${describeAnswers(asked)}`
        : `Questions you asked last round, which the user set aside:\n${asked.questions.map((q) => `- ${q.question}`).join("\n")}`),
    notes && `Notes people left on the board:\n${notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const NEW_SESSION =
  "This message starts a new chat session on this board. The person's earlier sessions are not part of this conversation, but everything they made is on the board and in the working folder, so build on it when the message points there.";

// The lead's view of earlier work, from the current round's own chat session only: the session's first message is the
// mission and its later ones the follow-ups, as if it were a board of its own that shares the canvas and the folder.
export function sessionContext(run: Run, round: number, maxChars = 6000): string | undefined {
  const own = sessionRounds(run, sessionOf(run, round), round);
  if (own.length <= 1) return round > 0 ? NEW_SESSION : undefined;
  const at = (r: number) => own.indexOf(r);
  const remap = <T>(by: Record<number, T> | undefined) =>
    Object.fromEntries(Object.entries(by ?? {}).flatMap(([k, v]) => (own.includes(Number(k)) ? [[at(Number(k)), v]] : []))) as Record<
      number,
      T
    >;
  const nodes = run.nodes.filter((n) => own.includes(n.round ?? 0)).map((n) => ({ ...n, round: at(n.round ?? 0) }));
  return roundContext(
    roundText(run, own[0] ?? 0),
    own.slice(1).map((r) => roundText(run, r)),
    nodes,
    run.board?.cards ?? [],
    maxChars,
    remap(run.answers),
    remap(run.asks),
    run.team,
  );
}
