import { afterAll, beforeAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { codexArgs, runCodex } from "../../../src/server/agents/codex";
import { config } from "../../../src/server/config";
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

test("a failed turn becomes an error even when the process exits cleanly", async () => {
  setFake({ FAKE_CLI_OUTPUT: jsonl({ type: "turn.failed", error: { message: "rate limited" } }) });
  await expect(runCodex(req())).rejects.toThrow("rate limited");
});

test("lean mode ignores config.toml but always runs ephemeral and sandboxed", () => {
  config.leanAgents = true;
  expect(codexArgs("/w")).toEqual(expect.arrayContaining(["--ephemeral", "--ignore-user-config", "-C", "/w", "-s", config.codexSandbox]));
  config.leanAgents = false;
  expect(codexArgs("/w")).not.toContain("--ignore-user-config");
});
