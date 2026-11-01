import { config } from "../config";
import { AgentError, type AgentRequest, type AgentResult, clip, runJsonl } from "./process";

export function codexArgs(cwd: string): string[] {
  const cmd = [config.codexBin, "exec", "--json", "--ephemeral", "--skip-git-repo-check", "-C", cwd, "-s", config.codexSandbox];
  // Lean mode skips config.toml (MCP servers, profiles); auth still comes from CODEX_HOME.
  if (config.leanAgents) cmd.push("--ignore-user-config");
  if (config.codexModel) cmd.push("-m", config.codexModel);
  cmd.push("-");
  return cmd;
}

export async function runCodex(req: AgentRequest): Promise<AgentResult> {
  let last = "";
  let failure: string | undefined;
  await runJsonl(codexArgs(req.cwd), req, (ev) => {
    if (ev.type === "item.started" && ev.item?.type === "command_execution") {
      req.onLog({ kind: "tool", text: `Bash ${clip(String(ev.item.command ?? ""), 120)}` });
    } else if (ev.type === "item.completed") {
      const item = ev.item ?? {};
      if (item.type === "agent_message" && item.text) {
        last = item.text;
        req.onLog({ kind: "text", text: item.text.trim() });
      } else if (item.type === "file_change") {
        for (const c of item.changes ?? []) req.onLog({ kind: "tool", text: `${c.kind ?? "edit"} ${c.path}` });
      } else if (item.type === "command_execution" && item.exit_code && item.exit_code !== 0) {
        req.onLog({ kind: "error", text: `Command failed (exit ${item.exit_code})` });
      } else if (item.type === "error" && item.message) {
        req.onLog({ kind: "error", text: clip(item.message, 300) });
      }
    } else if (ev.type === "turn.failed") {
      failure = ev.error?.message ?? "Codex failed.";
    } else if (ev.type === "error" && ev.message) {
      failure = ev.message;
    }
  });

  if (failure) throw new AgentError(clip(failure, 400));
  return { output: last };
}
