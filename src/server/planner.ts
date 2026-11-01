import { readdir } from "node:fs/promises";
import { MAX_NODES, validatePlan } from "../shared/graph";
import type { Plan } from "../shared/types";
import { runClaude } from "./agents/claude";
import { AgentError, type AgentRequest } from "./agents/process";
import { config } from "./config";
import { getSettings, taskAgents } from "./settings";

const PLAN_SCHEMA = {
  type: "object",
  required: ["title", "summary", "nodes"],
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Short mission name, max 6 words" },
    summary: { type: "string", description: "One sentence describing the approach" },
    nodes: {
      type: "array",
      minItems: 1,
      maxItems: MAX_NODES,
      items: {
        type: "object",
        required: ["id", "title", "role", "agent", "task", "dependsOn"],
        additionalProperties: false,
        properties: {
          id: { type: "string", pattern: "^[a-z0-9-]+$" },
          title: { type: "string", description: "Max 5 words" },
          role: { type: "string", description: "Specialist role, e.g. Backend engineer" },
          agent: { type: "string", enum: ["claude", "codex"] },
          task: { type: "string", description: "Complete, self-contained instructions for this agent" },
          dependsOn: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const SYSTEM = `You are the planner of Satgas, a multi-agent orchestration system.
Turn the user's mission into a directed acyclic graph of tasks. Each task is executed by an autonomous CLI agent (Claude Code or Codex) that can read/write files and run commands in the shared working directory.

Rules:
- Use as few tasks as the mission needs: 1 for trivial missions, usually 3-7, never more than ${MAX_NODES}.
- Maximize parallelism: tasks without a real data dependency must not depend on each other.
- Never let two parallel tasks edit the same files; give each a clear file/area ownership.
- Each task's instructions must be self-contained: an agent only sees its own task, the overall mission, and the reports of the tasks it depends on.
- When the graph branches, end with one final task that integrates, verifies, and reports the result to the user.
- When previous work on the board is given, plan only the new request: build on what exists, fix what failed if asked, and never redo finished work.
- agent: AGENT_RULE
- Language: write title, summary, role and task in the language the mission text itself is written in (an English mission gets English text). "Satgas" is a product name, not a language hint.`;

export async function plan(req: Omit<AgentRequest, "prompt"> & { mission: string; context?: string }): Promise<Plan> {
  const listing = await listDir(req.cwd);
  const ask = req.context
    ? `Previous work on this board:\n${req.context}\n\nNew request (plan only this):\n${req.mission}`
    : `Mission:\n${req.mission}`;
  const prompt = `${ask}\n\nWorking directory: ${req.cwd}\nTop-level entries:\n${listing}`;
  req.onLog({ kind: "info", text: "Reading the mission and drafting a plan" });
  const agents = taskAgents();
  if (!agents.length) throw new AgentError("Turn on at least one agent in Integrations.");
  const rule =
    agents.length === 2
      ? 'use "claude" by default; use "codex" for focused, well-specified coding or refactoring work.'
      : `always use "${agents[0]}"; it is the only agent turned on.`;
  const { structured, output } = await runClaude(
    { ...req, prompt },
    {
      systemPrompt: SYSTEM.replace("AGENT_RULE", rule),
      jsonSchema: PLAN_SCHEMA,
      model: getSettings().agents.claude.plannerModel || config.plannerModel,
      tools: "",
    },
  );
  const result = (structured ?? safeParse(output)) as Plan | undefined;
  if (!result) throw new AgentError("The planner did not return a valid plan.");
  // A planner that ignores the rule still cannot hand work to an agent that is turned off.
  for (const n of result.nodes ?? []) if (!agents.includes(n.agent)) n.agent = agents[0] ?? "claude";
  const problem = validatePlan(result);
  if (problem) throw new AgentError(problem);
  return result;
}

async function listDir(cwd: string): Promise<string> {
  try {
    const entries = await readdir(cwd, { withFileTypes: true });
    const shown = entries.filter((e) => !e.name.startsWith(".") && e.name !== "node_modules").slice(0, 60);
    return shown.length ? shown.map((e) => `- ${e.name}${e.isDirectory() ? "/" : ""}`).join("\n") : "(empty)";
  } catch {
    return "(unreadable)";
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
