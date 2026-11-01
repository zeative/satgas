import { stat } from "node:fs/promises";
import type { Subprocess } from "bun";
import type { FileChange } from "../../shared/board";
import type { LogLine } from "../../shared/types";

export interface AgentRequest {
  prompt: string;
  cwd: string;
  signal: AbortSignal;
  onLog: (line: Omit<LogLine, "t" | "seq">) => void;
  // Files the agent writes, so the board can show what it produced.
  onFile?: (path: string, change: FileChange["change"]) => void;
}

export interface AgentResult {
  output: string;
  structured?: unknown;
}

export class AgentError extends Error {}

// How long a CLI gets to exit after SIGTERM before its whole process group is killed.
const KILL_GRACE_MS = 3000;

// Spawns a JSONL-emitting CLI, feeds the prompt on stdin, and hands each parsed event to onEvent.
// failureReason lets the adapter name what went wrong; CLIs exit non-zero after reporting it, and the exit code says less.
export async function runJsonl(
  cmd: string[],
  { prompt, cwd, signal }: Pick<AgentRequest, "prompt" | "cwd" | "signal">,
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
  const proc = spawn(cmd, cwd, env);
  let forcing = false;
  const kill = () => {
    signalGroup(proc, "SIGTERM");
    if (forcing) return;
    forcing = true;
    // A CLI that ignores SIGTERM would otherwise keep its run live (and undeletable) forever.
    setTimeout(() => signalGroup(proc, "SIGKILL"), KILL_GRACE_MS);
  };
  signal.addEventListener("abort", kill, { once: true });

  try {
    proc.stdin.write(prompt);
    await proc.stdin.end();

    // stderr only enriches the error message; failing to read it must never surface as its own failure.
    const stderr = new Response(proc.stderr).text().catch(() => "");
    const decoder = new TextDecoder();
    let buf = "";
    const emit = (raw: string) => {
      const event = parseLine(raw);
      if (event !== undefined) onEvent(event);
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
    if (code !== 0) {
      const reason = failureReason();
      if (reason) throw new AgentError(reason);
      const tail = (await stderr).trim().split("\n").slice(-3).join(" ");
      throw new AgentError(`\`${cmd[0]}\` exited with code ${code}${tail ? `: ${tail}` : ""}`);
    }
  } finally {
    signal.removeEventListener("abort", kill);
    // Reading failed while the CLI still runs; it must not outlive its task.
    if (proc.exitCode === null && proc.signalCode === null) kill();
  }
}

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

export function clip(s: string, n = 160): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}
