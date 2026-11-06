// What Satgas remembers across boards, on one Memory page with two kinds of entry:
// - memory: facts about the person and their world (who they are, what they prefer, their projects, where things live),
//   used by the lead to make plans and answers personal;
// - rule: do and don't (an SOP), followed by every agent in every task.
// The lead writes both on its own from what the person says (a correction becomes a rule), and the person can add,
// edit, switch off or delete any entry.

export type MemoryType = "about" | "preference" | "project" | "reference";
export const MEMORY_TYPES: MemoryType[] = ["about", "preference", "project", "reference"];

export interface MemoryEntry {
  id: string;
  kind: "memory" | "rule";
  // memory only.
  type?: MemoryType;
  text: string;
  // Why it holds: the person's reason, or what they said that led to it.
  why?: string;
  // rule only: the rule applies only to boards whose folder sits inside this path; absent for every board.
  scope?: string;
  enabled: boolean;
  source: { by: "lead" | "person"; boardId?: string; round?: number };
  createdAt: number;
  updatedAt: number;
}

export interface MemoryStore {
  entries: MemoryEntry[];
  // The lead saves memories and rules on its own; off, only the person adds them.
  auto: boolean;
}

// What the lead may do, from its plan.
export type MemoryCommand =
  | { op: "remember"; type: MemoryType; text: string; why?: string; replaces?: string }
  | { op: "rule"; text: string; why?: string; scope?: string; replaces?: string }
  | { op: "forget"; id: string };

// What one round changed, with the way back.
export interface MemoryRecord {
  changes: { op: "added" | "updated" | "removed"; id: string; kind: MemoryEntry["kind"]; text: string; before?: MemoryEntry }[];
  undone?: boolean;
}

export const MEMORY_TEXT_MAX = 300;
export const MEMORY_WHY_MAX = 300;
export const MEMORY_MAX = 200;
export const MEMORY_PER_ROUND = 5;
// How much of the memory goes into a prompt, so it never crowds out the work.
export const LEAD_MEMORY_CHARS = 6000;
export const TASK_MEMORY_CHARS = 2000;

const one = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Keys, tokens and passwords never become memories, whoever tries to save them.
export function looksSecret(text: string): boolean {
  return (
    /\b(sk|pk|rk)[-_](live|test|proj)?[-_]?[A-Za-z0-9]{16,}/.test(text) ||
    /\b(ghp|gho|ghs|github_pat|glpat|xox[abpr])[-_][A-Za-z0-9_]{16,}/.test(text) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(text) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) ||
    /\b(password|passwd|token|secret|api[-_ ]?key)\s*[:=]\s*\S{6,}/i.test(text) ||
    /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/.test(text)
  );
}

// An entry from the page or the lead, checked and bounded; a string says what is wrong.
export function cleanEntry(raw: unknown, base: Pick<MemoryEntry, "id" | "source" | "createdAt">, now = Date.now()): MemoryEntry | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = r.kind === "rule" ? "rule" : r.kind === "memory" ? "memory" : null;
  if (!kind) return "Say whether it is a memory or a rule.";
  const text = one(r.text, MEMORY_TEXT_MAX);
  if (!text) return "Write what to remember.";
  if (looksSecret(text) || looksSecret(one(r.why, MEMORY_WHY_MAX))) return "Keys, tokens and passwords are never kept in memory.";
  const why = one(r.why, MEMORY_WHY_MAX);
  const scope = kind === "rule" ? one(r.scope, 500) : "";
  const type = kind === "memory" ? (MEMORY_TYPES.includes(r.type as MemoryType) ? (r.type as MemoryType) : "about") : undefined;
  return {
    id: base.id,
    kind,
    ...(type ? { type } : {}),
    text,
    ...(why ? { why } : {}),
    ...(scope ? { scope } : {}),
    enabled: r.enabled !== false,
    source: base.source,
    createdAt: base.createdAt,
    updatedAt: now,
  };
}

// The lead's commands as it wrote them, cut to what is well formed; checked again when applied.
export function cleanCommands(raw: unknown): MemoryCommand[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryCommand[] = [];
  for (const c of raw.slice(0, MEMORY_PER_ROUND) as Record<string, unknown>[]) {
    if (!c || typeof c !== "object") continue;
    const text = one(c.text, MEMORY_TEXT_MAX);
    const why = one(c.why, MEMORY_WHY_MAX) || undefined;
    const replaces = one(c.replaces, 40) || undefined;
    if (c.op === "forget" && one(c.id, 40)) out.push({ op: "forget", id: one(c.id, 40) });
    else if (c.op === "remember" && text)
      out.push({
        op: "remember",
        type: MEMORY_TYPES.includes(c.type as MemoryType) ? (c.type as MemoryType) : "about",
        text,
        why,
        replaces,
      });
    else if (c.op === "rule" && text) out.push({ op: "rule", text, why, scope: one(c.scope, 500) || undefined, replaces });
  }
  return out;
}

const inside = (cwd: string, scope?: string) => !scope || cwd === scope || cwd.startsWith(scope.endsWith("/") ? scope : `${scope}/`);

// The rules that apply to a board in this folder, switched on.
export const rulesFor = (entries: MemoryEntry[], cwd: string) =>
  entries.filter((e) => e.kind === "rule" && e.enabled && inside(cwd, e.scope));

const fit = (lines: string[], max: number) => {
  const out: string[] = [];
  let used = 0;
  for (const l of lines) {
    if (used + l.length + 1 > max) break;
    out.push(l);
    used += l.length + 1;
  }
  return out.join("\n");
};

const TYPE_WORD: Record<MemoryType, string> = { about: "about", preference: "prefers", project: "project", reference: "reference" };

// For the lead: every entry with its id, so it can update or forget one instead of saving a second copy.
export function describeForLead(entries: MemoryEntry[], cwd: string): string {
  const on = entries.filter((e) => e.enabled);
  const memories = on.filter((e) => e.kind === "memory").map((e) => `- [${e.id}] (${TYPE_WORD[e.type ?? "about"]}) ${e.text}`);
  const rules = rulesFor(on, cwd).map((e) => `- [${e.id}] ${e.text}${e.why ? ` (why: ${e.why})` : ""}`);
  return [
    `What you remember about the person:\n${memories.length ? fit(memories, LEAD_MEMORY_CHARS / 2) : "- nothing yet"}`,
    `The person's rules, which you and every task follow:\n${rules.length ? fit(rules, LEAD_MEMORY_CHARS / 2) : "- none yet"}`,
  ].join("\n\n");
}

// Whether the lead's memory holds anything, since describeForLead always says something.
export const hasMemoryFor = (entries: MemoryEntry[], cwd: string) => {
  const on = entries.filter((e) => e.enabled);
  return on.some((e) => e.kind === "memory") || rulesFor(on, cwd).length > 0;
};

// For tasks: the rules in full, and what about the person shapes the work (who they are and what they prefer).
export function describeForTasks(entries: MemoryEntry[], cwd: string): { rules: string; person: string } {
  const on = entries.filter((e) => e.enabled);
  const rules = fit(
    rulesFor(on, cwd).map((e) => `- ${e.text}${e.why ? ` (why: ${e.why})` : ""}`),
    TASK_MEMORY_CHARS,
  );
  const person = fit(
    on.filter((e) => e.kind === "memory" && (e.type === "about" || e.type === "preference")).map((e) => `- ${e.text}`),
    TASK_MEMORY_CHARS / 2,
  );
  return { rules, person };
}
