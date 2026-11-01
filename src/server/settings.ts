import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type CodexSandbox, type PermissionMode, type Settings, sanitizeSettings } from "../shared/settings";
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
      codex: { tasks: true, provider: "codex", effort: "", model: config.codexModel ?? "", sandbox: config.codexSandbox as CodexSandbox },
    },
    providers: {},
    mcpServers: [],
  };
}

// Kept on globalThis so a `bun --hot` reload keeps what was loaded and the save queue it was in.
const g = globalThis as typeof globalThis & { __satgasSettings?: Settings; __satgasSettingsSaving?: Promise<unknown> };

export function getSettings(): Settings {
  return g.__satgasSettings ?? defaultSettings();
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
  return parsed;
}

// The agents a planner may assign; Claude always plans, so with no task agent left a mission cannot start.
export function taskAgents(): ("claude" | "codex")[] {
  const { claude, codex } = getSettings().agents;
  return [...(claude.tasks ? (["claude"] as const) : []), ...(codex.tasks ? (["codex"] as const) : [])];
}
