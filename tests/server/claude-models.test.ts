import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeAliasIds, parseClaudeId, prettyClaude } from "../../src/server/claude-models";
import { config } from "../../src/server/config";

test("model ids read as the names people know", () => {
  expect(prettyClaude("claude-opus-5-5")).toBe("Claude Opus 5.5");
  expect(prettyClaude("claude-fable-5-1[1m]")).toBe("Claude Fable 5.1");
  expect(prettyClaude("claude-haiku-4-5-20251001")).toBe("Claude Haiku 4.5");
  expect(prettyClaude("claude-sonnet-5")).toBe("Claude Sonnet 5");
});

test("anything that is not a Claude model id is left alone", () => {
  expect(parseClaudeId("gpt-6-luna")).toBeNull();
  expect(prettyClaude("opus")).toBeNull();
});

test("a date-stamped id in the CLI's cache is not read as a minor version", async () => {
  const dir = await mkdtemp(join(tmpdir(), "satgas-models-"));
  const original = { home: process.env.CLAUDE_CONFIG_DIR, data: config.dataDir };
  const g = globalThis as { __satgasClaudeModels?: Record<string, string> };
  const learned = g.__satgasClaudeModels;
  process.env.CLAUDE_CONFIG_DIR = dir;
  config.dataDir = dir;
  g.__satgasClaudeModels = {};
  try {
    await Bun.write(join(dir, ".claude.json"), JSON.stringify({ seen: ["claude-sonnet-4-20250514", "claude-sonnet-4-5-20250929"] }));
    expect((await claudeAliasIds()).sonnet).toBe("claude-sonnet-4-5-20250929");
  } finally {
    if (original.home === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = original.home;
    config.dataDir = original.data;
    g.__satgasClaudeModels = learned;
    await rm(dir, { recursive: true, force: true });
  }
});
