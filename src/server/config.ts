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
  // Shown on the home page; forks point it at their own repo.
  repo: env.SATGAS_REPO ?? "zeative/satgas",
  maxLogLines: 400,
  upstreamChars: 6000,
};
