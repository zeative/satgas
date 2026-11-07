import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { cardContent, cardLabel, cardMentions, parseTokens, type Refs } from "../shared/refs";
import type { Run } from "../shared/types";
import { copyAsset } from "./files";
import { getSettings, taskAgents } from "./settings";
import { enabledSkills } from "./skills";

// A workspace path the person typed after @, when it names something inside the workspace.
async function workspacePath(cwd: string, word: string): Promise<string | null> {
  const full = resolve(cwd, word);
  const rel = relative(cwd, full);
  if (!rel || rel.startsWith("..") || rel.startsWith(sep)) return null;
  return (await stat(full).catch(() => null)) ? rel.split(sep).join("/") : null;
}

const SRC = /^\/api\/runs\/([\w-]+)\/(assets|files)\/(.+)$/;
// A card's address can come from an agent, so a broken one must not fail the round.
const decoded = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// Pictures and pages on the board as files agents can open; one on the web keeps its address instead.
export async function mediaFiles(run: Run, ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const card = run.board?.cards.find((c) => c.id === id);
    if (card?.kind !== "image" && card?.kind !== "preview") continue;
    const [, owner, where, rest] = SRC.exec(card.src ?? "") ?? [];
    if (!owner || !rest) continue;
    const path =
      where === "assets"
        ? await copyAsset(owner, rest, card.title ?? "", run.cwd)
        : owner === run.id
          ? await workspacePath(run.cwd, decoded(rest))
          : null;
    if (path) out[id] = path;
  }
  return out;
}

// Looks up what a prompt's `/` and `@` tokens name; a token that names nothing stays plain words.
export async function resolveRefs(run: Run, text: string): Promise<Refs> {
  const { slash, at } = parseTokens(text);
  const agents = taskAgents();
  const skills = new Set(enabledSkills().map((s) => s.name));
  const refs: Refs = {};
  const add = <K extends "skills" | "files" | "cards" | "agents" | "connectors">(key: K, value: NonNullable<Refs[K]>[number]) => {
    const list = (refs[key] ?? []) as unknown[];
    if (!list.includes(value)) refs[key] = [...list, value] as Refs[K];
  };
  for (const name of slash) {
    if (name === "ask") refs.ask = true;
    else if ((name === "claude" || name === "codex") && agents.includes(name)) refs.only = name;
    else if (skills.has(name)) add("skills", name);
  }
  const servers = getSettings()
    .mcpServers.filter((s) => s.enabled)
    .map((s) => s.name);
  const cards = run.board?.cards ?? [];
  const mentions = cardMentions(cards);
  for (const word of at) {
    const lower = word.toLowerCase();
    if ((lower === "claude" || lower === "codex") && agents.includes(lower)) {
      add("agents", lower);
      continue;
    }
    const server = servers.find((s) => s.toLowerCase() === lower);
    if (server) {
      add("connectors", server);
      continue;
    }
    const card = cards.find((c) => mentions.get(c.id)?.toLowerCase() === lower);
    if (card) {
      add("cards", card.id);
      continue;
    }
    const path = await workspacePath(run.cwd, word);
    if (path) add("files", path);
  }
  return refs;
}

export const hasRefs = (r: Refs) => Object.values(r).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));

// What the tokens pointed at, in words the planner and the agents can act on.
export function describeRefs(run: Run, refs: Refs | undefined, cardChars = 4000): string {
  if (!refs) return "";
  const skills = enabledSkills();
  const cards = (refs.cards ?? []).map((id) => run.board?.cards.find((c) => c.id === id)).filter((c) => !!c);
  const content = (c: (typeof cards)[number]) =>
    refs.media?.[c.id] ? `In the working directory at ${refs.media[c.id]}; open it to see it.` : cardContent(c, cardChars);
  return [
    refs.only && `The user typed /${refs.only}: every task goes to ${refs.only === "claude" ? "Claude Code" : "Codex"}.`,
    refs.skills?.length &&
      `Skills the user picked for this request (use them where they apply):\n${refs.skills
        .map((n) => `- ${n}: ${skills.find((s) => s.name === n)?.description ?? ""}`)
        .join("\n")}`,
    refs.agents?.length &&
      `Agents the user mentioned (give each the part of the request that names it): ${refs.agents.map((a) => `@${a}`).join(", ")}`,
    refs.connectors?.length && `Connectors (MCP servers) the user wants used: ${refs.connectors.join(", ")}`,
    refs.files?.length && `Files in the working directory the user pointed at:\n${refs.files.map((f) => `- ${f}`).join("\n")}`,
    cards.length &&
      `Board cards the user pointed at:\n\n${cards.map((c) => `### ${cardLabel(c) || c.kind} (${c.kind})\n${content(c)}`).join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const SKIPPED = new Set([".git", "node_modules", "__pycache__", ".venv", "dist", "build", ".next"]);

// The workspace's files for the @ menu: hidden folders and dependency trees left out, capped so a huge repo stays quick.
export async function workspaceTree(cwd: string, max = 2000): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    if (depth > 6 || out.length >= max) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const e of entries) {
      if (out.length >= max) return;
      if (e.name.startsWith(".") || SKIPPED.has(e.name)) continue;
      const full = join(dir, e.name);
      const rel = relative(cwd, full).split(sep).join("/");
      if (e.isDirectory()) {
        out.push(`${rel}/`);
        await walk(full, depth + 1);
      } else if (e.isFile()) out.push(rel);
    }
  };
  await walk(cwd, 0);
  return out;
}
