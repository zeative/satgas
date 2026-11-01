import { homedir } from "node:os";
import { join } from "node:path";

const env = process.env;

export const config = {
  port: Number(env.SATGAS_PORT ?? 4317),
  dataDir: env.SATGAS_DATA_DIR ?? join(homedir(), ".satgas"),
  defaultCwd: env.SATGAS_DEFAULT_CWD ?? process.cwd(),
  // Kept low on purpose: every agent is a full CLI process.
  concurrency: Math.max(1, Number(env.SATGAS_CONCURRENCY ?? 3)),
  // Lean agents skip user settings, hooks and MCP servers; set SATGAS_LEAN_AGENTS=0 if your CLI needs them (custom providers, proxies).
  leanAgents: env.SATGAS_LEAN_AGENTS !== "0",
  claudeBin: env.SATGAS_CLAUDE_BIN ?? "claude",
  codexBin: env.SATGAS_CODEX_BIN ?? "codex",
  plannerModel: env.SATGAS_PLANNER_MODEL ?? "sonnet",
  claudeModel: env.SATGAS_CLAUDE_MODEL,
  claudePermissionMode: env.SATGAS_CLAUDE_PERMISSION_MODE ?? "acceptEdits",
  claudeAllowedTools: env.SATGAS_CLAUDE_ALLOWED_TOOLS ?? "Read Write Edit Glob Grep Bash WebFetch WebSearch",
  codexModel: env.SATGAS_CODEX_MODEL,
  codexSandbox: env.SATGAS_CODEX_SANDBOX ?? "workspace-write",
  maxLogLines: 400,
  upstreamChars: 6000,
};
