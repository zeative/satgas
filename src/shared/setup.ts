// Setup the lead changes from a person's message: connectors, skills, tools and agents. Known things (catalog
// connectors, built-in tools, switches) apply at once and can be undone; anything that would run code from outside
// Satgas waits for the person's Allow in the chat. Keys never travel here: a connector that needs one asks in the chat.
import { byId, catalogOf, toServer } from "./catalog";
import type { Settings } from "./settings";
import { TOOL_WHENS, type ToolWhen, toolDef } from "./tools";
import type { AgentKind } from "./types";

export type SetupCommand =
  | { op: "connect"; id: string }
  | { op: "connector"; name: string; on: boolean }
  | { op: "custom-connector"; name: string; command?: string; args?: string[]; url?: string }
  | { op: "skill"; name: string; on: boolean }
  | { op: "install-skills"; repo: string; skills?: string[] }
  | { op: "tool"; id: string; on: boolean }
  | { op: "custom-tool"; name: string; when: ToolWhen; command?: string; needs?: string; note?: string }
  | { op: "agent"; agent: AgentKind; tasks?: boolean; model?: string }
  // Undo only: switches off a tool the lead added, by its stored id, and removes skills an Allow installed.
  | { op: "tool-off"; toolId: string }
  | { op: "skill-delete"; name: string };

export const MAX_SETUP = 12;

// What Satgas does not ship and the person has not seen: it runs only after their Allow.
export const needsApproval = (c: SetupCommand) => c.op === "custom-connector" || c.op === "install-skills" || c.op === "custom-tool";

const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const NAME = /^[A-Za-z0-9_-]{1,40}$/;
const REPO = /^(?:https:\/\/github\.com\/)?[\w.-]+\/[\w.-]+(?:\/tree\/[^\s]+)?\/?$/;

// Commands arrive from a model, so each is checked and bounded; what cannot be used is reported back, not guessed.
export function cleanSetup(raw: unknown): { commands: SetupCommand[]; skipped: string[] } {
  const commands: SetupCommand[] = [];
  const skipped: string[] = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_SETUP) : []) {
    const c = (item ?? {}) as Record<string, unknown>;
    const on = typeof c.on === "boolean" ? c.on : null;
    const name = str(c.name, 64);
    const id = str(c.id, 64);
    if (c.op === "connect" && id && byId.has(id)) commands.push({ op: "connect", id });
    else if (c.op === "connector" && name && on !== null) commands.push({ op: "connector", name, on });
    else if (c.op === "custom-connector" && name && NAME.test(name) && (str(c.url, 2000) || str(c.command, 500))) {
      const url = str(c.url, 2000);
      const args = Array.isArray(c.args) ? c.args.filter((a): a is string => typeof a === "string").slice(0, 40) : [];
      if (url && !/^https:\/\//i.test(url)) skipped.push(`custom-connector ${name}: the URL must be https`);
      else
        commands.push(
          url ? { op: "custom-connector", name, url } : { op: "custom-connector", name, command: str(c.command, 500) ?? "", args },
        );
    } else if (c.op === "skill" && name && on !== null) commands.push({ op: "skill", name, on });
    else if (c.op === "install-skills" && str(c.repo, 300) && REPO.test(String(c.repo).trim())) {
      const skills = Array.isArray(c.skills) ? c.skills.filter((s): s is string => typeof s === "string").slice(0, 40) : undefined;
      commands.push({ op: "install-skills", repo: String(c.repo).trim(), ...(skills?.length ? { skills } : {}) });
    } else if (c.op === "tool" && id && toolDef.has(id) && on !== null) commands.push({ op: "tool", id, on });
    else if (c.op === "custom-tool" && name && TOOL_WHENS.includes(c.when as ToolWhen)) {
      commands.push({
        op: "custom-tool",
        name: name.slice(0, 40),
        when: c.when as ToolWhen,
        ...(str(c.command, 2000) ? { command: str(c.command, 2000) as string } : {}),
        ...(str(c.needs, 60) ? { needs: str(c.needs, 60) as string } : {}),
        ...(str(c.note, 500) ? { note: str(c.note, 500) as string } : {}),
      });
    } else if (c.op === "agent" && (c.agent === "claude" || c.agent === "codex") && (typeof c.tasks === "boolean" || str(c.model, 100)))
      commands.push({
        op: "agent",
        agent: c.agent,
        ...(typeof c.tasks === "boolean" ? { tasks: c.tasks } : {}),
        ...(str(c.model, 100) ? { model: str(c.model, 100) as string } : {}),
      });
    else skipped.push(`${String(c.op ?? "?")}: not a setup change Satgas can make (${JSON.stringify(item).slice(0, 120)})`);
  }
  return { commands, skipped };
}

export interface Applied {
  settings: Settings;
  // What puts it back, for Undo.
  undo: SetupCommand[];
  // A catalog connector that needs a key the person types in the chat; nothing was added yet.
  needsKey?: string;
}

