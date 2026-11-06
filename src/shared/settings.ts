// Integrations: how each agent runs and which MCP servers every agent gets. Shared by server and client.

import { type CommitStyle, DEFAULT_COMMIT_STYLE, sanitizeCommitStyle } from "./commits";
import {
  CLAUDE_EFFORTS,
  DEFAULT_PROVIDER,
  type Effort,
  type ProviderConfig,
  type ProviderKind,
  providerDef,
  type Runtime,
} from "./providers";
import { sanitizeTools, type ToolSetting } from "./tools";

export type PermissionMode = "acceptEdits" | "bypassPermissions";
export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access";

export interface McpServer {
  id: string;
  // Also the tool prefix agents see (mcp__<name>__tool), so it stays a plain identifier.
  name: string;
  // The catalog entry it was added from; custom servers have none, even when their name matches one.
  catalogId?: string;
  enabled: boolean;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  // Set only on Satgas's own built-in connector, never saved: how long one tool call may take, for Codex.
  toolTimeoutSec?: number;
  // Codex cancels a tool that asks for approval when nobody can answer; only Satgas's own connector skips the ask.
  toolsApproved?: boolean;
}

export interface Settings {
  agents: {
    claude: {
      tasks: boolean;
      provider: ProviderKind;
      model: string;
      plannerModel: string;
      // "" keeps the CLI's own default.
      effort: Effort | "";
      permissionMode: PermissionMode;
    };
    codex: { tasks: boolean; provider: ProviderKind; model: string; effort: string; sandbox: CodexSandbox };
  };
  // Keys and endpoints per provider; an entry exists once someone connects it.
  providers: Partial<Record<ProviderKind, ProviderConfig>>;
  mcpServers: McpServer[];
  // Integrations → Tools: what runs around every agent's work.
  tools: ToolSetting[];
  // How long one task may work before it is asked to wrap up, in minutes.
  taskMinutes: number;
  // How many tasks one board runs side by side.
  concurrency: number;
  // Teammates working the same round can post notes and ask each other; off by default, since two benchmarks showed no
  // gain for the extra tokens.
  teamTalk: boolean;
  // Writing tasks that run side by side in a git repository each work on their own branch in a worktree, merged back
  // when they finish; each borrows the folder's node_modules.
  worktrees: boolean;
  // How agents and Satgas write commit messages.
  commitStyle: CommitStyle;
  // Pull requests agents open are watched: failed checks, new review feedback and conflicts start a round to fix them.
  watchPulls: boolean;
  // Ask GitHub now and then whether a newer Satgas is out.
  checkUpdates: boolean;
  // Set once the old forced planner default has been moved to "same as tasks".
  plannerMigrated?: boolean;
  // Default tools already offered once; a default added later joins existing setups once, and a removal sticks.
  toolsOffered?: string[];
}

export const PERMISSION_MODES: PermissionMode[] = ["acceptEdits", "bypassPermissions"];
export const CODEX_SANDBOXES: CodexSandbox[] = ["read-only", "workspace-write", "danger-full-access"];
export const MCP_NAME = /^[A-Za-z0-9_-]{1,40}$/;
// The choices offered for a task's time limit; 0 means no limit.
export const TASK_MINUTES = [5, 10, 20, 30, 60, 0];
export const CONCURRENCY = [1, 2, 3, 4, 6, 8];
const MAX_SERVERS = 40;

const str = (v: unknown, max = 500) => (typeof v === "string" && v.length <= max ? v.trim() : null);

const providerFor = (runtime: Runtime, v: unknown, fallback: ProviderKind): ProviderKind => {
  const def = typeof v === "string" ? providerDef.get(v as ProviderKind) : undefined;
  return def?.runtime === runtime ? def.kind : fallback;
};

