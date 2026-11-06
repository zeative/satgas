import { describe, expect, test } from "bun:test";
import { CODEX_KEY_VAR, claudeEnv, codexProviderArgs, LEAD_PROVIDERS, leadBlocked, PROVIDERS } from "../../src/shared/providers";

describe("claudeEnv", () => {
  test("leaves the CLI's own sign-in alone", () => {
    expect(claudeEnv("claude", {}, "")).toEqual({ set: {}, unset: [] });
  });

  test("a subscription token drops every variable that would outrank it", () => {
    const env = claudeEnv("claude-token", { key: " sk-ant-oat01 " }, "");
    expect(env.set).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01" });
    expect(env.unset).toEqual(expect.arrayContaining(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"]));
  });

  test("a picked provider is not overridden by an exported Bedrock, Vertex or Foundry switch", () => {
    const cloud = ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"];
    for (const kind of ["claude-token", "anthropic", "zai", "ollama"] as const) {
      expect(claudeEnv(kind, { key: "k" }, "").unset).toEqual(expect.arrayContaining(cloud));
    }
  });

  test("a gateway gets its endpoint, a bearer token and its own model for every Claude role", () => {
    const env = claudeEnv("zai", { key: "k" }, "glm-5.3");
    expect(env.set).toMatchObject({
      ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
      ANTHROPIC_AUTH_TOKEN: "k",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "glm-5.3",
      CLAUDE_CODE_SUBAGENT_MODEL: "glm-5.3",
    });
    expect(env.set.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test("local Ollama needs no key, and an edited endpoint wins", () => {
    expect(claudeEnv("ollama", { baseUrl: "http://10.0.0.2:11434/" }, "qwen3-coder").set).toMatchObject({
      ANTHROPIC_BASE_URL: "http://10.0.0.2:11434",
      ANTHROPIC_AUTH_TOKEN: "ollama",
    });
  });
});

describe("codexProviderArgs", () => {
  test("the CLI's own sign-in adds nothing", () => {
    expect(codexProviderArgs("codex", {})).toEqual([]);
  });

  test("a keyed provider is a Responses-API entry whose key comes from the environment", () => {
    const args = codexProviderArgs("groq", { key: "secret" });
    expect(args.join(" ")).not.toContain("secret");
    expect(args).toContain(`model_providers.satgas.env_key="${CODEX_KEY_VAR}"`);
    expect(args).toContain('model_providers.satgas.wire_api="responses"');
    expect(args).toContain('model_providers.satgas.base_url="https://api.groq.com/openai/v1"');
    expect(args.at(-1)).toBe('model_provider="satgas"');
  });

  test("a local server has no key to ask for", () => {
    expect(codexProviderArgs("lmstudio", {}).some((a) => a.includes("env_key"))).toBe(false);
  });
});

test("every provider belongs to one agent and has docs", () => {
  for (const p of PROVIDERS) {
    expect(["claude", "codex"]).toContain(p.runtime);
    expect(p.docs).toMatch(/^https:\/\//);
    if (p.auth === "key") expect(p.keyLabel).toBeDefined();
  }
});

describe("leadBlocked", () => {
  test("waits for an answer instead of blocking on an unknown state", () => {
    expect(leadBlocked("claude", null)).toBe(false);
  });

  test("blocks until the lead's own provider passes its check", () => {
    expect(leadBlocked("claude", [{ kind: "claude", state: "ok" }])).toBe(false);
    expect(leadBlocked("claude", [{ kind: "claude", state: "failed" }])).toBe(true);
    expect(leadBlocked("anthropic", [{ kind: "anthropic", state: "off" }])).toBe(true);
    expect(leadBlocked("claude", [])).toBe(true);
  });

  test("a working Codex does not unblock the lead", () => {
    expect(
      leadBlocked("claude", [
        { kind: "claude", state: "failed" },
        { kind: "codex", state: "ok" },
      ]),
    ).toBe(true);
    expect(LEAD_PROVIDERS.every((p) => p.runtime === "claude")).toBe(true);
  });

  test("offers the CLI sign-in last, since it needs a terminal on the server", () => {
    expect(LEAD_PROVIDERS.at(-1)?.auth).toBe("cli");
  });
});
