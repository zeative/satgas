import { chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { LogLine } from "../../src/shared/types";

const FAKE_VARS = [
  "FAKE_CLI_OUTPUT",
  "FAKE_CLI_ASIDE_OUTPUT",
  "FAKE_CLI_OUTPUT_CAPPED",
  "FAKE_CLI_CAP_OUT",
  "FAKE_CLI_EXIT",
  "FAKE_CLI_STDERR",
  "FAKE_CLI_SLEEP",
  "FAKE_CLI_STDIN_OUT",
  "FAKE_CLI_ARGS_OUT",
  "FAKE_CLI_WORKER_OUTPUT",
  "FAKE_CLI_CODEX_OUTPUT",
  "FAKE_CLI_HEARD_OUT",
  "FAKE_CLI_HEAR_MS",
  "FAKE_CLI_BACKGROUND",
];

// The agents spawn a single executable path, so wrap the Bun fixture in a tiny shell script.
export async function makeFakeCli(): Promise<{ bin: string; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "satgas-test-"));
  const bin = join(dir, "fake-cli");
  const script = resolve(import.meta.dir, "../fixtures/fake-cli.ts");
  await Bun.write(bin, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  await chmod(bin, 0o755);
  return { bin, dir };
}

export function setFake(vars: Partial<Record<(typeof FAKE_VARS)[number], string>>) {
  for (const k of FAKE_VARS) delete process.env[k];
  Object.assign(process.env, vars);
}

export const jsonl = (...events: unknown[]) => `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;

export function collector() {
  const logs: Omit<LogLine, "t" | "seq">[] = [];
  return { logs, onLog: (l: Omit<LogLine, "t" | "seq">) => logs.push(l) };
}