function providers(v: unknown): Settings["providers"] | string {
  if (v === undefined) return {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return "The providers were malformed.";
  const out: Settings["providers"] = {};
  for (const [kind, raw] of Object.entries(v as Record<string, unknown>)) {
    const def = providerDef.get(kind as ProviderKind);
    if (!def || def.auth === "cli") continue;
    const cfg = (raw ?? {}) as Record<string, unknown>;
    const key = cfg.key === undefined ? undefined : str(cfg.key, 4000);
    const baseUrl = cfg.baseUrl === undefined || cfg.baseUrl === "" ? undefined : str(cfg.baseUrl, 500);
    if (key === null) return `${def.name}: the key is too long.`;
    if (baseUrl === null || (baseUrl && !/^https?:\/\/[^\s]+$/i.test(baseUrl))) return `${def.name}: the endpoint must be an http(s) URL.`;
    out[def.kind] = { ...(key ? { key } : {}), ...(baseUrl ? { baseUrl } : {}) };
  }
  return out;
}

function record(v: unknown, maxKeys = 40): Record<string, string> | null {
  if (v === undefined) return {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > maxKeys) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(k) || typeof val !== "string" || val.length > 4000) return null;
    out[k] = val;
  }
  return out;
}

export const GITHUB_MCP_DEFAULT = "https://api.githubcopilot.com/mcp/";
export const GITHUB_MCP_ALL = "https://api.githubcopilot.com/mcp/x/all";

