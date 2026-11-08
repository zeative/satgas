// The lead's answer to a message the person sends while the team works: a quick turn with no tools, so the person is
// never left waiting for a long task. The lead replies, and decides who of the running team should hear it and whether
// it is new work for the next round.
import { cardLabel } from "../shared/refs";
import { activeAgent } from "../shared/settings";
import { crew, memberIdOf } from "../shared/team";
import type { Run } from "../shared/types";
import { runClaude } from "./agents/claude";
import { runCodex } from "./agents/codex";
import { config } from "./config";
import { safeParse } from "./planner";
import { getSettings } from "./settings";
import { getLogs } from "./store";
import { describeSystem } from "./system";

export interface AsideDecision {
  reply: string;
  // Running tasks, by id, that should get the message as it stands.
  tell: string[];
  // New work beyond what is running, so it runs as the next round once the team is done.
  later: boolean;
}

const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Your answer to the person now, in their language, short" },
    tell: { type: "array", items: { type: "string" }, description: "Ids of running tasks that should get the message" },
    later: { type: "boolean", description: "True when it asks for new work that should run after the team finishes" },
  },
  required: ["reply", "tell", "later"],
  additionalProperties: false,
};

const SYSTEM = `You are the lead of a Satgas team. Your team is working right now, and the person just sent you a message. Answer them at once: they should never wait for the team to finish to hear from you.

Decide three things:
- "reply": what you say to them now, short and in their language. Answer their question from what you know about the work and about Satgas. When you pass it on or keep it for later, say so plainly.
- "tell": the ids of running tasks whose work this changes or adds to. Those teammates get the message as it is, at their next step. Leave it empty when it changes nobody's current work.
- "later": true when it asks for new work beyond what is running. It then runs as the next round once the team is done, and you plan it then.

A short message belongs to the conversation so far. "gas", "ok", "yes", a letter or a repeat agrees with or picks from what you last asked, and the round below may already be acting on it. When it is already being done, say in one line what is under way, with "tell" empty and "later" false. Never answer that you do not know what to do, or ask them to say the task again: the mission and your last report are below. A pick that differs from what the round is doing is a real change: say so plainly and handle it like any other.

Never say work is done when it is not, and never invent progress: use only the state below.`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const REPORT_CHARS = 1500;

// The round being worked on, in words: each task, who has it, how it stands and what it did last.
export function describeWork(run: Run): string {
  const round = run.rounds?.length ?? 0;
  const people = new Map(crew(run).map((m) => [m.id, m]));
  const logs = getLogs(run.id);
  const tasks = run.nodes.filter((n) => (n.round ?? 0) === round);
  const lines = tasks.map((n) => {
    const who = people.get(memberIdOf(n));
    const last = (logs[n.id] ?? [])
      .filter((l) => l.kind === "tool" || l.kind === "text")
      .slice(-3)
      .map((l) => `    ${clip(l.text.replace(/\s+/g, " "), 140)}`)
      .join("\n");
    return `- ${n.id}: "${n.title}", ${who ? `${who.name} (${who.role})` : n.role}, ${n.status}${last ? `\n  Last steps:\n${last}` : ""}`;
  });
  const asked = round === 0 ? run.prompt : (run.rounds?.[round - 1] ?? run.prompt);
  // A round's own words can be just "gas", so the mission and what the lead last said give them their meaning.
  const before = round > 0 ? run.nodes.filter((n) => (n.round ?? 0) === round - 1 && n.output).at(-1)?.output : undefined;
  const earlier = (run.asides?.[round] ?? []).map((a) => `- They said: ${clip(a.prompt, 200)}\n  You replied: ${clip(a.reply, 200)}`);
  return [
    `The mission:\n${clip(run.prompt, 1500)}`,
    before && `Your team's last report to the person, which they are answering:\n${clip(before, REPORT_CHARS)}`,
    `What the person asked for this round:\n${asked}`,
    `The team's tasks now:\n${lines.join("\n") || "- none yet"}`,
    run.status === "planning" && "You are planning this round right now, so its tasks appear in a moment. The work is under way.",
    earlier.length > 0 && `Already said this round:\n${earlier.join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function asideMessage(run: Run, message: string, cards: string[] = []): string {
  const pointed = (run.board?.cards ?? []).filter((c) => cards.includes(c.id)).map(cardLabel);
  return `The person's message${pointed.length ? `, sent with these cards selected on the board (${pointed.join(", ")})` : ""}:\n${message}`;
}

export async function askLeadAside(run: Run, message: string, signal: AbortSignal, cards: string[] = []): Promise<AsideDecision | null> {
  const prompt = `${describeWork(run)}\n\n${asideMessage(run, message, cards)}\n\n${describeSystem()}`;
  const req = { cwd: run.cwd, signal, onLog: () => {}, prompt, readOnly: true };
  const codex = activeAgent(getSettings().agents) === "codex";
  const result = codex
    ? await runCodex(
        { ...req, prompt: `${SYSTEM}\n\n${prompt}\n\nReply with one JSON object and nothing else, matching:\n${JSON.stringify(SCHEMA)}` },
        { bare: true },
      )
    : await runClaude(req, { systemPrompt: SYSTEM, jsonSchema: SCHEMA, model: config.plannerModel || undefined, tools: "" });
  const raw = (result.structured ?? safeParse(result.output)) as Partial<AsideDecision> | undefined;
  if (!raw || typeof raw.reply !== "string" || !raw.reply.trim()) return null;
  const running = new Set(run.nodes.filter((n) => n.status === "running" || n.status === "pending").map((n) => n.id));
  return {
    reply: raw.reply.trim(),
    tell: Array.isArray(raw.tell) ? raw.tell.filter((id): id is string => typeof id === "string" && running.has(id)) : [],
    later: raw.later === true,
  };
}
