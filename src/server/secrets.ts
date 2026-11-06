import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  liveSecrets,
  SECRET_HINT_MAX,
  SECRET_KEEP_MS,
  SECRET_LABEL_MAX,
  SECRET_REASON_MAX,
  SECRET_VALUE_MAX,
  SECRET_WAIT_MS,
  SECRETS_PER_TASK,
  type SecretAsk,
} from "../shared/secrets";
import type { Run } from "../shared/types";
import { config } from "./config";
import { appendLog, getRun, patchRun } from "./store";

type Answer = { file: string } | { declined: true } | { expired: true };

// Survives `bun --hot` reloads, so an answer still reaches the task that is waiting for it.
const hot = globalThis as typeof globalThis & { __satgasSecretWaits?: Map<string, (a: Answer) => void> };
hot.__satgasSecretWaits ??= new Map();
const waits = hot.__satgasSecretWaits;

export const secretWait = { ms: SECRET_WAIT_MS };

const rootDir = () => join(config.dataDir, "secrets");
const dirOf = (runId: string) => join(rootDir(), runId);
const fileOf = (runId: string, askId: string) => join(dirOf(runId), askId);
const oneLine = (raw: unknown, max: number) => (typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, max) : "");

function update(runId: string, askId: string, patch: Partial<SecretAsk>) {
  const run = getRun(runId);
  if (!run) return;
  patchRun(runId, { secrets: (run.secrets ?? []).map((a) => (a.id === askId ? { ...a, ...patch } : a)) });
}

// The agent's request: shown in the chat as a private card, answered with a file path, a decline, or nothing in time.
export async function requestSecret(
  runId: string,
  nodeId: string,
  rawLabel: unknown,
  rawReason: unknown,
  rawHint?: unknown,
): Promise<string> {
  const run = getRun(runId);
  if (!run) return "This task is no longer running.";
  const label = oneLine(rawLabel, SECRET_LABEL_MAX);
  const hint = oneLine(rawHint, SECRET_HINT_MAX);
  if (!label) return 'Name the secret you need, like "Stripe test key".';
  const mine = (run.secrets ?? []).filter((a) => a.nodeId === nodeId);
  if (mine.length >= SECRETS_PER_TASK)
    return `You already asked for ${SECRETS_PER_TASK} secrets; carry on without this one and name it in your report.`;
  const ask: SecretAsk = {
    id: crypto.randomUUID().slice(0, 8),
    nodeId,
    label,
    reason: oneLine(rawReason, SECRET_REASON_MAX),
    ...(hint ? { hint } : {}),
    state: "waiting",
    at: Date.now(),
  };
  patchRun(runId, { secrets: [...(run.secrets ?? []), ask] });
  appendLog(runId, nodeId, { kind: "info", text: `Asked the person for ${label}` });
  const answer = await new Promise<Answer>((resolve) => {
    const timer = setTimeout(() => {
      waits.delete(ask.id);
      resolve({ expired: true });
    }, secretWait.ms);
    waits.set(ask.id, (a) => {
      clearTimeout(timer);
      waits.delete(ask.id);
      resolve(a);
    });
  });
  if ("file" in answer)
    return `The person entered ${label}. It is in ${answer.file}, a private file that stays readable for 24 hours. Use it straight from the file inside your command, like VALUE="$(cat ${answer.file})" your-command; never print it, echo it, copy it into other files, or commit it.`;
  if ("declined" in answer) return `The person chose not to give ${label}. Carry on without it and say in your report what it blocked.`;
  update(runId, ask.id, { state: "expired", answeredAt: Date.now() });
  return `The person did not answer in time. Carry on without ${label} and say in your report what it blocked.`;
}

// The person's answer from the chat card; the value only ever lands in a file private to this user.
export async function answerSecret(runId: string, askId: string, value: unknown, decline: boolean): Promise<string | null> {
  const ask = getRun(runId)?.secrets?.find((a) => a.id === askId);
  const resolve = waits.get(askId);
  if (ask?.state !== "waiting" || !resolve) return "This request is no longer waiting.";
  if (decline) {
    update(runId, askId, { state: "declined", answeredAt: Date.now() });
    resolve({ declined: true });
    return null;
  }
  if (typeof value !== "string" || !value.trim()) return "Enter the value, or decline.";
  if (value.length > SECRET_VALUE_MAX) return "That value is too long.";
  await mkdir(dirOf(runId), { recursive: true, mode: 0o700 });
  const file = fileOf(runId, askId);
  await writeFile(file, value, { mode: 0o600 });
  const now = Date.now();
  update(runId, askId, { state: "given", answeredAt: now, until: now + SECRET_KEEP_MS });
  resolve({ file });
  return null;
}

// A task ended: a request it left open stops waiting. What it was given stays for the board's next tasks.
export function closeSecrets(runId: string, nodeId: string) {
  for (const a of getRun(runId)?.secrets ?? []) {
    if (a.nodeId === nodeId && a.state === "waiting") waits.get(a.id)?.({ expired: true });
  }
}

// The person takes a value back before its 24 hours are up. Tasks already running lose it too.
export async function forgetSecret(runId: string, askId: string): Promise<boolean> {
  const ask = liveSecrets(getRun(runId)?.secrets).find((a) => a.id === askId);
  if (!ask) return false;
  await rm(fileOf(runId, askId), { force: true });
  update(runId, askId, { until: Date.now() });
  return true;
}

// What a new task on this board may read, so it does not ask the person again.
export const savedSecrets = (run: Run) => liveSecrets(run.secrets).map((a) => ({ label: a.label, file: fileOf(run.id, a.id) }));

// Works from what is on disk, so a value outlives its 24 hours neither through a crash nor a board that is gone.
export async function sweepSecrets() {
  const boards = await readdir(rootDir()).catch(() => [] as string[]);
  await Promise.all(
    boards.map(async (id) => {
      const run = getRun(id);
      if (!run) return rm(dirOf(id), { recursive: true, force: true });
      const keep = new Set([...liveSecrets(run.secrets), ...(run.secrets ?? []).filter((a) => a.state === "waiting")].map((a) => a.id));
      const files = await readdir(dirOf(id)).catch(() => [] as string[]);
      await Promise.all(files.filter((f) => !keep.has(f)).map((f) => rm(join(dirOf(id), f), { force: true })));
    }),
  );
}

export function startSecretSweep() {
  void sweepSecrets();
  setInterval(() => void sweepSecrets(), 60 * 60_000).unref();
}

export const removeRunSecrets = (runId: string) => rm(dirOf(runId), { recursive: true, force: true });
