import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { COMMIT_TRAILER, PR_FOOTER } from "../../shared/commits";
import { resolveTool, TOOL_CATALOG, type Tool, type ToolWhen } from "../../shared/tools";
import { config } from "../config";
import { getSettings } from "../settings";

// Tools that are on and can run here: a missing program leaves its tool off instead of failing every call.
export function activeTools(): Tool[] {
  return getSettings()
    .tools.map(resolveTool)
    .filter((t): t is Tool => !!t && t.enabled && (!t.needs || !!Bun.which(t.needs)));
}

// In the compiled binary the hook is a subcommand of Satgas itself; from source it is its own script.
const compiled = import.meta.dir.includes("$bunfs") || import.meta.dir.includes("~BUN");
const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
// "see" is not a tool from Integrations: it stands between a model that cannot see and the pictures it opens.
export type HookEvent = Exclude<ToolWhen, "available"> | "see";
export function hookCommand(event: HookEvent): string {
  return compiled
    ? `${quote(process.execPath)} hook ${event}`
    : `${quote(process.execPath)} ${quote(join(import.meta.dir, "hook.ts"))} ${event}`;
}

// Hook timeouts in seconds, a little above the hook's own limit per tool.
const TIMEOUT = { command: 30, edit: 90, finish: 300, see: 180 } as const;
// Claude Code names edits per tool; Codex reports apply_patch and accepts Write and Edit as aliases.
const EDITS = "Write|Edit|MultiEdit|NotebookEdit|apply_patch";

export interface ToolHooks {
  // Hook events by name, in the shape both Claude Code (--settings) and Codex (-c hooks.…) read.
  hooks: Record<string, { matcher?: string; hooks: { type: "command"; command: string; timeout: number }[] }[]>;
  env: Record<string, string>;
  dir: string;
  // Claude Code's --settings file, written where only this user can read it.
  settingsPath: string;
}

// The hooks for one worker run, or null when no tool needs one. The run removes `dir` when it ends.
// Claude Code's own co-author and pull request lines, which would otherwise name Claude.
export const ATTRIBUTION = { commit: COMMIT_TRAILER, pr: PR_FOOTER };

// sight: the model cannot see images, so on Claude Code the pictures it opens or a connector returns go to a reader
// through the task's team connector. Codex has no such hook point; its image tool is switched off instead.
export async function prepareToolHooks(agent: "claude" | "codex", sight?: { url: string; token: string }): Promise<ToolHooks | null> {
  const tools = activeTools().filter((t) => t.when !== "available");
  const see = agent === "claude" && !!sight;
  if (!tools.length && !see) return null;
  const has = (when: ToolWhen) => tools.some((t) => t.when === when);
  const entry = (event: HookEvent) => [{ type: "command" as const, command: hookCommand(event), timeout: TIMEOUT[event] }];
  const hooks: ToolHooks["hooks"] = {};
  const add = (event: string, group: ToolHooks["hooks"][string][number]) => {
    hooks[event] = [...(hooks[event] ?? []), group];
  };
  if (has("command")) add("PreToolUse", { matcher: "Bash", hooks: entry("command") });
  // The finish check needs to know whether files changed, so edits are watched whenever it is on.
  if (has("edit") || has("finish")) add("PostToolUse", { matcher: EDITS, hooks: entry("edit") });
  if (has("finish")) add("Stop", { hooks: entry("finish") });
  if (see) {
    add("PreToolUse", { matcher: "Read", hooks: entry("see") });
    add("PostToolUse", { matcher: "mcp__.*", hooks: entry("see") });
  }
  const dir = await mkdtemp(join(tmpdir(), "satgas-tools-"));
  const settingsPath = join(dir, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ hooks, attribution: ATTRIBUTION }), { mode: 0o600 });
  return {
    hooks,
    dir,
    settingsPath,
    env: {
      SATGAS_AGENT: agent,
      SATGAS_TOOLS: JSON.stringify(tools),
      SATGAS_TOOLS_STATE: join(dir, "state"),
      SATGAS_HOME: homedir(),
      ...(see && sight ? { SATGAS_TEAM_URL: sight.url, SATGAS_TEAM_TOKEN: sight.token } : {}),
    },
  };
}

export const removeToolHooks = (h: ToolHooks | null) => (h ? rm(h.dir, { recursive: true, force: true }) : Promise.resolve());

