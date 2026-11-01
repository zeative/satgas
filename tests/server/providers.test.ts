import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { providerStatuses } from "../../src/server/providers";
import type { Settings } from "../../src/shared/settings";

const g = globalThis as {
  __satgasSettings?: Settings;
  __satgasProviders?: unknown;
  __satgasProviderCheck?: unknown;
  __satgasClaudeModels?: Record<string, string>;
};
const original = {
  claude: config.claudeBin,
  codex: config.codexBin,
  data: config.dataDir,
  settings: g.__satgasSettings,
  models: g.__satgasClaudeModels,
  claudeHome: process.env.CLAUDE_CONFIG_DIR,
  codexHome: process.env.CODEX_HOME,
};
let dir = "";
const calls = () => join(dir, "calls.txt");

const restoreEnv = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-providers-"));
  // Stands in for `claude auth status` and `codex login status`: records each call, answers signed in.
  const bin = join(dir, "cli");
  await Bun.write(bin, `#!/bin/sh\necho "$1" >> "${calls()}"\nsleep 0.2\necho '{"loggedIn": true}'\necho "Logged in"\n`);
  await chmod(bin, 0o755);
  config.claudeBin = bin;
  config.codexBin = bin;
  config.dataDir = dir;
  process.env.CLAUDE_CONFIG_DIR = dir;
  process.env.CODEX_HOME = dir;
  g.__satgasSettings = undefined;
  g.__satgasClaudeModels = {};
});

afterAll(async () => {
  config.claudeBin = original.claude;
  config.codexBin = original.codex;
  config.dataDir = original.data;
  g.__satgasSettings = original.settings;
  g.__satgasClaudeModels = original.models;
  g.__satgasProviders = undefined;
  restoreEnv("CLAUDE_CONFIG_DIR", original.claudeHome);
  restoreEnv("CODEX_HOME", original.codexHome);
  await rm(dir, { recursive: true, force: true });
});

test("requests that arrive while a check runs share it instead of spawning the CLIs again", async () => {
  g.__satgasProviders = undefined;
  const lists = await Promise.all([providerStatuses(true), providerStatuses(true), providerStatuses()]);
  expect(new Set(lists).size).toBe(1);
  expect((await Bun.file(calls()).text()).trim().split("\n").sort()).toEqual(["auth", "login"]);
  expect(lists[0]?.find((p) => p.kind === "claude")?.state).toBe("ok");
});

test("a CLI that is missing is reported as not installed", async () => {
  config.claudeBin = join(dir, "missing");
  try {
    const claude = (await providerStatuses(true)).find((p) => p.kind === "claude");
    expect(claude).toMatchObject({ state: "failed", error: "Claude Code is not installed." });
  } finally {
    config.claudeBin = join(dir, "cli");
  }
});
