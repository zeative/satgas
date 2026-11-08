import { stat } from "node:fs/promises";
import type { Subprocess } from "bun";
import type { FileChange } from "../../shared/board";
import type { LogLine } from "../../shared/types";
import { accountGuardEnv } from "./account-guard";
import { commitGuardEnv } from "./commit-guard";

export interface AgentRequest {
  prompt: string;
  cwd: string;
  signal: AbortSignal;
  // `picture` is an image a tool returned; whoever logs it saves it and keeps only its name in the line.
  onLog: (line: Omit<LogLine, "t" | "seq"> & { picture?: { mime: string; data: string } }) => void;
  // Files the agent writes, so the board can show what it produced.
  onFile?: (path: string, change: FileChange["change"]) => void;
  // Set: the agent takes messages while it works (Claude Code's streaming input). It gets a send function once
  // running, and null once it has finished and can take no more.
  inbox?: (send: ((text: string) => void) | null) => void;
  // The task's token for its built-in connector: the secret request always, team talk when teammates work alongside.
  teamToken?: string;
  teamTalk?: boolean;
  // The model cannot see images: pictures it opens are described by a vision model instead.
  blind?: boolean;
  // A look-only task: no file-editing tools, and Codex runs in its read-only sandbox.
  readOnly?: boolean;
  // A Claude Code session to continue, with its whole history; the prompt is then the next message to it.
  resume?: string;
  // Told as soon as the CLI names its session, so even a task that fails can be continued.
  onSession?: (id: string) => void;
  // A round a watched pull request started, which may use the GitHub CLI.
  watchedPull?: boolean;
}

import type { Usage } from "../../shared/types";

export interface AgentResult {
  output: string;
  structured?: unknown;
  usage?: Usage;
  // The session a worker ran in, so the task can be continued later with its history.
  session?: string;
}

export class AgentError extends Error {}

// How long a CLI gets to exit after SIGTERM before its whole process group is killed.
const KILL_GRACE_MS = 3000;

