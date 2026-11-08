import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_COMMIT_STYLE } from "../shared/commits";
import { type CodexSandbox, type PermissionMode, type Settings, sanitizeSettings } from "../shared/settings";
import { DEFAULT_TOOLS } from "../shared/tools";
import { config } from "./config";

const file = () => join(config.dataDir, "settings.json");

// Environment variables stay the defaults, so existing setups keep working until someone changes a setting.
export function defaultSettings(): Settings {
  return {
    agents: {
      claude: {
        tasks: true,
        provider: "claude",
        effort: "",
        model: config.claudeModel ?? "",
        plannerModel: config.plannerModel,
        permissionMode:
          config.claudePermissionMode === "bypassPermissions" ? "bypassPermissions" : ("acceptEdits" satisfies PermissionMode),
      },
      codex: { tasks: false, provider: "codex", effort: "", model: config.codexModel ?? "", sandbox: config.codexSandbox as CodexSandbox },
    },
    providers: {},
    mcpServers: [],
    tools: DEFAULT_TOOLS,
    taskMinutes: 20,
    concurrency: 3,
    teamTalk: false,
    worktrees: true,
    commitStyle: DEFAULT_COMMIT_STYLE,
    watchPulls: true,
    checkUpdates: true,
    // A fresh setup never had the old planner default to move, and already has every default tool.
    plannerMigrated: true,
    toolsOffered: DEFAULT_TOOLS.map((t) => t.id),
  };
}

// Kept on globalThis so a `bun --hot` reload keeps what was loaded and the save queue it was in.
const g = globalThis as typeof globalThis & { __satgasSettings?: Settings; __satgasSettingsSaving?: Promise<unknown> };

export function getSettings(): Settings {
  const s = g.__satgasSettings;
  if (!s) return defaultSettings();
  // Settings a hot reload kept from before Tools existed get the default tools, as a fresh load would give them.
  s.tools ??= DEFAULT_TOOLS;
  s.taskMinutes ??= 20;
  s.concurrency ??= 3;
  s.teamTalk ??= false;
  s.worktrees ??= true;
  s.commitStyle ??= DEFAULT_COMMIT_STYLE;
  s.watchPulls ??= true;
  s.checkUpdates ??= true;
  // "sonnet" was the forced default before the lead could share the composer's model; it now follows the composer.
  // A default tool added in a later version joins existing setups once; turning it off or removing it afterwards sticks.
  const fresh = DEFAULT_TOOLS.filter((d) => !s.toolsOffered?.includes(d.id));
  if (fresh.length) {
    for (const d of fresh) if (!s.tools.some((t) => t.catalogId === d.catalogId)) s.tools = [...s.tools, d];
    s.toolsOffered = DEFAULT_TOOLS.map((t) => t.id);
  }
  if (!s.plannerMigrated) {
    if (s.agents.claude.plannerModel === "sonnet") s.agents.claude.plannerModel = "";
    s.plannerMigrated = true;
  }
  return s;
}

// Read once per process; a hot reload keeps the settings already in memory.
export async function loadSettings() {
  if (g.__satgasSettings) return;
  const f = Bun.file(file());
  if (!(await f.exists())) {
    g.__satgasSettings = defaultSettings();
    return;
  }
  try {
    const parsed = sanitizeSettings(await f.json(), defaultSettings());
    if (typeof parsed === "string") throw new Error(parsed);
    g.__satgasSettings = parsed;
  } catch (e) {
    // Set aside, never overwritten: the next save would replace every saved key with the defaults.
    const bad = `${file()}.bad`;
    await rename(file(), bad).catch(() => {});
    console.error(`Could not read ${file()} (${(e as Error).message}); moved it to ${bad} and started from the defaults.`);
    g.__satgasSettings = defaultSettings();
  }
}

// Told after every save, so pages that are open show the change, whoever made it (a page, a channel, the lead).
const hotListeners = g as { __satgasSettingsListeners?: Set<() => void> };
hotListeners.__satgasSettingsListeners ??= new Set();
const listeners = hotListeners.__satgasSettingsListeners;
export function onSettingsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Saves run one at a time, each against the settings the previous one left, so two edits never undo each other.
export function saveSettings(input: unknown): Promise<Settings | string> {
  const next = (g.__satgasSettingsSaving ?? Promise.resolve()).then(() => write(input));
  g.__satgasSettingsSaving = next.catch(() => {});
  return next;
}

async function write(input: unknown): Promise<Settings | string> {
  const parsed = sanitizeSettings(input, getSettings());
  if (typeof parsed === "string") return parsed;
  // Keys and MCP secrets live here, so the folder and file are private to this user.
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  // Written to a temp file first, so a crash mid-write never leaves half a settings file.
  const tmp = `${file()}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(parsed, null, 2), { mode: 0o600 });
    await rename(tmp, file());
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  g.__satgasSettings = parsed;
  for (const fn of listeners) fn();
  return parsed;
}

// The agents a planner may assign; Claude always plans, so with no task agent left a mission cannot start.
export function taskAgents(): ("claude" | "codex")[] {
  const { claude, codex } = getSettings().agents;
  return [...(claude.tasks ? (["claude"] as const) : []), ...(codex.tasks ? (["codex"] as const) : [])];
}
