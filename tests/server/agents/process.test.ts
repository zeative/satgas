import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentError, logText, runJsonl } from "../../../src/server/agents/process";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-process-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitForPid(file: string): Promise<number> {
  for (let i = 0; i < 200; i++) {
    const text = await Bun.file(file)
      .text()
      .catch(() => "");
    if (text.trim()) return Number(text.trim());
    await Bun.sleep(10);
  }
  throw new Error("the script never started");
}

test("a missing working folder is named instead of blamed on the CLI", async () => {
  const missing = join(dir, "gone");
  const run = runJsonl(["sh", "-c", "true"], { prompt: "", cwd: missing, signal: new AbortController().signal }, () => {});
  await expect(run).rejects.toThrow(new AgentError(`Working folder not found: \`${missing}\``));
});

test("cancelling stops what the agent started in the background too", async () => {
  const pidFile = join(dir, "bg.pid");
  const ctrl = new AbortController();
  const run = runJsonl(
    ["sh", "-c", 'sleep 30 & echo $! > "$0"; cat > /dev/null; sleep 30', pidFile],
    { prompt: "go", cwd: dir, signal: ctrl.signal },
    () => {},
  );
  const child = await waitForPid(pidFile);
  ctrl.abort();
  await expect(run).rejects.toThrow("Cancelled.");
  await Bun.sleep(50);
  expect(alive(child)).toBe(false);
});

test("a CLI that ignores SIGTERM is killed after the grace period", async () => {
  const ctrl = new AbortController();
  const run = runJsonl(["sh", "-c", "trap '' TERM; cat > /dev/null; sleep 30"], { prompt: "go", cwd: dir, signal: ctrl.signal }, () => {});
  await Bun.sleep(200);
  const started = Date.now();
  ctrl.abort();
  await expect(run).rejects.toThrow("Cancelled.");
  expect(Date.now() - started).toBeLessThan(4500);
});

test("log text is clipped, short text is left alone", () => {
  expect(logText("short")).toBe("short");
  const long = logText("x".repeat(5000));
  expect(long.length).toBe(4000);
  expect(long.endsWith("…")).toBe(true);
});