function server(v: unknown): McpServer | string {
  const s = v as Record<string, unknown>;
  if (!s || typeof s !== "object") return "A server entry is malformed.";
  const id = str(s.id, 64);
  const name = str(s.name, 40);
  if (!id) return "A server is missing its id.";
  if (!name || !MCP_NAME.test(name)) return "Server names use letters, numbers, dashes and underscores only.";
  const catalogId = typeof s.catalogId === "string" && MCP_NAME.test(s.catalogId) ? s.catalogId : undefined;
  const base = { id, name, ...(catalogId ? { catalogId } : {}), enabled: s.enabled !== false };
  if (s.transport === "http") {
    const url = str(s.url, 2000);
    if (!url || !/^https?:\/\//i.test(url)) return `"${name}" needs an http(s) URL.`;
    const headers = record(s.headers);
    if (!headers) return `"${name}" has invalid headers.`;
    // GitHub's default endpoint leaves out notifications and Actions; connectors added from the catalog move to the full one.
    const full = catalogId === "github" && url === GITHUB_MCP_DEFAULT ? GITHUB_MCP_ALL : url;
    return { ...base, transport: "http", url: full, headers };
  }
  const command = str(s.command, 500);
  if (!command) return `"${name}" needs a command.`;
  const args = s.args === undefined ? [] : s.args;
  if (!Array.isArray(args) || args.length > 60 || !args.every((a) => typeof a === "string" && a.length <= 1000))
    return `"${name}" has invalid arguments.`;
  const env = record(s.env);
  if (!env) return `"${name}" has invalid environment variables.`;
  return { ...base, transport: "stdio", command, args: args as string[], env };
}

// Settings arrive from the browser, so every field is checked and bounded; the result or a message for the person.
// One agent works at a time, chosen through the model in the composer, and the lead runs on it too.
export const activeAgent = (agents: Settings["agents"]): Runtime => (agents.codex.tasks && !agents.claude.tasks ? "codex" : "claude");

// Turning one agent on turns the other off, and the reverse, so undoing a change restores the first.
export function withAgent(agents: Settings["agents"], agent: Runtime, on: boolean): Settings["agents"] {
  const claude = agent === "claude" ? on : !on;
  return { claude: { ...agents.claude, tasks: claude }, codex: { ...agents.codex, tasks: !claude } };
}

export function sanitizeSettings(input: unknown, defaults: Settings): Settings | string {
  const raw = input as { agents?: Record<string, Record<string, unknown>>; mcpServers?: unknown };
  if (!raw || typeof raw !== "object") return "The settings were malformed.";
  const claude = raw.agents?.claude ?? {};
  const codex = raw.agents?.codex ?? {};
  const prov = providers((raw as { providers?: unknown }).providers ?? defaults.providers);
  if (typeof prov === "string") return prov;
  const codexTasks = typeof codex.tasks === "boolean" ? codex.tasks : defaults.agents.codex.tasks;
  const claudeTasks = (typeof claude.tasks === "boolean" ? claude.tasks : defaults.agents.claude.tasks) || !codexTasks;
  const out: Settings = {
    agents: {
      claude: {
        tasks: claudeTasks,
        provider: providerFor("claude", claude.provider, defaults.agents.claude.provider ?? DEFAULT_PROVIDER.claude),
        effort:
          claude.effort === "" || CLAUDE_EFFORTS.includes(claude.effort as Effort)
            ? (claude.effort as Effort | "")
            : defaults.agents.claude.effort,
        model: str(claude.model, 100) ?? defaults.agents.claude.model,
        // "" is a choice too: the lead uses the same model as the tasks.
        plannerModel: str(claude.plannerModel, 100) ?? defaults.agents.claude.plannerModel,
        permissionMode: PERMISSION_MODES.includes(claude.permissionMode as PermissionMode)
          ? (claude.permissionMode as PermissionMode)
          : defaults.agents.claude.permissionMode,
      },
      codex: {
        tasks: !claudeTasks,
        provider: providerFor("codex", codex.provider, defaults.agents.codex.provider ?? DEFAULT_PROVIDER.codex),
        // Codex lists its own levels per model, so any short lowercase word passes through.
        effort: typeof codex.effort === "string" && /^[a-z]{0,12}$/.test(codex.effort) ? codex.effort : defaults.agents.codex.effort,
        model: str(codex.model, 100) ?? defaults.agents.codex.model,
        sandbox: CODEX_SANDBOXES.includes(codex.sandbox as CodexSandbox) ? (codex.sandbox as CodexSandbox) : defaults.agents.codex.sandbox,
      },
    },
    providers: prov,
    mcpServers: [],
    tools: [],
    taskMinutes: TASK_MINUTES.includes((raw as { taskMinutes?: number }).taskMinutes as number)
      ? ((raw as { taskMinutes?: number }).taskMinutes as number)
      : (defaults.taskMinutes ?? 20),
    concurrency: CONCURRENCY.includes((raw as { concurrency?: number }).concurrency as number)
      ? ((raw as { concurrency?: number }).concurrency as number)
      : (defaults.concurrency ?? 3),
    teamTalk:
      typeof (raw as { teamTalk?: unknown }).teamTalk === "boolean"
        ? (raw as { teamTalk: boolean }).teamTalk
        : (defaults.teamTalk ?? false),
    worktrees:
      typeof (raw as { worktrees?: unknown }).worktrees === "boolean"
        ? (raw as { worktrees: boolean }).worktrees
        : (defaults.worktrees ?? true),
    watchPulls:
      typeof (raw as { watchPulls?: unknown }).watchPulls === "boolean"
        ? (raw as { watchPulls: boolean }).watchPulls
        : (defaults.watchPulls ?? true),
    checkUpdates:
      typeof (raw as { checkUpdates?: unknown }).checkUpdates === "boolean"
        ? (raw as { checkUpdates: boolean }).checkUpdates
        : (defaults.checkUpdates ?? true),
    commitStyle: sanitizeCommitStyle((raw as { commitStyle?: unknown }).commitStyle, defaults.commitStyle ?? DEFAULT_COMMIT_STYLE),
    ...((raw as { plannerMigrated?: unknown }).plannerMigrated === true || defaults.plannerMigrated ? { plannerMigrated: true } : {}),
    ...offered((raw as { toolsOffered?: unknown }).toolsOffered ?? defaults.toolsOffered),
  };
  const tools = sanitizeTools((raw as { tools?: unknown }).tools ?? defaults.tools);
  if (typeof tools === "string") return tools;
  out.tools = tools;
  const servers = raw.mcpServers === undefined ? defaults.mcpServers : raw.mcpServers;
  if (!Array.isArray(servers) || servers.length > MAX_SERVERS) return `Up to ${MAX_SERVERS} MCP servers are supported.`;
  const names = new Set<string>();
  for (const s of servers) {
    const parsed = server(s);
    if (typeof parsed === "string") return parsed;
    if (names.has(parsed.name.toLowerCase())) return `Two servers are named "${parsed.name}".`;
    names.add(parsed.name.toLowerCase());
    out.mcpServers.push(parsed);
  }
  return out;
}

const offered = (v: unknown) =>
  Array.isArray(v) ? { toolsOffered: v.filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x)).slice(0, 40) } : {};

