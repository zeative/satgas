import { homedir } from "node:os";
import { join } from "node:path";

const env = process.env;

// The public address when Satgas runs behind a reverse proxy on a server, e.g. https://satgas.example.com.
const publicUrl = (env.SATGAS_PUBLIC_URL ?? "").trim().replace(/\/+$/, "") || null;

export const config = {
  port: Number(env.SATGAS_PORT ?? 4317),
  // Loopback by default, so a laptop never exposes it; a server or container sets 0.0.0.0 and puts HTTPS in front.
  host: env.SATGAS_HOST ?? "127.0.0.1",
  publicUrl,
  // A fixed sign-in token for servers; without it Satgas generates one and keeps it in the data folder.
  token: env.SATGAS_TOKEN?.trim() || null,
  // Vite's dev server, which serves the UI in development and proxies the API.
  webPort: Number(env.SATGAS_WEB_PORT ?? 5317),
  // Chat channels have not met a real Telegram or WhatsApp account yet, so they stay off unless asked for.
  channels: env.SATGAS_CHANNELS === "1",
  // Telegram lets people run their own Bot API server.
  telegramApi: env.SATGAS_TELEGRAM_API ?? "https://api.telegram.org",
  dataDir: env.SATGAS_DATA_DIR ?? join(homedir(), ".satgas"),
  defaultCwd: env.SATGAS_DEFAULT_CWD ?? process.cwd(),
  // Kept low on purpose: every agent is a full CLI process.
  // Set here it wins over Configurations → Settings.
  concurrency: env.SATGAS_CONCURRENCY ? Math.max(1, Number(env.SATGAS_CONCURRENCY)) : null,
  // Lean agents skip user settings, hooks and MCP servers; set SATGAS_LEAN_AGENTS=0 if your CLI needs them (custom providers, proxies).
  leanAgents: env.SATGAS_LEAN_AGENTS !== "0",
  // Forces team talk on (1) or off (0) whatever Configurations says, for comparing runs; unset follows the setting.
  teamTalk: env.SATGAS_TEAM_TALK === undefined ? null : env.SATGAS_TEAM_TALK !== "0",
  claudeBin: env.SATGAS_CLAUDE_BIN ?? "claude",
  codexBin: env.SATGAS_CODEX_BIN ?? "codex",
  // Empty: the lead answers on the same model the tasks use, the one shown in the composer.
  plannerModel: env.SATGAS_PLANNER_MODEL ?? "",
  claudeModel: env.SATGAS_CLAUDE_MODEL,
  claudePermissionMode: env.SATGAS_CLAUDE_PERMISSION_MODE ?? "acceptEdits",
  claudeAllowedTools: env.SATGAS_CLAUDE_ALLOWED_TOOLS ?? "Read Write Edit Glob Grep Bash WebFetch WebSearch",
  codexModel: env.SATGAS_CODEX_MODEL,
  codexSandbox: env.SATGAS_CODEX_SANDBOX ?? "workspace-write",
  // Shown on the home page; forks point it at their own repo.
  repo: env.SATGAS_REPO ?? "zeative/satgas",
  // Where releases are read from; forks and tests point it elsewhere.
  updateApi: (env.SATGAS_UPDATE_API ?? "https://api.github.com").replace(/\/+$/, ""),
  maxLogLines: 400,
  upstreamChars: 6000,
};