// Codex takes hooks as config overrides; inline TOML tables, with JSON strings as TOML strings.
export function codexHookArgs(h: ToolHooks | null): string[] {
  if (!h) return [];
  const toml = (v: unknown): string =>
    Array.isArray(v)
      ? `[${v.map(toml).join(", ")}]`
      : v && typeof v === "object"
        ? `{ ${Object.entries(v)
            .map(([k, x]) => `${k} = ${toml(x)}`)
            .join(", ")} }`
        : JSON.stringify(v);
  // Satgas writes these hooks itself, so Codex's review of unknown hooks does not apply to them.
  return [
    "--dangerously-bypass-hook-trust",
    "-c",
    "features.hooks=true",
    ...Object.entries(h.hooks).flatMap(([event, groups]) => ["-c", `hooks.${event}=${toml(groups)}`]),
  ];
}

// For <satgas_system>: what runs around the agent's work, so a rewritten command or a block never surprises it.
export function describeTools(): string | null {
  const tools = activeTools();
  if (!tools.length) return null;
  const known = new Map(TOOL_CATALOG.map((d) => [d.id, d]));
  const lines = tools.map((t) => {
    const def = t.catalogId ? known.get(t.catalogId) : undefined;
    if (t.when === "available") return `- ${t.note || `${t.name} (\`${t.needs}\`) is installed for you to use.`}`;
    if (def?.id === "rtk")
      return "- RTK rewrites your shell commands to compact versions (git, tests, ls, grep), so their output is shorter than usual; that is expected.";
    if (def?.id === "guard")
      return "- The command guard blocks commands that destroy work (deleting outside the project, force pushes, hard resets, dropping tables, sudo). When it blocks one, use a safer way or name it in your report.";
    if (def?.id === "format") return "- Files you edit are formatted with the project's formatter right after; do not reformat by hand.";
    if (def?.id === "check") return "- Before you finish, the project's typecheck runs; if it fails you get the errors and keep working.";
    const when = { command: "before every shell command", edit: "after every file edit", finish: "before you finish" }[t.when];
    return `- ${t.name} runs ${when}${t.note ? `: ${t.note}` : ""}.`;
  });
  return `Tools Satgas runs around your work (Integrations → Tools):\n${lines.join("\n")}`;
}

export interface ToolStatus {
  // Each program a tool needs: its version, "installed" when it prints none, or null when it is missing.
  programs: Record<string, string | null>;
  // Nobody can install a program inside the image, so a missing one comes with a newer image instead.
  container: boolean;
  // RTK's own count across this machine, when it is installed.
  rtk?: { saved: number; pct: number; commands: number };
}

async function output(cmd: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const timer = setTimeout(() => proc.kill(), 3000);
    const out = await new Response(proc.stdout).text();
    clearTimeout(timer);
    return (await proc.exited) === 0 ? out : null;
  } catch {
    return null;
  }
}

const hot = globalThis as typeof globalThis & { __satgasToolStatus?: { at: number; key: string; status: Promise<ToolStatus> } };

// Checked at most once a minute per set of programs, unless the page asks again.
export function toolStatus(refresh = false): Promise<ToolStatus> {
  const needs = new Set(TOOL_CATALOG.flatMap((d) => (d.needs ? [d.needs] : [])));
  for (const t of getSettings().tools) if (t.needs) needs.add(t.needs);
  const key = [...needs].sort().join(" ");
  const cached = hot.__satgasToolStatus;
  if (!refresh && cached && cached.key === key && Date.now() - cached.at < 60_000) return cached.status;
  const status = (async (): Promise<ToolStatus> => {
    const programs: Record<string, string | null> = {};
    await Promise.all(
      [...needs].map(async (bin) => {
        if (!Bun.which(bin)) {
          programs[bin] = null;
          return;
        }
        const out = (await output([bin, "--version"])) ?? "";
        programs[bin] = out.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? "installed";
      }),
    );
    const container = config.container;
    if (!programs.rtk) return { programs, container };
    try {
      const s = JSON.parse((await output(["rtk", "gain", "--format", "json"])) ?? "{}").summary;
      if (typeof s?.total_saved === "number")
        return {
          programs,
          container,
          rtk: { saved: s.total_saved, pct: Math.round(s.avg_savings_pct ?? 0), commands: s.total_commands ?? 0 },
        };
    } catch {}
    return { programs, container };
  })();
  hot.__satgasToolStatus = { at: Date.now(), key, status };
  return status;
}
