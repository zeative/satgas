// Why a task failed, read from the error an agent CLI left: a problem of the system around the work (the provider, the
// key, the network, the CLI) or of the work itself. Satgas retries the first kind once and the lead reports both.
import type { AgentKind } from "./types";

export type FailureKind = "refused" | "auth" | "quota" | "rate" | "model" | "missing" | "network" | "timeout" | "work";

// Where a second attempt can succeed: on another agent (this provider will refuse again), on the same one (a passing
// glitch), or nowhere (the work itself went wrong, which a retry would only repeat).
export type RetryOn = "other" | "same" | "none";

export interface Failure {
  kind: FailureKind;
  retry: RetryOn;
}

// A failure Satgas recovered from or reported; kept on the task so the chat and the next round can explain it.
export interface Recovery {
  kind: FailureKind;
  // The agent that failed and the error it left.
  from: AgentKind;
  error: string;
  // The agent the task ran again on; absent when no retry was possible.
  to?: AgentKind;
}

const RULES: [FailureKind, RetryOn, RegExp][] = [
  [
    "refused",
    "other",
    /inappropriate[- ]content|data_inspection_failed|content[ _-]?(filter|policy|management|moderation)|safety (system|filter)|flagged by|violat\w* (our|the) (usage )?polic/i,
  ],
  [
    "quota",
    "other",
    /insufficient[_ ](balance|quota|credit)|quota|billing|payment required|\b402\b|credit balance|out of credits|exceeded your current/i,
  ],
  [
    "auth",
    "other",
    /\b401\b|\b403\b|unauthori[sz]ed|invalid[_ ](api[_ ])?key|api key|authenticat|not logged in|log ?in again|\/login\b|expired token|forbidden/i,
  ],
  ["rate", "other", /\b429\b|rate[ _-]?limit|too many requests|overloaded|\b529\b|capacity/i],
  [
    "model",
    "other",
    /model[^.]{0,60}(does not exist|not found|not supported|unavailable)|do not have access to (the )?model|unknown model|invalid model/i,
  ],
  ["missing", "other", /ENOENT|command not found|not installed|no such file or directory.*(claude|codex)/i],
  [
    "network",
    "same",
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network (error|is unreachable)|stream (disconnected|error)|connection (reset|closed|error)|\b50[234]\b|bad gateway/i,
  ],
  ["timeout", "same", /timed? ?out|deadline exceeded/i],
];

export function classifyFailure(error: string): Failure {
  for (const [kind, retry, re] of RULES) if (re.test(error)) return { kind, retry };
  return { kind: "work", retry: "none" };
}

export const isSystemFailure = (kind: FailureKind) => kind !== "work";

// The agent a task moves to for its one retry, or null when there is none worth trying.
export function retryAgent(failure: Failure, from: AgentKind, available: AgentKind[]): AgentKind | null {
  if (failure.retry === "same") return available.includes(from) ? from : null;
  if (failure.retry === "other") return available.find((a) => a !== from) ?? null;
  return null;
}

// In words for the lead's next plan, so "try again" moves the work somewhere it can succeed.
export const FAILURE_WORDS: Record<FailureKind, string> = {
  refused: "the model provider's content filter refused the input; that provider will refuse it again",
  quota: "the provider account is out of quota or credit",
  auth: "the agent is not signed in or its key was rejected",
  rate: "the provider rate-limited or was overloaded",
  model: "the chosen model is not available on that provider",
  missing: "the agent's command-line tool is missing on this machine",
  network: "the connection to the provider dropped",
  timeout: "the provider took too long to answer",
  work: "the task itself went wrong",
};