// One settings change, on settings only (skills live elsewhere): the new settings and how to undo it, or why not.
export function applyToSettings(s: Settings, c: SetupCommand, newId: () => string): Applied | string {
  if (c.op === "connect") {
    const item = byId.get(c.id);
    if (!item) return `There is no ${c.id} connector in the catalog`;
    const have = s.mcpServers.find((m) => catalogOf(m)?.id === item.id);
    if (have)
      return have.enabled ? `${item.name} is already connected` : applyToSettings(s, { op: "connector", name: have.name, on: true }, newId);
    if (item.secrets?.some((x) => !x.optional)) return { settings: s, undo: [], needsKey: item.id };
    const server = toServer(item, {}, newId(), s.mcpServers);
    return { settings: { ...s, mcpServers: [...s.mcpServers, server] }, undo: [{ op: "connector", name: server.name, on: false }] };
  }
  if (c.op === "connector") {
    const m = s.mcpServers.find((x) => x.name === c.name || catalogOf(x)?.id === c.name);
    if (!m) return `No connector named ${c.name} is set up`;
    if (m.enabled === c.on) return `${m.name} is already ${c.on ? "on" : "off"}`;
    return {
      settings: { ...s, mcpServers: s.mcpServers.map((x) => (x === m ? { ...x, enabled: c.on } : x)) },
      undo: [{ op: "connector", name: m.name, on: !c.on }],
    };
  }
  if (c.op === "custom-connector") {
    if (s.mcpServers.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) return `A connector named ${c.name} already exists`;
    const base = { id: newId(), name: c.name, enabled: true };
    const server = c.url
      ? { ...base, transport: "http" as const, url: c.url, headers: {} }
      : { ...base, transport: "stdio" as const, command: c.command ?? "", args: c.args ?? [], env: {} };
    return { settings: { ...s, mcpServers: [...s.mcpServers, server] }, undo: [{ op: "connector", name: c.name, on: false }] };
  }
  if (c.op === "tool") {
    const def = toolDef.get(c.id);
    if (!def) return `There is no ${c.id} tool`;
    const stored = s.tools.find((x) => x.catalogId === def.id);
    if ((stored?.enabled ?? false) === c.on) return `${def.name} is already ${c.on ? "on" : "off"}`;
    const tools = stored
      ? s.tools.map((x) => (x === stored ? { ...x, enabled: c.on } : x))
      : [...s.tools, { id: newId(), catalogId: def.id, enabled: c.on }];
    return { settings: { ...s, tools }, undo: [{ op: "tool", id: def.id, on: !c.on }] };
  }
  if (c.op === "custom-tool") {
    if (s.tools.some((x) => x.name?.toLowerCase() === c.name.toLowerCase())) return `A tool named ${c.name} already exists`;
    const tool = {
      id: newId(),
      enabled: true,
      name: c.name,
      when: c.when,
      ...(c.command ? { command: c.command } : {}),
      ...(c.needs ? { needs: c.needs } : {}),
      ...(c.note ? { note: c.note } : {}),
    };
    // Turning it off is the undo: the person sees what it was and can remove it in Integrations.
    return { settings: { ...s, tools: [...s.tools, tool] }, undo: [{ op: "tool-off", toolId: tool.id }] };
  }
  if (c.op === "agent") {
    const before = s.agents[c.agent];
    const undo: SetupCommand = {
      op: "agent",
      agent: c.agent,
      ...(c.tasks !== undefined ? { tasks: before.tasks } : {}),
      ...(c.model !== undefined ? { model: before.model } : {}),
    };
    if ((c.tasks === undefined || c.tasks === before.tasks) && (c.model === undefined || c.model === before.model))
      return "Nothing to change on that agent";
    const next = { ...before, ...(c.tasks !== undefined ? { tasks: c.tasks } : {}), ...(c.model !== undefined ? { model: c.model } : {}) };
    return { settings: { ...s, agents: { ...s.agents, [c.agent]: next } }, undo: [undo] };
  }
  if (c.op === "tool-off") {
    const stored = s.tools.find((x) => x.id === c.toolId);
    if (!stored?.enabled) return "That tool is already off";
    return { settings: { ...s, tools: s.tools.map((x) => (x === stored ? { ...x, enabled: false } : x)) }, undo: [] };
  }
  return "Skills are changed by the server, not in settings";
}

export interface PendingSetup {
  cmd: SetupCommand;
  state: "waiting" | "allowed" | "skipped" | "failed";
  // What it did once allowed (the skills installed), or why it could not.
  note?: string;
}

// What the lead changed in one round, shown as one line in the chat with Undo and the Allow buttons.
export interface SetupRecord {
  applied: SetupCommand[];
  undo: SetupCommand[];
  undone?: boolean;
  pending: PendingSetup[];
  // Catalog connectors that wait for a key the person types in the chat.
  keys: string[];
  // Commands that could not apply, in words, for the log and the lead.
  failed: string[];
}
