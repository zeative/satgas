import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { providerStatuses, testProvider } from "../../src/server/providers";
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

// Runs one provider's check against stand-in answers and returns its models.
async function modelsWith(kind: "openrouter" | "openai" | "ollama", answer: (url: string) => unknown) {
  const { defaultSettings } = await import("../../src/server/settings");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    return new Response(JSON.stringify(answer(`${url} ${init?.body ?? ""}`)));
  }) as typeof fetch;
  try {
    g.__satgasProviders = undefined;
    g.__satgasSettings = { ...defaultSettings(), providers: { [kind]: { key: "test-key" } } };
    return (await providerStatuses(true)).find((s) => s.kind === kind)?.models ?? [];
  } finally {
    globalThis.fetch = realFetch;
    g.__satgasSettings = undefined;
    g.__satgasProviders = undefined;
  }
}

test("OpenRouter offers the levels each model reports, limited to what --effort accepts", async () => {
  const models = await modelsWith("openrouter", () => ({
    data: [
      {
        id: "a/levels",
        supported_parameters: ["tools"],
        reasoning: { default_effort: "medium", supported_efforts: ["max", "high", "low", "none", "minimal"] },
      },
      { id: "b/switch", supported_parameters: ["tools"], reasoning: { mandatory: false } },
      { id: "c/plain", supported_parameters: ["tools"], reasoning: null },
      { id: "d/no-tools", supported_parameters: [], reasoning: { supported_efforts: ["high"] } },
    ],
  }));
  expect(models.map((m) => [m.id, m.efforts, m.defaultEffort])).toEqual([
    ["a/levels", ["low", "high", "max"], undefined],
    ["b/switch", undefined, undefined],
    ["c/plain", undefined, undefined],
  ]);
});

test("OpenRouter says which models see images, reason and how much context they take, and leaves unsaid alone", async () => {
  const models = await modelsWith("openrouter", () => ({
    data: [
      {
        id: "a/eyes",
        supported_parameters: ["tools", "reasoning"],
        architecture: { input_modalities: ["text", "image"] },
        context_length: 200000,
      },
      { id: "b/text", supported_parameters: ["tools"], architecture: { input_modalities: ["text"] } },
      { id: "c/unsaid", supported_parameters: ["tools"] },
    ],
  }));
  expect(models.map((m) => [m.id, m.vision, m.reasons, m.context])).toEqual([
    ["a/eyes", true, true, 200000],
    ["b/text", false, false, undefined],
    ["c/unsaid", undefined, false, undefined],
  ]);
});

test("OpenAI lists only models agents can use, with levels when Codex knows the model", async () => {
  await Bun.write(
    join(dir, "models_cache.json"),
    JSON.stringify({
      models: [
        {
          slug: "gpt-known",
          visibility: "hide",
          default_reasoning_level: "medium",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "ultra" }],
        },
      ],
    }),
  );
  const ids = [
    "gpt-known",
    "gpt-4o",
    "gpt-4o-2024-08-06",
    "gpt-4o-mini-transcribe",
    "gpt-4o-mini-transcribe-2025-03-20",
    "gpt-4o-transcribe-diarize",
    "gpt-4o-mini-tts",
    "gpt-4o-search-preview",
    "gpt-4o-audio-preview",
    "gpt-4o-realtime-preview",
    "gpt-image-1",
    "gpt-3.5-turbo-instruct",
    "dall-e-3",
  ];
  try {
    const models = await modelsWith("openai", () => ({ data: ids.map((id) => ({ id })) }));
    expect(models.map((m) => [m.id, m.efforts, m.defaultEffort])).toEqual([
      ["gpt-4o", undefined, undefined],
      ["gpt-known", ["low", "ultra"], "medium"],
    ]);
  } finally {
    await rm(join(dir, "models_cache.json"), { force: true });
  }
});

test("Ollama's capabilities say which models see and think, and an older Ollama that sends none says nothing", async () => {
  const models = await modelsWith("ollama", (asked) => {
    if (asked.includes("/api/tags")) return { models: [{ name: "llava" }, { name: "old" }] };
    if (asked.includes('"llava"'))
      return { capabilities: ["completion", "vision"], model_info: { "llama.context_length": 32768, "llama.block_count": 32 } };
    return {};
  });
  expect(models.map((m) => [m.id, m.vision, m.reasons, m.context])).toEqual([
    ["llava", true, false, 32768],
    ["old", undefined, undefined, undefined],
  ]);
});

test("Ollama offers named thinking levels, and none for an on/off switch or a failed lookup", async () => {
  const models = await modelsWith("ollama", (asked) => {
    if (asked.includes("/api/tags")) return { models: [{ name: "named" }, { name: "switch" }, { name: "bare" }] };
    if (asked.includes('"named"')) return { thinking: { values: ["low", "medium", "high", "turbo"], default: "medium" } };
    if (asked.includes('"switch"')) return { thinking: { values: [false, true], default: true } };
    return {};
  });
  expect(models.map((m) => [m.id, m.efforts])).toEqual([
    ["named", ["low", "medium", "high"]],
    ["switch", undefined],
    ["bare", undefined],
  ]);
});

test("a CLI nobody signed in to, or that is missing, reads as not connected instead of failing", async () => {
  const before = { claude: config.claudeBin, codex: config.codexBin };
  const signedOut = join(dir, "signed-out");
  await Bun.write(signedOut, `#!/bin/sh\necho '{"loggedIn": false}'\nexit 1\n`);
  await chmod(signedOut, 0o755);
  config.claudeBin = signedOut;
  config.codexBin = join(dir, "not-installed");
  g.__satgasProviders = undefined;
  g.__satgasProviderCheck = undefined;
  const list = await providerStatuses(true);
  for (const kind of ["claude", "codex"]) expect(list.find((s) => s.kind === kind)).toEqual({ kind, state: "off", models: [] } as never);
  config.claudeBin = before.claude;
  config.codexBin = before.codex;
  g.__satgasProviders = undefined;
});

test("testing a provider really sends a message, and reports what the model answered", async () => {
  const before = config.claudeBin;
  const sent = join(dir, "sent.txt");
  const fake = (result: string) =>
    `#!/bin/sh\n[ "$1" = auth ] && { echo '{"loggedIn": true}'; exit 0; }\necho "$*" >> "${sent}"\necho '${result}'\n`;
  const bin = join(dir, "ping");
  await Bun.write(bin, fake(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "OK" })));
  await chmod(bin, 0o755);
  config.claudeBin = bin;
  try {
    expect(await testProvider("claude")).toBeNull();
    const args = await Bun.file(sent).text();
    expect(args).toContain("--model haiku");
    expect(args).toContain("--tools");

    await Bun.write(bin, fake(JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "Model not found" })));
    await chmod(bin, 0o755);
    expect(await testProvider("claude")).toContain("Model not found");

    await Bun.write(bin, `#!/bin/sh\n[ "$1" = auth ] && { echo '{"loggedIn": true}'; exit 0; }\nexit 0\n`);
    await chmod(bin, 0o755);
    expect(await testProvider("claude")).toBe("The model did not answer.");
  } finally {
    config.claudeBin = before;
  }
});

test("a keyed provider asks for its key before spending anything", async () => {
  expect(await testProvider("anthropic")).toBe("Add the key first.");
});
