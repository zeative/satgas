import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeEnv, DEFAULT_PROVIDER, nativeClaude } from "../../shared/providers";
import type { McpServer } from "../../shared/settings";
import { learnClaudeModel } from "../claude-models";
import { config } from "../config";
import { getSettings } from "../settings";
import { AgentError, type AgentRequest, type AgentResult, clip, type EnvChange, logText, runJsonl } from "./process";

const WRITES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export interface ClaudeOptions {
  systemPrompt?: string;
  jsonSchema?: object;
  model?: string;
  // "" disables all tools (planner); undefined keeps the worker tool set.
  tools?: string;
}

// The MCP servers from Integrations in Claude's --mcp-config shape.
export function claudeMcpConfig(servers: McpServer[]): { mcpServers: Record<string, unknown> } | null {
  const on = servers.filter((s) => s.enabled);
  if (!on.length) return null;
  const entries = on.map((s) => [
    s.name,
    s.transport === "http"
      ? { type: "http", url: s.url, headers: s.headers ?? {} }
      : { type: "stdio", command: s.command, args: s.args ?? [], env: s.env ?? {} },
  ]);
  return { mcpServers: Object.fromEntries(entries) };
}

// Where a worker's MCP servers were written, and which servers that file holds.
export interface McpFile {
  path: string;
  servers: string[];
}

export function claudeArgs(opts: ClaudeOptions = {}, mcp?: McpFile): string[] {
  const settings = getSettings();
  const cmd = [config.claudeBin, "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence"];
  // Lean mode skips user hooks, plugins and MCP servers so each spawn starts fast and stays light.
  if (config.leanAgents) cmd.push("--strict-mcp-config", "--setting-sources", "");
  const model = claudeModel(opts.model);
  if (model) cmd.push("--model", model);
  if (settings.agents.claude.effort) cmd.push("--effort", settings.agents.claude.effort);
  if (opts.systemPrompt) cmd.push("--append-system-prompt", opts.systemPrompt);
  if (opts.jsonSchema) cmd.push("--json-schema", JSON.stringify(opts.jsonSchema));
  if (opts.tools !== undefined) {
    cmd.push("--tools", opts.tools);
    return cmd;
  }
  // Workers get the Integrations MCP servers; each server's tools are allowed up front, since -p cannot ask.
  const allowed = [config.claudeAllowedTools, ...(mcp?.servers ?? []).map((name) => `mcp__${name}`)].join(" ");
  if (mcp) cmd.push("--mcp-config", mcp.path);
  cmd.push("--permission-mode", settings.agents.claude.permissionMode, "--allowedTools", allowed);
  return cmd;
}

// A gateway only knows its own model ids, so Claude aliases (like the planner's) fall back to the chosen model there.
export function claudeModel(requested?: string): string {
  const { provider, model } = getSettings().agents.claude;
  if (requested && nativeClaude(provider)) return requested;
  return model || (nativeClaude(provider) ? config.claudeModel || "" : "");
}

export function claudeSpawnEnv(model = claudeModel()): EnvChange {
  const { agents, providers } = getSettings();
  const kind = agents.claude.provider ?? DEFAULT_PROVIDER.claude;
  return claudeEnv(kind, providers[kind] ?? {}, model);
}

// MCP env values and headers hold tokens, and the command line is visible to every local user, so the config
// goes through a file only this user can read, removed when the run ends.
async function writeMcpFile(servers: McpServer[]): Promise<{ file: McpFile; dir: string } | null> {
  const mcp = claudeMcpConfig(servers);
  if (!mcp) return null;
  const dir = await mkdtemp(join(tmpdir(), "satgas-mcp-"));
  const path = join(dir, "mcp.json");
  await writeFile(path, JSON.stringify(mcp), { mode: 0o600 });
  return { file: { path, servers: Object.keys(mcp.mcpServers) }, dir };
}

export async function runClaude(req: AgentRequest, opts: ClaudeOptions = {}): Promise<AgentResult> {
  let result: any;
  const failure = () =>
    result && (result.is_error || result.subtype !== "success")
      ? clip(String(result.result || result.subtype || "Claude failed."), 400)
      : undefined;
  const mcp = opts.tools === undefined ? await writeMcpFile(getSettings().mcpServers) : null;
  try {
    await runJsonl(
      claudeArgs(opts, mcp?.file),
      req,
      (ev) => {
        if (ev.type === "assistant") {
          for (const block of ev.message?.content ?? []) {
            if (block.type === "text" && block.text.trim()) req.onLog({ kind: "text", text: logText(block.text.trim()) });
            else if (block.type === "tool_use") {
              req.onLog({ kind: "tool", text: `${block.name} ${describeInput(block.input)}`.trim() });
              const path = block.input?.file_path ?? block.input?.notebook_path;
              if (typeof path === "string" && WRITES.has(block.name)) req.onFile?.(path, block.name === "Write" ? "added" : "modified");
            }
          }
        } else if (ev.type === "system" && ev.subtype === "init" && typeof ev.model === "string") {
          // The CLI says which model an alias really ran on; remembered so the pickers can show its version.
          void learnClaudeModel(claudeModel(opts.model), ev.model);
        } else if (ev.type === "result") {
          result = ev;
        }
      },
      failure,
      claudeSpawnEnv(claudeModel(opts.model)),
    );
  } finally {
    if (mcp) await rm(mcp.dir, { recursive: true, force: true });
  }

  if (!result) throw new AgentError("Claude finished without a result.");
  const reason = failure();
  if (reason) throw new AgentError(reason);
  return { output: String(result.result ?? ""), structured: result.structured_output };
}

function describeInput(input: any): string {
  if (!input || typeof input !== "object") return "";
  const v = input.command ?? input.file_path ?? input.path ?? input.pattern ?? input.url ?? input.query ?? input.description;
  return v ? clip(String(v), 120) : "";
}
