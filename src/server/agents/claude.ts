import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeEnv, DEFAULT_PROVIDER, nativeClaude } from "../../shared/providers";
import type { McpServer } from "../../shared/settings";
import type { ModelUsage, Usage } from "../../shared/types";
import { learnClaudeModel } from "../claude-models";
import { config } from "../config";
import { noteLimits } from "../limits";
import { withLogins } from "../oauth";
import { getSettings } from "../settings";
import { enabledSkills, pluginRoot } from "../skills";
import { teamServer, teamUrl } from "../team";
import { ATTRIBUTION, prepareToolHooks, removeToolHooks, type ToolHooks } from "../tools";
import {
  AgentError,
  type AgentRequest,
  type AgentResult,
  clip,
  clipOutput,
  describeInput,
  type EnvChange,
  editLines,
  logText,
  runJsonl,
} from "./process";

const WRITES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export interface ClaudeOptions {
  systemPrompt?: string;
  jsonSchema?: object;
  model?: string;
  // "" disables all tools (planner); undefined keeps the worker tool set.
  tools?: string;
  // A worker session to continue (see AgentRequest.resume).
  resume?: string;
  // Streams the structured answer while the model writes it (the planner's plan), and any thinking, as it arrives.
  onPartial?: (part: { json?: string; thinking?: string }) => void;
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

const EDIT_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

export function claudeArgs(
  opts: ClaudeOptions = {},
  mcp?: McpFile,
  streaming = false,
  tools?: ToolHooks | null,
  readOnly = false,
): string[] {
  const settings = getSettings();
  const cmd = [config.claudeBin, "-p", "--output-format", "stream-json", "--verbose"];
  // Workers keep their session so a task can be continued with its history; the planner's never needs one.
  if (opts.tools !== undefined) cmd.push("--no-session-persistence");
  if (opts.resume) cmd.push("--resume", opts.resume);
  if (streaming) cmd.push("--input-format", "stream-json");
  // Lean mode skips user hooks, plugins and MCP servers so each spawn starts fast and stays light.
  if (config.leanAgents) cmd.push("--strict-mcp-config", "--setting-sources", "");
  const model = claudeModel(opts.model);
  if (model) cmd.push("--model", model);
  if (settings.agents.claude.effort) cmd.push("--effort", settings.agents.claude.effort);
  if (opts.systemPrompt) cmd.push("--append-system-prompt", opts.systemPrompt);
  if (opts.jsonSchema) cmd.push("--json-schema", JSON.stringify(opts.jsonSchema));
  if (opts.onPartial) cmd.push("--include-partial-messages");
  if (opts.tools !== undefined) {
    cmd.push("--tools", opts.tools);
    return cmd;
  }
  // Skills from Integrations come as a plugin folder, which Claude Code loads even in lean mode.
  const skills = enabledSkills().length > 0;
  // Workers get the Integrations MCP servers; each server's tools are allowed up front, since -p cannot ask.
  const base = readOnly ? config.claudeAllowedTools.split(/\s+/).filter((t) => !EDIT_TOOLS.includes(t)) : [config.claudeAllowedTools];
  const allowed = [...base, ...(skills ? ["Skill"] : []), ...(mcp?.servers ?? []).map((name) => `mcp__${name}`)].join(" ");
  // A look-only task cannot reach the file-editing tools at all, whatever its permission mode allows.
  if (readOnly) cmd.push("--disallowedTools", EDIT_TOOLS.join(" "));
  if (mcp) cmd.push("--mcp-config", mcp.path);
  if (skills) cmd.push("--plugin-dir", pluginRoot());
  // Claude Code reads these even in lean mode; the tool hooks' file carries the same attribution when there are hooks.
  cmd.push("--settings", tools ? tools.settingsPath : JSON.stringify({ attribution: ATTRIBUTION }));
  cmd.push("--permission-mode", settings.agents.claude.permissionMode, "--allowedTools", allowed);
  return cmd;
}

// A gateway only knows its own model ids, so Claude aliases (like the planner's) fall back to the chosen model there.
export function claudeModel(requested?: string): string {
  const { provider, model } = getSettings().agents.claude;
  if (requested && nativeClaude(provider)) return requested;
  return model || (nativeClaude(provider) ? config.claudeModel || "" : "");
}

// Claude Code asks unknown models for more output tokens than many gateways allow (Qwen-Max takes 8192). The refusal names
// the cap, so the run is repeated once under it and the cap is kept per provider and model for later runs.
const hot = globalThis as typeof globalThis & { __satgasOutputCaps?: Map<string, number> };
hot.__satgasOutputCaps ??= new Map();
const caps = hot.__satgasOutputCaps;
const capKey = (model: string) => `${getSettings().agents.claude.provider ?? DEFAULT_PROVIDER.claude}:${model}`;

// Gateways wrap refusals as `API Error: 400 … {"message":"<400> InternalError.Algo.InvalidParameter: …"}`; the chat
// shows the message alone, plus what to do when the model isn't offered.
export function readableError(text: string): string {
  const found = /API Error:\s*\d{3}[\s\S]*?"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  if (!found) return text;
  let message: string;
  try {
    message = JSON.parse(`"${found[1]}"`) as string;
  } catch {
    return text;
  }
  message = message
    .replace(/^<\d{3}>\s*/, "")
    .replace(/^InternalError\.[\w.]+:\s*/, "")
    .trim();
  return /does not exist or you do not have access/i.test(message) ? `${message} Pick another model in the composer` : message;
}

export function outputCap(message: string): number | null {
  const match = /max_tokens[^[\d]*\[\s*1\s*,\s*(\d+)\s*\]/i.exec(message) ?? /max_tokens[^\d]*\d+\s*>\s*(\d+)/i.exec(message);
  const cap = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(cap) && cap >= 256 ? cap : null;
}

const withEnv = (env: EnvChange, extra?: Record<string, string>): EnvChange => (extra ? { ...env, set: { ...env.set, ...extra } } : env);

export function claudeSpawnEnv(model = claudeModel()): EnvChange {
  const { agents, providers } = getSettings();
  const kind = agents.claude.provider ?? DEFAULT_PROVIDER.claude;
  const env = claudeEnv(kind, providers[kind] ?? {}, model);
  const cap = caps.get(capKey(model));
  return cap ? { ...env, set: { ...env.set, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(cap) } } : env;
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
  let partialJson = "";
  let thinking = "";
  let session: string | undefined;
  const failure = () =>
    result && (result.is_error || result.subtype !== "success")
      ? clip(readableError(String(result.result || result.subtype || "Claude failed.")), 400)
      : undefined;
  const servers = [
    ...getSettings().mcpServers,
    ...(req.teamToken ? [teamServer(req.teamToken, config.port, false, !!req.teamTalk, !!req.blind)] : []),
  ];
  const mcp = opts.tools === undefined ? await writeMcpFile(await withLogins(servers)) : null;
  const sight = req.blind && req.teamToken ? { url: teamUrl(config.port), token: req.teamToken } : undefined;
  const tools = opts.tools === undefined ? await prepareToolHooks("claude", sight) : null;
  const model = claudeModel(opts.model);
  // Only workers take messages mid-task; the planner answers in one go.
  const streaming = !!req.inbox && opts.tools === undefined;
  const attempt = () =>
    runJsonl(
      claudeArgs({ ...opts, ...(req.resume ? { resume: req.resume } : {}) }, mcp?.file, streaming, tools, !!req.readOnly),
      streaming ? req : { ...req, inbox: undefined },
      (ev) => {
        if (ev.type === "assistant") {
          for (const block of ev.message?.content ?? []) {
            // Claude Code reports a gateway's token-cap refusal as a reply; the retry below says it in plain words instead.
            if (block.type === "text" && block.text.trim().startsWith("API Error") && outputCap(block.text) !== null) continue;
            if (block.type === "text" && block.text.trim()) req.onLog({ kind: "text", text: logText(block.text.trim()) });
            else if (block.type === "thinking" && block.thinking?.trim())
              req.onLog({ kind: "think", text: logText(block.thinking.trim(), 2000) });
            else if (block.type === "tool_use") {
              // How the lead hands back its plan, which the chat already shows; not something it did.
              if (block.name !== "StructuredOutput") {
                const lines = editLines(block.name, block.input);
                req.onLog({
                  kind: "tool",
                  text: `${block.name} ${describeInput(block.input)}`.trim(),
                  call: block.id,
                  ...(lines ? { lines } : {}),
                });
              }
              const path = block.input?.file_path ?? block.input?.notebook_path;
              if (typeof path === "string" && WRITES.has(block.name)) req.onFile?.(path, block.name === "Write" ? "added" : "modified");
            }
          }
        } else if (ev.type === "user") {
          // What each tool gave back, shown under its call in the chat: the text, and a picture when it returned one.
          for (const block of ev.message?.content ?? []) {
            if (block?.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
            const parts = typeof block.content === "string" ? [{ type: "text", text: block.content }] : (block.content ?? []);
            const text = parts
              .filter((p: { type?: string }) => p?.type === "text")
              .map((p: { text?: string }) => p.text ?? "")
              .join("\n");
            const image = parts.find(
              (p: { type?: string; source?: { type?: string } }) => p?.type === "image" && p.source?.type === "base64",
            );
            if (!text.trim() && !image) continue;
            req.onLog({
              kind: "out",
              text: clipOutput(text),
              call: block.tool_use_id,
              ...(block.is_error ? { failed: true } : {}),
              ...(image ? { picture: { mime: image.source.media_type, data: image.source.data } } : {}),
            });
          }
        } else if (ev.type === "rate_limit_event") {
          void noteLimits(ev.rate_limit_info);
        } else if (ev.type === "stream_event" && opts.onPartial) {
          const e = ev.event ?? {};
          // A new block starts its own text; the structured answer arrives as the tool input of its last block.
          if (e.type === "content_block_start") partialJson = "";
          else if (e.type === "content_block_delta" && e.delta?.type === "input_json_delta") {
            partialJson += e.delta.partial_json ?? "";
            opts.onPartial({ json: partialJson });
          } else if (e.type === "content_block_delta" && e.delta?.type === "thinking_delta") {
            thinking = (thinking + (e.delta.thinking ?? "")).slice(-600);
            opts.onPartial({ thinking });
          }
        } else if (ev.type === "system" && ev.subtype === "init" && typeof ev.model === "string") {
          // The CLI says which model an alias really ran on; remembered so the pickers can show its version.
          void learnClaudeModel(model, ev.model);
          if (typeof ev.session_id === "string" && opts.tools === undefined) {
            session = ev.session_id as string;
            req.onSession?.(ev.session_id);
          }
        } else if (ev.type === "result") {
          result = ev;
        }
      },
      failure,
      withEnv(claudeSpawnEnv(model), tools?.env),
    );
  try {
    const known = caps.has(capKey(model));
    let message = "";
    try {
      await attempt();
      message = failure() ?? "";
    } catch (e) {
      message = (e as Error).message;
      if (known || outputCap(message) === null) throw e;
    }
    // The refusal comes on the first request, before any work, so the run repeats once under the cap it names.
    const cap = known ? null : outputCap(message);
    if (cap !== null) {
      caps.set(capKey(model), cap);
      req.onLog({ kind: "info", text: `The model takes at most ${cap} output tokens; running again within that` });
      result = undefined;
      await attempt();
    }
  } finally {
    if (mcp) await rm(mcp.dir, { recursive: true, force: true });
    await removeToolHooks(tools);
  }

  if (!result) throw new AgentError("Claude finished without a result.");
  const reason = failure();
  if (reason) throw new AgentError(reason);
  const usage = usageOf(result, nativeClaude(getSettings().agents.claude.provider));
  return {
    output: String(result.result ?? ""),
    structured: result.structured_output,
    ...(usage ? { usage } : {}),
    ...(session && opts.tools === undefined ? { session } : {}),
  };
}

// Per model when the CLI says, side calls like a session title included. A gateway bills its own way, so its figure is not kept.
export function usageOf(result: any, native: boolean): Usage | undefined {
  const models = Object.entries((result.modelUsage ?? {}) as Record<string, any>);
  if (models.length) {
    const byModel: Record<string, ModelUsage> = {};
    for (const [id, m] of models) {
      byModel[m.canonicalModel ?? id] = {
        input: m.inputTokens ?? 0,
        read: m.cacheReadInputTokens ?? 0,
        write: m.cacheCreationInputTokens ?? 0,
        output: m.outputTokens ?? 0,
        ...(native && typeof m.costUSD === "number" ? { cost: m.costUSD } : {}),
      };
    }
    const all = Object.values(byModel);
    const cached = all.reduce((n, m) => n + m.read + m.write, 0);
    return { input: all.reduce((n, m) => n + m.input, 0) + cached, cached, output: all.reduce((n, m) => n + m.output, 0), byModel };
  }
  const u = result.usage ?? {};
  const cached = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  return typeof u.output_tokens === "number" ? { input: (u.input_tokens ?? 0) + cached, cached, output: u.output_tokens } : undefined;
}
