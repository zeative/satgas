// A key or password an agent asks the person for mid-task. The value never travels back to any page and never enters
// a prompt: agents get a private file path and read the file inside their own commands.

export interface SecretAsk {
  id: string;
  nodeId: string;
  label: string;
  reason: string;
  // The agent's words for the empty field, like "At least 12 characters".
  hint?: string;
  state: "waiting" | "given" | "declined" | "expired";
  at: number;
  answeredAt?: number;
  until?: number;
}

export const SECRET_LABEL_MAX = 80;
export const SECRET_REASON_MAX = 300;
export const SECRET_HINT_MAX = 60;
export const SECRET_VALUE_MAX = 8000;
export const SECRETS_PER_TASK = 3;
// How long a task waits for the person before it carries on without the secret.
export const SECRET_WAIT_MS = 10 * 60_000;
// How long a given value stays readable, so later tasks on the board need not ask again.
export const SECRET_KEEP_MS = 24 * 60 * 60_000;

export const waitingSecret = (asks: SecretAsk[] | undefined, nodeId: string) =>
  asks?.find((a) => a.nodeId === nodeId && a.state === "waiting");

export const liveSecrets = (asks: SecretAsk[] | undefined, now = Date.now()) =>
  (asks ?? []).filter((a) => a.state === "given" && (a.until ?? 0) > now);
