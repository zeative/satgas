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

test("a Qwen key rejected in one region points to the region that takes it", async () => {
  const { defaultSettings } = await import("../../src/server/settings");
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(new URL(url).host);
    const ok = url.startsWith("https://dashscope-intl.aliyuncs.com/");
    return new Response(JSON.stringify(ok ? { data: [{ id: "qwen3-coder-plus" }] } : { error: "invalid_api_key" }), {
      status: ok ? 200 : 401,
    });
  }) as typeof fetch;
  try {
    g.__satgasProviders = undefined;
    g.__satgasSettings = {
      ...defaultSettings(),
      providers: { qwen: { key: "sk-ws-test", baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic" } },
    };
    const qwen = (await providerStatuses(true)).find((s) => s.kind === "qwen");
    expect(qwen?.state).toBe("failed");
    expect(qwen?.error).toContain("`https://dashscope-intl.aliyuncs.com/apps/anthropic`");
    expect(asked).toContain("dashscope.aliyuncs.com");

    g.__satgasProviders = undefined;
    g.__satgasSettings = { ...defaultSettings(), providers: { qwen: { key: "sk-ws-test" } } };
    const byDefault = (await providerStatuses(true)).find((s) => s.kind === "qwen");
    expect(byDefault?.state).toBe("ok");
  } finally {
    globalThis.fetch = realFetch;
    g.__satgasSettings = undefined;
    g.__satgasProviders = undefined;
  }
});

test("Model Studio's list keeps chat models and drops other kinds, test entries and dated duplicates", async () => {
  const { chatModels } = await import("../../src/server/providers");
  const ids = [
    "qwen3.7-max",
    "qwen3.7-max-2026-05-17",
    "qwen-plus-2025-01-25",
    "qwen3-coder-flash",
    "deepseek-v4-pro-0813",
    "deepseek-v4-pro",
    "glm-5.3",
    "pre-mock_ptu_auth_v2_base",
    "qwen-image-3.0",
    "wan2.5-t2v",
    "text-embedding-v4",
    "qwen-mt-plus",
    "qwen-audio-3.0-asr-flash",
    "tongyi-tingwu-slp",
    "kimi/kimi-k3",
    "ZHIPU/GLM-5.3",
  ];
  expect(chatModels(ids.map((id) => ({ id, name: id }))).map((m) => m.id)).toEqual([
    "qwen3.7-max",
    "qwen-plus-2025-01-25",
    "qwen3-coder-flash",
    "deepseek-v4-pro",
    "glm-5.3",
  ]);
});
