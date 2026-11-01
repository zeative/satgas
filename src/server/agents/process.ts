import type { LogLine } from "../../shared/types";

export interface AgentRequest {
  prompt: string;
  cwd: string;
  signal: AbortSignal;
  onLog: (line: Omit<LogLine, "t" | "seq">) => void;
}

export interface AgentResult {
  output: string;
  structured?: unknown;
}

export class AgentError extends Error {}

// Spawns a JSONL-emitting CLI, feeds the prompt on stdin, and hands each parsed event to onEvent.
export async function runJsonl(
  cmd: string[],
  { prompt, cwd, signal }: Pick<AgentRequest, "prompt" | "cwd" | "signal">,
  onEvent: (event: any) => void,
): Promise<void> {
  if (signal.aborted) throw new AgentError("Cancelled.");
  const proc = spawn(cmd, cwd);
  const kill = () => proc.kill();
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
      const tail = (await stderr).trim().split("\n").slice(-3).join(" ");
      throw new AgentError(`${cmd[0]} exited with code ${code}${tail ? `: ${tail}` : ""}`);
    }
  } finally {
    signal.removeEventListener("abort", kill);
  }
}

function spawn(cmd: string[], cwd: string) {
  try {
    return Bun.spawn(cmd, { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  } catch (e) {
    throw new AgentError(`Could not start ${cmd[0]}: ${(e as Error).message}. Is it installed and on PATH?`);
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

export function clip(s: string, n = 160): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
}
