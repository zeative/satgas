import type { AgentKind } from "../../shared/types";
import { config } from "../config";

export type AgentVersions = Record<AgentKind, string | null>;

// The installed version of an agent CLI, or null when it is missing or broken.
async function versionOf(bin: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([bin, "--version"], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const timer = setTimeout(() => proc.kill(), 5000);
    const out = (await new Response(proc.stdout).text()).trim();
    clearTimeout(timer);
    if ((await proc.exited) !== 0) return null;
    return out.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? (out.slice(0, 40) || "installed");
  } catch {
    // Spawning a missing binary throws.
    return null;
  }
}

let detected: Promise<AgentVersions> | undefined;

// Checked once per server start; installing a CLI later needs a restart to show up.
export function detectAgents(): Promise<AgentVersions> {
  detected ??= Promise.all([versionOf(config.claudeBin), versionOf(config.codexBin)]).then(([claude, codex]) => ({ claude, codex }));
  return detected;
}
