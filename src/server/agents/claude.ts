import { config } from "../config";
import { AgentError, type AgentRequest, type AgentResult, clip, runJsonl } from "./process";

export interface ClaudeOptions {
  systemPrompt?: string;
  jsonSchema?: object;
  model?: string;
  // "" disables all tools (planner); undefined keeps the worker tool set.
  tools?: string;
}

export function claudeArgs(opts: ClaudeOptions = {}): string[] {
  const cmd = [config.claudeBin, "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence"];
  // Lean mode skips user hooks, plugins and MCP servers so each spawn starts fast and stays light.
  if (config.leanAgents) cmd.push("--strict-mcp-config", "--setting-sources", "");
  const model = opts.model ?? config.claudeModel;
  if (model) cmd.push("--model", model);
  if (opts.systemPrompt) cmd.push("--append-system-prompt", opts.systemPrompt);
  if (opts.jsonSchema) cmd.push("--json-schema", JSON.stringify(opts.jsonSchema));
  if (opts.tools !== undefined) cmd.push("--tools", opts.tools);
  else cmd.push("--permission-mode", config.claudePermissionMode, "--allowedTools", config.claudeAllowedTools);
  return cmd;
}

export async function runClaude(req: AgentRequest, opts: ClaudeOptions = {}): Promise<AgentResult> {
  let result: any;
  await runJsonl(claudeArgs(opts), req, (ev) => {
    if (ev.type === "assistant") {
      for (const block of ev.message?.content ?? []) {
        if (block.type === "text" && block.text.trim()) req.onLog({ kind: "text", text: block.text.trim() });
        else if (block.type === "tool_use") req.onLog({ kind: "tool", text: `${block.name} ${describeInput(block.input)}`.trim() });
      }
    } else if (ev.type === "result") {
      result = ev;
    }
  });

  if (!result) throw new AgentError("Claude finished without a result.");
  if (result.is_error || result.subtype !== "success") {
    throw new AgentError(clip(String(result.result || result.subtype || "Claude failed."), 400));
  }
  return { output: String(result.result ?? ""), structured: result.structured_output };
}

function describeInput(input: any): string {
  if (!input || typeof input !== "object") return "";
  const v = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query ?? input.description;
  return v ? clip(String(v), 120) : "";
}
