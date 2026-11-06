import { afterAll, beforeAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { codexArgs, codexMcp, codexSpawnEnv, runCodex, shellBody } from "../../../src/server/agents/codex";
import { AgentError } from "../../../src/server/agents/process";
import { config } from "../../../src/server/config";
import { teamServer } from "../../../src/server/team";
import { collector, jsonl, makeFakeCli, setFake } from "../../helpers/fake-cli";

let dir = "";
const original = { bin: config.codexBin, lean: config.leanAgents };

beforeAll(async () => {
  const fake = await makeFakeCli();
  dir = fake.dir;
  config.codexBin = fake.bin;
});

afterAll(async () => {
  config.codexBin = original.bin;
  config.leanAgents = original.lean;
  await rm(dir, { recursive: true, force: true });
});

const req = () => ({ prompt: "write math.js", cwd: dir, signal: new AbortController().signal, ...collector() });

test("returns the last agent message and logs commands and file changes", async () => {
  setFake({
    FAKE_CLI_OUTPUT: jsonl(
      { type: "thread.started", thread_id: "t1" },
      { type: "item.started", item: { type: "command_execution", command: "ls -la" } },
      { type: "item.completed", item: { type: "file_change", changes: [{ kind: "add", path: "math.js" }] } },
      { type: "item.completed", item: { type: "agent_message", text: "Draft" } },
      { type: "item.completed", item: { type: "agent_message", text: "Created math.js" } },
      { type: "turn.completed" },
    ),
  });
  const r = req();
  expect(await runCodex(r)).toEqual({ output: "Created math.js" });
  expect(r.logs).toEqual([
    { kind: "tool", text: "Bash ls -la" },
    { kind: "tool", text: "add math.js" },
    { kind: "text", text: "Draft" },
    { kind: "text", text: "Created math.js" },
  ]);
});

test("connector calls, web searches and thoughts reach the log, and the login shell does not", async () => {
  setFake({
    FAKE_CLI_OUTPUT: jsonl(
      { type: "item.completed", item: { type: "reasoning", text: "**Checking** the file" } },
      { type: "item.started", item: { type: "command_execution", command: '/bin/zsh -lc "cat a.ts"' } },
      {
        type: "item.started",
        item: { type: "mcp_tool_call", server: "satgas_team", tool: "request_secret", arguments: { label: "Token" } },
      },
      { type: "item.completed", item: { type: "web_search", query: "bun fetch timeout" } },
      { type: "item.completed", item: { type: "agent_message", text: "Done" } },
      { type: "turn.completed" },
    ),
  });
  const r = req();
  await runCodex(r);
  expect(r.logs).toEqual([
    { kind: "think", text: "**Checking** the file" },
    { kind: "tool", text: "Bash cat a.ts" },
    { kind: "tool", text: "mcp__satgas_team__request_secret Token" },
    { kind: "tool", text: "WebSearch bun fetch timeout" },
    { kind: "text", text: "Done" },
  ]);
});

test("a failed turn becomes an error even when the process exits cleanly", async () => {
  setFake({ FAKE_CLI_OUTPUT: jsonl({ type: "turn.failed", error: { message: "rate limited" } }) });
  await expect(runCodex(req())).rejects.toThrow("rate limited");
});

test("errors the turn recovered from are logged, not treated as a failure", async () => {
  setFake({
    FAKE_CLI_OUTPUT: jsonl(
      { type: "error", message: "Reconnecting... 1/5" },
      { type: "item.completed", item: { type: "agent_message", text: "Done" } },
      { type: "turn.completed" },
    ),
  });
  const r = req();
  expect(await runCodex(r)).toEqual({ output: "Done" });
  expect(r.logs[0]).toEqual({ kind: "error", text: "Reconnecting... 1/5" });
});

test("an error the turn never recovered from still fails the task", async () => {
  setFake({ FAKE_CLI_EXIT: "1", FAKE_CLI_OUTPUT: jsonl({ type: "error", message: "stream disconnected" }) });
  await expect(runCodex(req())).rejects.toThrow(new AgentError("stream disconnected"));
});

test("a failed turn keeps its reason when the process also exits non-zero", async () => {
  setFake({ FAKE_CLI_EXIT: "1", FAKE_CLI_OUTPUT: jsonl({ type: "turn.failed", error: { message: "rate limited" } }) });
  await expect(runCodex(req())).rejects.toThrow(new AgentError("rate limited"));
});

test("lean mode ignores config.toml but always runs ephemeral and sandboxed", () => {
  config.leanAgents = true;
  expect(codexArgs("/w")).toEqual(expect.arrayContaining(["--ephemeral", "--ignore-user-config", "-C", "/w", "-s", config.codexSandbox]));
  config.leanAgents = false;
  expect(codexArgs("/w")).not.toContain("--ignore-user-config");
});

test("the person reads the command, not Codex's login shell around it", () => {
  expect(shellBody(`/bin/zsh -lc "wc -c < '/tmp/a'"`)).toBe("wc -c < '/tmp/a'");
  expect(shellBody("bash -c 'ls -la'")).toBe("ls -la");
  expect(shellBody("git status")).toBe("git status");
});

test("only Satgas's own connector skips Codex's approval, which nobody could answer in an unattended run", () => {
  const { args } = codexMcp([
    teamServer("token", 4317, true, false),
    { id: "mine", name: "mine", enabled: true, transport: "stdio", command: "npx" },
  ]);
  expect(args).toContain('mcp_servers.satgas_team.default_tools_approval_mode="approve"');
  expect(args.join(" ")).not.toContain("satgas_mine.default_tools_approval_mode");
});

test("hands MCP servers to Codex as TOML overrides whose secrets travel in the environment", () => {
  const { args, env } = codexMcp(
    [
      {
        id: "1",
        name: "pw",
        enabled: true,
        transport: "stdio",
        command: "npx",
        args: ["-y", "@playwright/mcp"],
        env: { GH_TOKEN: "s3cret" },
      },
      {
        id: "2",
        name: "docs",
        enabled: true,
        transport: "http",
        url: "https://mcp.example.com/mcp",
        headers: { Authorization: "Bearer t0ken" },
      },
      { id: "3", name: "off", enabled: false, transport: "stdio", command: "x" },
    ],
    {},
  );
  expect(args).toEqual([
    "-c",
    'mcp_servers.satgas_pw.command="npx"',
    "-c",
    'mcp_servers.satgas_pw.args=["-y","@playwright/mcp"]',
    "-c",
    'mcp_servers.satgas_pw.env_vars=["GH_TOKEN"]',
    "-c",
    'mcp_servers.satgas_docs.url="https://mcp.example.com/mcp"',
    "-c",
    'mcp_servers.satgas_docs.env_http_headers={ "Authorization" = "SATGAS_MCP_1_HEADER_0" }',
  ]);
  expect(args.join(" ")).not.toMatch(/s3cret|t0ken/);
  expect(env).toEqual({ GH_TOKEN: "s3cret", SATGAS_MCP_1_HEADER_0: "Bearer t0ken" });
});

test("a variable Codex already has with another value stays inline instead of changing Codex itself", () => {
  const { args, env } = codexMcp(
    [
      { id: "1", name: "a", enabled: true, transport: "stdio", command: "a", env: { KEY: "one", PATH: "/opt/bin" } },
      { id: "2", name: "b", enabled: true, transport: "stdio", command: "b", env: { KEY: "two", HOME: "/home/me" } },
    ],
    { PATH: "/usr/bin", HOME: "/home/me" },
  );
  expect(env).toEqual({ KEY: "one" });
  expect(args).toContain('mcp_servers.satgas_a.env_vars=["KEY"]');
  expect(args).toContain('mcp_servers.satgas_a.env={ "PATH" = "/opt/bin" }');
  expect(args).toContain('mcp_servers.satgas_b.env_vars=["HOME"]');
  expect(args).toContain('mcp_servers.satgas_b.env={ "KEY" = "two" }');
});

test("the spawn environment carries the MCP secrets the arguments name", () => {
  const mcp = codexMcp([{ id: "1", name: "pw", enabled: true, transport: "stdio", command: "npx", env: { SATGAS_TEST_TOKEN: "v" } }], {});
  expect(codexSpawnEnv(mcp).set).toMatchObject({ SATGAS_TEST_TOKEN: "v" });
});
