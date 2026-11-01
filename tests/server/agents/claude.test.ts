import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { claudeArgs, claudeMcpConfig, runClaude } from "../../../src/server/agents/claude";
import { AgentError } from "../../../src/server/agents/process";
import { config } from "../../../src/server/config";
import { defaultSettings } from "../../../src/server/settings";
import type { Settings } from "../../../src/shared/settings";
import { collector, jsonl, makeFakeCli, setFake } from "../../helpers/fake-cli";

let dir = "";
const original = { bin: config.claudeBin, lean: config.leanAgents };

beforeAll(async () => {
  const fake = await makeFakeCli();
  dir = fake.dir;
  config.claudeBin = fake.bin;
});

afterAll(async () => {
  config.claudeBin = original.bin;
  config.leanAgents = original.lean;
  await rm(dir, { recursive: true, force: true });
});

const req = (signal = new AbortController().signal) => ({ prompt: "do the thing", cwd: dir, signal, ...collector() });

describe("runClaude", () => {
  test("streams text and tool calls, returns the result and structured output", async () => {
    const stdinOut = join(dir, "stdin.txt");
    setFake({
      FAKE_CLI_STDIN_OUT: stdinOut,
      FAKE_CLI_OUTPUT: `banner line that is not json\n${jsonl(
        { type: "system", subtype: "init" },
        {
          type: "assistant",
          message: {
            content: [
              { type: "text", text: "Planning the change" },
              { type: "tool_use", name: "Bash", input: { command: "bun test" } },
            ],
          },
        },
        { type: "result", subtype: "success", is_error: false, result: "All done", structured_output: { ok: true } },
      )}`,
    });
    const r = req();
    const out = await runClaude(r);
    expect(out).toEqual({ output: "All done", structured: { ok: true } });
    expect(r.logs).toEqual([
      { kind: "text", text: "Planning the change" },
      { kind: "tool", text: "Bash bun test" },
    ]);
    expect(await Bun.file(stdinOut).text()).toBe("do the thing");
  });

  test("turns an error result into an AgentError", async () => {
    setFake({ FAKE_CLI_OUTPUT: jsonl({ type: "result", subtype: "error_max_turns", is_error: true, result: "" }) });
    await expect(runClaude(req())).rejects.toThrow(new AgentError("error_max_turns"));
  });

  test("keeps the agent's own reason when the CLI exits non-zero after an error result", async () => {
    setFake({
      FAKE_CLI_EXIT: "1",
      FAKE_CLI_OUTPUT: jsonl({ type: "result", subtype: "error_during_execution", is_error: true, result: "2 of 6 tests failed" }),
    });
    await expect(runClaude(req())).rejects.toThrow(new AgentError("2 of 6 tests failed"));
  });

  test("reports the exit code and stderr tail when the CLI crashes", async () => {
    setFake({ FAKE_CLI_EXIT: "2", FAKE_CLI_STDERR: "boom: not logged in\n" });
    await expect(runClaude(req())).rejects.toThrow("exited with code 2: boom: not logged in");
  });

  test("hands MCP servers over in a private file, never on the command line, and removes it afterwards", async () => {
    const g = globalThis as { __satgasSettings?: Settings };
    const saved = g.__satgasSettings;
    const server = { id: "1", name: "gh", enabled: true, transport: "stdio" as const, command: "npx", env: { GH_TOKEN: "s3cret" } };
    g.__satgasSettings = { ...defaultSettings(), mcpServers: [server] };
    const argsOut = join(dir, "mcp-args.json");
    try {
      setFake({
        FAKE_CLI_ARGS_OUT: argsOut,
        FAKE_CLI_SLEEP: "1000",
        FAKE_CLI_OUTPUT: jsonl({ type: "result", subtype: "success", is_error: false, result: "ok" }),
      });
      const running = runClaude(req());
      let args: string[] = [];
      for (let i = 0; i < 150 && !args.length; i++) {
        await Bun.sleep(20);
        args = await Bun.file(argsOut)
          .json()
          .catch(() => []);
      }
      const path = args[args.indexOf("--mcp-config") + 1] ?? "";
      expect(args.join(" ")).not.toContain("s3cret");
      expect(args[args.indexOf("--allowedTools") + 1]).toContain("mcp__gh");
      expect(await Bun.file(path).json()).toEqual({
        mcpServers: { gh: { type: "stdio", command: "npx", args: [], env: { GH_TOKEN: "s3cret" } } },
      });
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      await running;
      expect(await Bun.file(path).exists()).toBe(false);
    } finally {
      g.__satgasSettings = saved;
    }
  });

  test("kills the process and reports cancellation on abort", async () => {
    setFake({ FAKE_CLI_SLEEP: "10000" });
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 100);
    const started = Date.now();
    await expect(runClaude(req(ctrl.signal))).rejects.toThrow("Cancelled.");
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("claudeArgs", () => {
  test("lean mode skips user settings and MCP servers", () => {
    config.leanAgents = true;
    const args = claudeArgs();
    expect(args).toContain("--strict-mcp-config");
    expect(args.slice(args.indexOf("--setting-sources"), args.indexOf("--setting-sources") + 2)).toEqual(["--setting-sources", ""]);
  });

  test("non-lean mode keeps the user's own CLI configuration", () => {
    config.leanAgents = false;
    const args = claudeArgs();
    expect(args).not.toContain("--strict-mcp-config");
    expect(args).not.toContain("--setting-sources");
  });

  test("planner mode disables tools instead of granting worker permissions", () => {
    const args = claudeArgs({ tools: "" });
    expect(args).toContain("--tools");
    expect(args).not.toContain("--permission-mode");
  });
});

test("passes enabled MCP servers in Claude's config shape and skips disabled ones", () => {
  expect(claudeMcpConfig([])).toBeNull();
  expect(
    claudeMcpConfig([
      { id: "1", name: "pw", enabled: true, transport: "stdio", command: "npx", args: ["-y", "@playwright/mcp"], env: { DEBUG: "1" } },
      { id: "2", name: "docs", enabled: true, transport: "http", url: "https://mcp.example.com/mcp", headers: {} },
      { id: "3", name: "off", enabled: false, transport: "stdio", command: "x" },
    ]),
  ).toEqual({
    mcpServers: {
      pw: { type: "stdio", command: "npx", args: ["-y", "@playwright/mcp"], env: { DEBUG: "1" } },
      docs: { type: "http", url: "https://mcp.example.com/mcp", headers: {} },
    },
  });
});
