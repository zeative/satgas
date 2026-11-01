import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "./config";

// Claude Code takes family aliases (opus, sonnet, …) and resolves them to the newest model itself.
// To show "Claude Opus 5.5" instead of "Claude Opus", names come from what the CLI actually ran (learned from
// each task's init event), then from the model ids in the CLI's own config cache.

export const CLAUDE_FAMILIES = ["opus", "sonnet", "fable", "haiku"] as const;
export type ClaudeFamily = (typeof CLAUDE_FAMILIES)[number];

const learnedFile = () => join(config.dataDir, "claude-models.json");
const g = globalThis as typeof globalThis & { __satgasClaudeModels?: Record<string, string> };

// "claude-opus-5-5" → { family: "opus", version: "5.5" }; date-stamped ids like claude-haiku-4-5-20251001 keep 4.5.
export function parseClaudeId(id: string): { family: ClaudeFamily; major: number; minor: number } | null {
  const m = /^claude-(opus|sonnet|fable|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/.exec(id.trim());
  if (!m) return null;
  return { family: m[1] as ClaudeFamily, major: Number(m[2]), minor: m[3] ? Number(m[3]) : 0 };
}

export function prettyClaude(id: string): string | null {
  const p = parseClaudeId(id);
  if (!p) return null;
  return `Claude ${p.family[0]?.toUpperCase()}${p.family.slice(1)} ${p.minor ? `${p.major}.${p.minor}` : p.major}`;
}

async function learned(): Promise<Record<string, string>> {
  if (g.__satgasClaudeModels) return g.__satgasClaudeModels;
  g.__satgasClaudeModels = await Bun.file(learnedFile())
    .json()
    .catch(() => ({}));
  return g.__satgasClaudeModels ?? {};
}

// Called when a task reports the model an alias ran on; best effort, never blocks a task.
export async function learnClaudeModel(alias: string, resolved: string) {
  if (!CLAUDE_FAMILIES.includes(alias as ClaudeFamily) || !parseClaudeId(resolved)) return;
  const map = await learned();
  if (map[alias] === resolved) return;
  map[alias] = resolved;
  await Bun.write(learnedFile(), JSON.stringify(map, null, 2)).catch(() => {});
}

// The newest id per family among those the CLI's own cache mentions.
async function fromCliCache(): Promise<Record<string, string>> {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? homedir();
  const text = await Bun.file(join(dir, ".claude.json"))
    .text()
    .catch(() => "");
  const best: Record<string, { id: string; score: number }> = {};
  // The minor version must not be the first digits of a date: claude-sonnet-4-20250514 is 4, not 4.20.
  for (const [id] of text.matchAll(/claude-(?:opus|sonnet|fable|haiku)-\d+(?:-\d{1,2}(?!\d))?(?:-\d{8})?/g)) {
    const p = parseClaudeId(id);
    if (!p) continue;
    const score = p.major * 100 + p.minor;
    if (!best[p.family] || score > (best[p.family]?.score ?? 0)) best[p.family] = { id, score };
  }
  return Object.fromEntries(Object.entries(best).map(([f, v]) => [f, v.id]));
}

// alias → real model id, learned runs first.
export async function claudeAliasIds(): Promise<Record<string, string>> {
  return { ...(await fromCliCache()), ...(await learned()) };
}
