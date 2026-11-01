import { CODEX_KEY_VAR, codexProviderArgs } from "../../shared/providers";
import type { McpServer } from "../../shared/settings";
import { config } from "../config";
import { getSettings } from "../settings";
import { AgentError, type AgentRequest, type AgentResult, clip, type EnvChange, logText, runJsonl } from "./process";

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
    const key = `mcp_servers.${s.name}`;
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

export function codexArgs(cwd: string, mcp = codexMcp(getSettings().mcpServers)): string[] {
  const { agents, providers } = getSettings();
  const cmd = [config.codexBin, "exec", "--json", "--ephemeral", "--skip-git-repo-check", "-C", cwd, "-s", agents.codex.sandbox];
  // Lean mode skips config.toml (MCP servers, profiles); auth still comes from CODEX_HOME. Integrations servers still apply.
  if (config.leanAgents) cmd.push("--ignore-user-config");
  const model = agents.codex.model || (agents.codex.provider === "codex" ? config.codexModel : undefined);
  if (model) cmd.push("-m", model);
  if (agents.codex.effort) cmd.push("-c", `model_reasoning_effort=${JSON.stringify(agents.codex.effort)}`);
  cmd.push(...codexProviderArgs(agents.codex.provider, providers[agents.codex.provider] ?? {}));
  cmd.push(...mcp.args, "-");
  return cmd;
}

// The provider key reaches Codex through the variable its provider entry names, never through argv; so do MCP secrets.
export function codexSpawnEnv(mcp = codexMcp(getSettings().mcpServers)): EnvChange {
  const { agents, providers } = getSettings();
  const key = providers[agents.codex.provider]?.key?.trim();
  return { set: { ...mcp.env, ...(key ? { [CODEX_KEY_VAR]: key } : {}) }, unset: [] };
}

export async function runCodex(req: AgentRequest): Promise<AgentResult> {
  let last = "";
  let failure: string | undefined;
  const mcp = codexMcp(getSettings().mcpServers);
  await runJsonl(
    codexArgs(req.cwd, mcp),
    req,
    (ev) => {
      if (ev.type === "item.started" && ev.item?.type === "command_execution") {
        req.onLog({ kind: "tool", text: `Bash ${clip(String(ev.item.command ?? ""), 120)}` });
      } else if (ev.type === "item.completed") {
        const item = ev.item ?? {};
        if (item.type === "agent_message" && item.text) {
          last = item.text;
          req.onLog({ kind: "text", text: logText(item.text.trim()) });
        } else if (item.type === "file_change") {
          for (const c of item.changes ?? []) {
            req.onLog({ kind: "tool", text: `${c.kind ?? "edit"} ${c.path}` });
            if (typeof c.path === "string") req.onFile?.(c.path, c.kind === "add" ? "added" : c.kind === "delete" ? "deleted" : "modified");
          }
        } else if (item.type === "command_execution" && item.exit_code && item.exit_code !== 0) {
          req.onLog({ kind: "error", text: `Command failed (exit ${item.exit_code})` });
        } else if (item.type === "error" && item.message) {
          req.onLog({ kind: "error", text: clip(item.message, 300) });
        }
      } else if (ev.type === "turn.completed") {
        // Errors before this were retries the turn recovered from ("Reconnecting... 1/5").
        failure = undefined;
      } else if (ev.type === "turn.failed") {
        failure = ev.error?.message ?? "Codex failed.";
      } else if (ev.type === "error" && ev.message) {
        req.onLog({ kind: "error", text: clip(ev.message, 300) });
        failure = ev.message;
      }
    },
    () => (failure ? clip(failure, 400) : undefined),
    codexSpawnEnv(mcp),
  );

  if (failure) throw new AgentError(clip(failure, 400));
  return { output: last };
}
