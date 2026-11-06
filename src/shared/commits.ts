// How commits are written, from Configurations → Settings: the line every agent gets, and the message Satgas writes itself
// when it commits a task's branch.

export type CommitMode = "repo" | "conventional" | "custom";

export interface CommitStyle {
  mode: CommitMode;
  // The person's own rules, used when mode is custom.
  instructions: string;
}

export const COMMIT_MODES: CommitMode[] = ["repo", "conventional", "custom"];
export const COMMIT_INSTRUCTIONS_MAX = 1000;
export const DEFAULT_COMMIT_STYLE: CommitStyle = { mode: "repo", instructions: "" };

// Work done through Satgas credits Satgas, whichever model or CLI wrote it.
export const COMMIT_TRAILER = "Co-Authored-By: Satgas Agent <noreply@satgas.id>";
export const PR_FOOTER = "Made with Satgas";

export function sanitizeCommitStyle(v: unknown, fallback: CommitStyle = DEFAULT_COMMIT_STYLE): CommitStyle {
  if (!v || typeof v !== "object") return fallback;
  const raw = v as Record<string, unknown>;
  return {
    mode: COMMIT_MODES.includes(raw.mode as CommitMode) ? (raw.mode as CommitMode) : fallback.mode,
    instructions: typeof raw.instructions === "string" ? raw.instructions.trim().slice(0, COMMIT_INSTRUCTIONS_MAX) : fallback.instructions,
  };
}

// The rule in every agent's working rules; it applies only when the agent commits at all.
export function commitRule(style: CommitStyle): string {
  const how =
    style.mode === "conventional"
      ? "use Conventional Commits: `type(scope): subject`, imperative, under 72 characters"
      : style.mode === "custom" && style.instructions
        ? `follow the person's rules: ${style.instructions}`
        : "match the style of the repository's recent commits (`git log --oneline -15`)";
  return `When you commit, ${how}. End every commit message with the line \`${COMMIT_TRAILER}\`, and every pull request description with \`${PR_FOOTER}\`. Never credit Claude, Codex, a model or another AI tool, and add no "Generated with" line.`;
}

const CONVENTIONAL = /^[a-z]+(\([^)]+\))?!?: \S/;

// A repository counts as conventional when most of its recent subjects are.
export const looksConventional = (subjects: string[]) =>
  subjects.length > 0 && subjects.filter((s) => CONVENTIONAL.test(s)).length * 2 >= subjects.length;

function typeOf(title: string): string {
  const t = title.toLowerCase();
  if (/\b(fix|bug|repair|broken|error|crash)/.test(t)) return "fix";
  if (/\b(test|spec)/.test(t)) return "test";
  if (/\b(doc|readme|guide)/.test(t)) return "docs";
  if (/\b(refactor|clean|rename|simplif)/.test(t)) return "refactor";
  return "feat";
}

// The subject Satgas writes for a task's leftover changes; custom rules need judgement, so they fall back to the title.
export function commitMessage(style: CommitStyle, title: string, recent: string[] = []): string {
  const subject = title.replace(/\s+/g, " ").trim().slice(0, 68) || "Task changes";
  const conventional = style.mode === "conventional" || (style.mode === "repo" && looksConventional(recent));
  return conventional ? `${typeOf(subject)}: ${subject.charAt(0).toLowerCase()}${subject.slice(1)}` : subject;
}
