import type { Card } from "../../../shared/board";
import { insideOwnFrame, stripBlocks } from "../../../shared/board-blocks";
import { latestRound, sinks } from "../../../shared/graph";
import type { Asked } from "../../../shared/questions";
import type { Refs } from "../../../shared/refs";
import type { NodeState, Run } from "../../../shared/types";

type Reported = NodeState & { output: string };

// Follow-up rounds hang off earlier ones through `after`, not `dependsOn`, so finals are taken inside one round only.
export const finalsOf = (tasks: NodeState[]): Reported[] => sinks(tasks).filter((n): n is Reported => !!n.output?.trim());

// The board's report: what the final tasks of the latest round wrote.
export const finalTasks = (nodes: NodeState[]): Reported[] => finalsOf(latestRound(nodes));

// Native-card blocks are on the board already (and linked from the chat), so reports read without them.
export const joinReports = (tasks: { output: string }[]) =>
  tasks
    .map((n) => stripBlocks(n.output.trim()))
    .filter(Boolean)
    .join("\n\n---\n\n");

export interface Round {
  index: number;
  prompt: string;
  tasks: NodeState[];
  // The round's final tasks; their closing words are the report, so the timeline does not repeat them.
  finals: ReadonlySet<string>;
  report: string;
  cards: Card[];
  // The planner's own answer when the request needed no work.
  answer?: string;
  // What the planner asked before planning, with the person's answers once given.
  asked?: Asked;
  // What the prompt's / and @ words pointed at.
  refs?: Refs;
  // Files attached to the round's prompt, as workspace paths.
  files: string[];
  // How a finished round ended when its tasks don't say it: stopped, or no plan came out of it.
  outcome: "cancelled" | "noPlan" | null;
}

export function roundsOf(run: Run): Round[] {
  const prompts = [run.prompt, ...(run.rounds ?? [])];
  const cards = run.board?.cards ?? [];
  return prompts.map((prompt, index) => {
    const tasks = run.nodes.filter((n) => (n.round ?? 0) === index);
    const ids = new Set(tasks.map((n) => n.id));
    const finals = finalsOf(tasks);
    const latest = index === prompts.length - 1;
    const live = latest && (run.status === "planning" || run.status === "asking" || run.status === "running");
    const asked = run.asks?.[index];
    // Only the latest round's failure is recorded (`run.error`); the chat shows that one as an alert.
    const failedPlan = latest && run.status === "failed" && !!run.error;
    const cancelled = latest ? run.status === "cancelled" : tasks.some((n) => n.status === "cancelled");
    return {
      index,
      prompt,
      tasks,
      finals: new Set(sinks(tasks).map((n) => n.id)),
      report: joinReports(finals),
      cards: cards.filter((c) => c.from && ids.has(c.from) && !insideOwnFrame(c, cards)),
      answer: run.answers?.[index],
      asked,
      refs: run.refs?.[index],
      files: run.files?.[index] ?? [],
      // Questions set aside say so themselves, so they need no outcome line.
      outcome:
        live || (asked && !asked.answers)
          ? null
          : cancelled
            ? "cancelled"
            : !tasks.length && !failedPlan && !run.answers?.[index] && !run.edits?.[index]
              ? "noPlan"
              : null,
    };
  });
}
