import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentError, clipOutput, logText, runJsonl } from "../../../src/server/agents/process";

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

test("background work left by a finished CLI is waited for, then stopped when it runs too long", async () => {
  const { background } = await import("../../../src/server/agents/process");
  const saved = { ...background };
  Object.assign(background, { waitMs: 400, pollMs: 50 });
  try {
    const logs: string[] = [];
    const onLog = (l: { text: string }) => logs.push(l.text);
    const pidFile = join(dir, "bg.pid");
    await runJsonl(
      ["sh", "-c", `sleep 30 >/dev/null 2>&1 & echo $! > ${pidFile}`],
      { prompt: "", cwd: dir, signal: new AbortController().signal, onLog },
      () => {},
    );
    expect(logs[0]).toStartWith("Waiting for background work to finish: sleep 30");
    expect(logs.at(-1)).toStartWith("Stopped what was still running in the background");
    const pid = await waitForPid(pidFile);
    await Bun.sleep(100);
    expect(alive(pid)).toBe(false);

    logs.length = 0;
    Object.assign(background, { waitMs: 5000 });
    await runJsonl(
      ["sh", "-c", "sleep 0.3 >/dev/null 2>&1 &"],
      { prompt: "", cwd: dir, signal: new AbortController().signal, onLog },
      () => {},
    );
    expect(logs).toEqual(["Waiting for background work to finish: sleep 0.3", "Background work finished"]);

    logs.length = 0;
    await runJsonl(["sh", "-c", "true"], { prompt: "", cwd: dir, signal: new AbortController().signal, onLog }, () => {});
    expect(logs).toEqual([]);
  } finally {
    Object.assign(background, saved);
  }
});

test("a tool's output keeps its lines, loses terminal colours, and a long one keeps its start and end", () => {
  expect(clipOutput("\x1b[32mok\x1b[0m\r\nnext\n\n")).toBe("ok\nnext");
  const long = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n");
  const kept = clipOutput(long);
  expect(kept.startsWith("line 0\n")).toBe(true);
  expect(kept.endsWith("line 399")).toBe(true);
  expect(kept).toMatch(/… \d+ more lines …/);
  expect(kept.length).toBeLessThan(2400);
});