// Stands in for a saved key, env value or header value, so the browser never receives the secret itself.
export const SECRET_MASK = "••••";

const maskValues = (rec: Record<string, string>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v && SECRET_MASK]));

// What the settings API sends: everything as stored, with every secret replaced by SECRET_MASK.
export function maskSettings(s: Settings): Settings {
  return {
    ...s,
    providers: Object.fromEntries(
      Object.entries(s.providers).map(([kind, cfg]) => [kind, cfg?.key ? { ...cfg, key: SECRET_MASK } : cfg]),
    ) as Settings["providers"],
    mcpServers: s.mcpServers.map((m) => ({
      ...m,
      ...(m.env ? { env: maskValues(m.env) } : {}),
      ...(m.headers ? { headers: maskValues(m.headers) } : {}),
    })),
  };
}

// Settings come back with the masks in place: a value still masked, or a provider key left out, keeps the stored one.
export function restoreSecrets(input: unknown, stored: Settings): { input: unknown } | string {
  if (!input || typeof input !== "object") return { input };
  const raw = input as { providers?: unknown; mcpServers?: unknown };
  const out: Record<string, unknown> = { ...raw };
  if (raw.providers && typeof raw.providers === "object" && !Array.isArray(raw.providers)) {
    out.providers = Object.fromEntries(
      Object.entries(raw.providers as Record<string, unknown>).map(([kind, cfg]) => {
        const c = cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>) : {};
        if (c.key !== undefined && c.key !== SECRET_MASK) return [kind, cfg];
        const { key: _masked, ...rest } = c;
        const kept = stored.providers[kind as ProviderKind]?.key;
        return [kind, kept ? { ...rest, key: kept } : rest];
      }),
    );
  }
  if (Array.isArray(raw.mcpServers)) {
    const before = new Map(stored.mcpServers.map((m) => [m.id, m]));
    const servers: unknown[] = [];
    for (const v of raw.mcpServers) {
      if (!v || typeof v !== "object") {
        servers.push(v);
        continue;
      }
      const s = v as Record<string, unknown>;
      const prev = typeof s.id === "string" ? before.get(s.id) : undefined;
      const next: Record<string, unknown> = { ...s };
      for (const field of ["env", "headers"] as const) {
        const rec = s[field];
        if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
        const entries: [string, unknown][] = [];
        for (const [k, val] of Object.entries(rec)) {
          const kept = val === SECRET_MASK ? prev?.[field]?.[k] : val;
          // A renamed or brand-new entry has no stored value to fall back on.
          if (kept === undefined) return `"${String(s.name)}": type the value of \`${k}\` again.`;
          entries.push([k, kept]);
        }
        next[field] = Object.fromEntries(entries);
      }
      servers.push(next);
    }
    out.mcpServers = servers;
  }
  return { input: out };
}

// Splits a command line the way a shell would for simple cases: spaces separate, quotes group.
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += ch;
      has = true;
    }
  }
  if (cur || has) out.push(cur);
  return out;
}
