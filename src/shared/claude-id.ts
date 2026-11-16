// Claude model ids as the CLI and its config write them, read the same way on the server and in the page.

export const CLAUDE_FAMILIES = ["opus", "sonnet", "fable", "haiku"] as const;
export type ClaudeFamily = (typeof CLAUDE_FAMILIES)[number];

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

// A model's name as short as a label can carry it: "Haiku 5.5" for a Claude id, the id itself for anything else.
export function shortModel(id: string): string {
  return prettyClaude(id)?.replace(/^Claude /, "") ?? id;
}