// Spawns a JSONL-emitting CLI, feeds the prompt on stdin, and hands each parsed event to onEvent.
// failureReason lets the adapter name what went wrong; CLIs exit non-zero after reporting it, and the exit code says less.
export async function runJsonl(
  cmd: string[],
  {
    prompt,
    cwd,
    signal,
    inbox,
    onLog,
    watchedPull,
  }: Pick<AgentRequest, "prompt" | "cwd" | "signal" | "inbox"> & Partial<Pick<AgentRequest, "onLog" | "watchedPull">>,
  onEvent: (event: any) => void,
  failureReason: () => string | undefined = () => undefined,
  env: EnvChange = { set: {}, unset: [] },
): Promise<void> {
  if (signal.aborted) throw new AgentError("Cancelled.");
  const isDir = await stat(cwd).then(
    (s) => s.isDirectory(),
    () => false,
  );
  if (!isDir) throw new AgentError(`Working folder not found: \`${cwd}\``);
  const guard = await accountGuardEnv(watchedPull);
  const proc = spawn(cmd, cwd, { set: { ...(await commitGuardEnv()), ...guard.set, ...env.set }, unset: [...guard.unset, ...env.unset] });
  let forcing = false;
  const kill = () => {
    signalGroup(proc, "SIGTERM");
    if (forcing) return;
    forcing = true;
    // A CLI that ignores SIGTERM would otherwise keep its run live (and undeletable) forever.
    setTimeout(() => signalGroup(proc, "SIGKILL"), KILL_GRACE_MS);
  };
  signal.addEventListener("abort", kill, { once: true });

  // Streaming: the prompt goes in as the first user message and stdin stays open, so a message sent later reaches the
  // agent at its next step; the CLI's final result closes it, which lets the CLI exit.
  let open = !!inbox;
  const close = () => {
    if (!open) return;
    open = false;
    inbox?.(null);
    void proc.stdin.end();
  };
  try {
    if (inbox) {
      const send = (text: string) => {
        if (!open) return;
        proc.stdin.write(userLine(text));
        void proc.stdin.flush();
      };
      send(prompt);
      inbox(send);
    } else {
      proc.stdin.write(prompt);
      await proc.stdin.end();
    }

    // stderr only enriches the error message; failing to read it must never surface as its own failure.
    const stderr = new Response(proc.stderr).text().catch(() => "");
    const decoder = new TextDecoder();
    let buf = "";
    const emit = (raw: string) => {
      const event = parseLine(raw);
      if (event === undefined) return;
      onEvent(event);
      if ((event as { type?: unknown }).type === "result") close();
    };
    for await (const chunk of proc.stdout) {
      buf += decoder.decode(chunk, { stream: true });
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        emit(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    emit(buf + decoder.decode());

    const code = await proc.exited;
    if (signal.aborted) throw new AgentError("Cancelled.");
    if (code === 0) await settleBackground(proc, signal, onLog);
    else signalGroup(proc, "SIGTERM");
    if (code !== 0) {
      const reason = failureReason();
      if (reason) throw new AgentError(reason);
      const tail = (await stderr).trim().split("\n").slice(-3).join(" ");
      throw new AgentError(`\`${cmd[0]}\` exited with code ${code}${tail ? `: ${tail}` : ""}`);
    }
  } finally {
    close();
    signal.removeEventListener("abort", kill);
    // Reading failed while the CLI still runs; it must not outlive its task.
    if (proc.exitCode === null && proc.signalCode === null) kill();
  }
}

// What an agent started and left running when its CLI finished (a build or test sent to the background, a dev server)
// keeps the task working for a short while so it can end on its own; whatever still runs then is stopped, so a task
// never leaves processes behind on the machine.
export const background = { waitMs: 2 * 60_000, pollMs: 2000 };

async function settleBackground(proc: Subprocess, signal: AbortSignal, onLog?: AgentRequest["onLog"]) {
  let left = await groupMembers(proc.pid);
  if (!left.length) return;
  // MCP servers and helpers exit once the CLI's pipes close; a short pause keeps them from counting as left behind.
  await Bun.sleep(Math.min(1500, background.pollMs));
  left = await groupMembers(proc.pid);
  if (!left.length) return;
  const names = () => [...new Set(left.map((p) => clip(p.command, 60)))].slice(0, 4).join(", ");
  onLog?.({ kind: "info", text: `Waiting for background work to finish: ${names()}` });
  const end = Date.now() + background.waitMs;
  while (left.length && Date.now() < end && !signal.aborted) {
    await Bun.sleep(background.pollMs);
    left = await groupMembers(proc.pid);
  }
  if (!left.length) return onLog?.({ kind: "info", text: "Background work finished" });
  const stopped = names();
  signalGroup(proc, "SIGTERM");
  setTimeout(() => signalGroup(proc, "SIGKILL"), KILL_GRACE_MS);
  onLog?.({ kind: "info", text: `Stopped what was still running in the background: ${stopped}` });
}

// The processes still in a finished CLI's process group, read from ps; none when ps is missing or fails.
export async function groupMembers(pgid: number): Promise<{ pid: number; command: string }[]> {
  try {
    const ps = Bun.spawn(["ps", "-A", "-o", "pid=,pgid=,command="], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(ps.stdout).text();
    await ps.exited;
    return text.split("\n").flatMap((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      return m && Number(m[2]) === pgid && Number(m[1]) !== pgid ? [{ pid: Number(m[1]), command: (m[3] ?? "").trim() }] : [];
    });
  } catch {
    return [];
  }
}

// One user turn in Claude Code's stream-json input.
const userLine = (text: string) => `${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`;

export interface EnvChange {
  set: Record<string, string>;
  unset: string[];
}

export function childEnv({ set, unset }: EnvChange): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1" };
  for (const k of unset) delete env[k];
  return { ...env, ...set };
}

// Its own process group, so a stop also reaches what the agent started: dev servers, background commands, MCP servers.
function spawn(cmd: string[], cwd: string, env: EnvChange) {
  try {
    return Bun.spawn(cmd, { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: childEnv(env), detached: true });
  } catch (e) {
    throw new AgentError(`Could not start \`${cmd[0]}\`: ${(e as Error).message}. Is it installed and on \`PATH\`?`);
  }
}

function signalGroup(proc: Subprocess, sig: NodeJS.Signals) {
  try {
    process.kill(-proc.pid, sig);
  } catch {
    // The group is gone, or this platform has no process groups.
    try {
      proc.kill(sig);
    } catch {}
  }
}

// CLIs sometimes print banners or warnings on stdout; only JSON object lines are events.
function parseLine(raw: string): unknown {
  const line = raw.trim();
  if (!line.startsWith("{")) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

// Log lines are a live feed; a task's full answer is kept in its output.
export const logText = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const SENSITIVE_ARG = /token|secret|passw|api.?key|auth|credential|cookie/i;

// A tool call's input in a few words; a connector's unknown input shows its first plain value, never one named like a secret.
export function describeInput(input: any): string {
  if (!input || typeof input !== "object") return "";
  const named =
    input.command ??
    input.file_path ??
    input.notebook_path ??
    input.pattern ??
    input.path ??
    input.url ??
    input.query ??
    input.skill ??
    input.label ??
    input.description;
  const v = named ?? Object.entries(input).find(([k, x]) => typeof x === "string" && x.trim() && !SENSITIVE_ARG.test(k))?.[1];
  return v ? clip(String(v), 400) : "";
}

// What a tool gave back, kept readable for the chat: lines intact, terminal colours gone, and a long output cut to its
// start and end, where errors and results usually are.
// Terminal colour codes, which start with the escape character.
export const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");
const OUTPUT_HEAD = 1600;
const OUTPUT_TAIL = 600;
export function clipOutput(s: string): string {
  const text = s.replace(ANSI, "").replace(/\r\n?/g, "\n").trimEnd();
  if (text.length <= OUTPUT_HEAD + OUTPUT_TAIL + 40) return text;
  const head = text.slice(0, OUTPUT_HEAD);
  const tail = text.slice(-OUTPUT_TAIL);
  const hidden = text.slice(OUTPUT_HEAD, -OUTPUT_TAIL).split("\n").length - 1;
  return `${head}\n… ${hidden} more lines …\n${tail}`;
}

export function clip(s: string, n = 160): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}
