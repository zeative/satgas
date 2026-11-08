import { codexKeyVar, codexProviderArgs } from "../../shared/providers";
import type { McpServer } from "../../shared/settings";
import { config } from "../config";
import { withLogins } from "../oauth";
import { getSettings } from "../settings";
import { teamServer } from "../team";
import { codexHookArgs, prepareToolHooks, removeToolHooks, type ToolHooks } from "../tools";
import {
  AgentError,
  type AgentRequest,
  type AgentResult,
  clip,
  clipOutput,
  describeInput,
  type EnvChange,
  logText,
  runJsonl,
} from "./process";

export interface CodexMcp {
  args: string[];
  env: Record<string, string>;
}

// MCP servers as `-c` overrides (JSON strings and arrays are valid TOML values). Env values and headers hold tokens and
// the command line is visible to every local user, so they travel in Codex's environment and the config only names them.
export function codexMcp(servers: McpServer[], inherited: Record<string, string | undefined> = process.env): CodexMcp {
  const args: string[] = [];
  const env: Record<string, string> = {};
  const toml = (pairs: [string, string][]) => `{ ${pairs.map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`).join(", ")} }`;
  servers.forEach((s, i) => {
    if (!s.enabled) return;
    // Codex ships its own plugins under names like "github" and silently skips a server that takes one, so every
    // connector gets a prefix; its tools then read mcp__satgas_github__…
    const key = `mcp_servers.satgas_${s.name}`;
    if (s.transport === "stdio" && s.command) {
      args.push("-c", `${key}.command=${JSON.stringify(s.command)}`, "-c", `${key}.args=${JSON.stringify(s.args ?? [])}`);
      // Codex forwards a variable under its own name, so one its environment already holds with another value
      // (PATH, or another server's) stays inline rather than change Codex itself.
      const forwarded: string[] = [];
      const inline: [string, string][] = [];
      for (const [k, v] of Object.entries(s.env ?? {})) {
        const taken = env[k] ?? inherited[k];
        if (taken === undefined) env[k] = v;
        if (taken === undefined || taken === v) forwarded.push(k);
        else inline.push([k, v]);
      }
      if (forwarded.length) args.push("-c", `${key}.env_vars=${JSON.stringify(forwarded)}`);
      if (inline.length) args.push("-c", `${key}.env=${toml(inline)}`);
      if (s.toolTimeoutSec) args.push("-c", `${key}.tool_timeout_sec=${s.toolTimeoutSec}`);
      if (s.toolsApproved) args.push("-c", `${key}.default_tools_approval_mode="approve"`);
    } else if (s.transport === "http" && s.url) {
      args.push("-c", `${key}.url=${JSON.stringify(s.url)}`);
      const headers = Object.entries(s.headers ?? {}).map(([h, v], j): [string, string] => {
        const name = `SATGAS_MCP_${i}_HEADER_${j}`;
        env[name] = v;
        return [h, name];
      });
      if (headers.length) args.push("-c", `${key}.env_http_headers=${toml(headers)}`);
    }
  });
  return { args, env };
}

export function codexArgs(
  cwd: string,
  mcp = codexMcp(getSettings().mcpServers),
  tools: ToolHooks | null = null,
  readOnly = false,
  lead = false,
  blind = false,
): string[] {
  const { agents, providers } = getSettings();
  // Containers refuse the namespaces Codex's sandbox needs, so every command would fail there; the container is the boundary.
  // The lead runs no commands, so its read-only sandbox never comes into play.
  const sandbox = lead ? "read-only" : config.container ? "danger-full-access" : readOnly ? "read-only" : agents.codex.sandbox;
  // A login shell would reorder PATH and put a signed-in CLI back in front of the account guard.
  const cmd = [
    config.codexBin,
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "-c",
    "allow_login_shell=false",
    "-C",
    cwd,
    "-s",
    sandbox,
  ];
  // Lean mode skips config.toml (MCP servers, profiles); auth still comes from CODEX_HOME. Integrations servers still apply.
  if (config.leanAgents) cmd.push("--ignore-user-config");
  const model = agents.codex.model || (agents.codex.provider === "codex" ? config.codexModel : undefined);
  if (model) cmd.push("-m", model);
  if (agents.codex.effort) cmd.push("-c", `model_reasoning_effort=${JSON.stringify(agents.codex.effort)}`);
  // The lead only plans. Left with tools it looks things up and answers by itself instead of giving the work to a task.
  if (lead) cmd.push("-c", "features.shell_tool=false", "-c", "features.unified_exec=false", "-c", 'web_search="disabled"');
  // A model that cannot see fails the whole turn on an image, so it loses the image tool and uses see_image instead.
  if (blind) cmd.push("-c", "features.view_image=false");
  cmd.push(...codexProviderArgs(agents.codex.provider, providers[agents.codex.provider] ?? {}));
  cmd.push(...mcp.args, ...codexHookArgs(tools), "-");
  return cmd;
}

// The provider key reaches Codex through the variable its provider entry names, never through argv; so do MCP secrets.
export function codexSpawnEnv(mcp = codexMcp(getSettings().mcpServers), tools: ToolHooks | null = null): EnvChange {
  const { agents, providers } = getSettings();
  const provider = providers[agents.codex.provider] ?? {};
  const key = provider.key?.trim();
  return { set: { ...mcp.env, ...tools?.env, ...(key ? { [codexKeyVar(agents.codex.provider, provider)]: key } : {}) }, unset: [] };
}

// Codex wraps each command in its login shell; the person reads the command itself.
export const shellBody = (cmd: string) => /^(?:\/\S*\/)?(?:ba|z|da)?sh\s+-l?c\s+(["'])([\s\S]*)\1$/.exec(cmd.trim())?.[2] ?? cmd;

const mcpLine = (item: { server?: unknown; tool?: unknown; arguments?: unknown }) =>
  `mcp__${item.server}__${item.tool} ${describeInput(item.arguments)}`.trim();

// Codex warns about the hook-trust flag on every run (Satgas wrote those hooks itself) and about models it has no notes on;
// neither stops the work, so neither is an error worth showing.
const NOTICE = /dangerously-bypass-hook-trust|Model metadata for .* not found/;
const SANDBOX_REFUSED = /bwrap: No permissions to create a new namespace/;

// Codex passes on a provider's refusal with the status and request details around it. Server errors keep their status, which
// is how a retry recognises them.
export function readableCodexError(text: string): string {
  const message = text
    .replace(/^unexpected status 4\d\d[^:]*:\s*/i, "")
    .replace(/,\s*url:\s[\s\S]*$/i, "")
    .trim();
  return /does not exist or you do not have access/i.test(message) ? `${message} Pick another model in the composer` : message;
}

// `bare` is the lead's run: it only answers, so it gets no connectors or tool hooks.
export async function runCodex(req: AgentRequest, { bare = false } = {}): Promise<AgentResult> {
  let last = "";
  let failure: string | undefined;
  let sandboxRefused = false;
  const usage = { input: 0, cached: 0, output: 0 };
  const mcp = codexMcp(
    bare
      ? []
      : await withLogins([
          ...getSettings().mcpServers,
          ...(req.teamToken ? [teamServer(req.teamToken, config.port, true, !!req.teamTalk, !!req.blind)] : []),
        ]),
  );
  const tools = bare ? null : await prepareToolHooks("codex");
  try {
    await runJsonl(
      codexArgs(req.cwd, mcp, tools, !!req.readOnly, bare, !!req.blind),
      req,
      (ev) => {
        if (ev.type === "item.started" && ev.item?.type === "command_execution") {
          req.onLog({ kind: "tool", text: `Bash ${clip(shellBody(String(ev.item.command ?? "")), 400)}`, call: ev.item.id });
        } else if (ev.type === "item.started" && ev.item?.type === "mcp_tool_call") {
          req.onLog({ kind: "tool", text: mcpLine(ev.item) });
        } else if (ev.type === "item.completed") {
          const item = ev.item ?? {};
          // A command's output, shown under it in the chat.
          if (item.type === "command_execution" && typeof item.id === "string" && String(item.aggregated_output ?? "").trim())
            req.onLog({
              kind: "out",
              text: clipOutput(String(item.aggregated_output)),
              call: item.id,
              ...(item.exit_code ? { failed: true } : {}),
            });
          if (item.type === "reasoning" && item.text?.trim()) {
            req.onLog({ kind: "think", text: logText(item.text.trim(), 2000) });
          } else if (item.type === "web_search" && item.query) {
            req.onLog({ kind: "tool", text: `WebSearch ${clip(String(item.query), 400)}` });
          } else if (item.type === "agent_message" && item.text) {
            last = item.text;
            req.onLog({ kind: "text", text: logText(item.text.trim()) });
          } else if (item.type === "file_change") {
            for (const c of item.changes ?? []) {
              req.onLog({ kind: "tool", text: `${c.kind ?? "edit"} ${c.path}` });
              if (typeof c.path === "string")
                req.onFile?.(c.path, c.kind === "add" ? "added" : c.kind === "delete" ? "deleted" : "modified");
            }
          } else if (item.type === "command_execution" && SANDBOX_REFUSED.test(String(item.aggregated_output ?? ""))) {
            sandboxRefused = true;
            req.onLog({ kind: "error", text: "The sandbox refused this command" });
          } else if (item.type === "command_execution" && item.exit_code && item.exit_code !== 0) {
            req.onLog({ kind: "error", text: `Command failed (exit ${item.exit_code})` });
          } else if (item.type === "error" && item.message && !NOTICE.test(item.message)) {
            req.onLog({ kind: "error", text: clip(item.message, 300) });
          }
        } else if (ev.type === "turn.completed") {
          usage.input += ev.usage?.input_tokens ?? 0;
          usage.cached += ev.usage?.cached_input_tokens ?? 0;
          usage.output += ev.usage?.output_tokens ?? 0;
          // Errors before this were retries the turn recovered from ("Reconnecting... 1/5").
          failure = undefined;
        } else if (ev.type === "turn.failed") {
          failure = readableCodexError(ev.error?.message ?? "Codex failed.");
        } else if (ev.type === "error" && ev.message) {
          failure = readableCodexError(ev.message);
          req.onLog({ kind: "error", text: clip(failure, 300) });
        }
      },
      () => (failure ? clip(failure, 400) : undefined),
      codexSpawnEnv(mcp, tools),
    );
  } finally {
    await removeToolHooks(tools);
  }

  if (failure) throw new AgentError(clip(failure, 400));
  // The model only reports this in words, which would otherwise pass as a finished task. The lead needs no commands to plan.
  if (sandboxRefused && !bare)
    throw new AgentError("Codex's sandbox cannot run commands on this machine. Set the sandbox to Full access under Settings, Security");
  if (!usage.output) return { output: last };
  // Codex reports no price, so what it spent stays unpriced.
  const model = getSettings().agents.codex.model || config.codexModel || "codex";
  const byModel = { [model]: { input: Math.max(0, usage.input - usage.cached), read: usage.cached, write: 0, output: usage.output } };
  return { output: last, usage: { ...usage, byModel } };
}
