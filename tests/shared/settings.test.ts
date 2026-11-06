import { describe, expect, test } from "bun:test";
import { maskSettings, restoreSecrets, SECRET_MASK, type Settings, sanitizeSettings, splitArgs } from "../../src/shared/settings";

const defaults: Settings = {
  agents: {
    claude: { tasks: true, provider: "claude", model: "", plannerModel: "sonnet", effort: "", permissionMode: "acceptEdits" },
    codex: { tasks: true, provider: "codex", model: "", effort: "", sandbox: "workspace-write" },
  },
  providers: {},
  mcpServers: [],
  tools: [],
  taskMinutes: 20,
  concurrency: 3,
  teamTalk: false,
  worktrees: true,
  commitStyle: { mode: "repo", instructions: "" },
  watchPulls: true,
  checkUpdates: true,
};

describe("sanitizeSettings", () => {
  test("keeps valid agent settings and servers, filling gaps from the defaults", () => {
    const out = sanitizeSettings(
      {
        agents: { codex: { tasks: false, sandbox: "read-only" } },
        mcpServers: [
          { id: "1", name: "playwright", transport: "stdio", command: "npx", args: ["-y", "@playwright/mcp"] },
          { id: "2", name: "docs", transport: "http", url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer x" } },
        ],
      },
      defaults,
    );
    expect(typeof out).not.toBe("string");
    const s = out as Settings;
    expect(s.agents.claude).toEqual(defaults.agents.claude);
    expect(s.agents.codex).toEqual({ tasks: false, provider: "codex", model: "", effort: "", sandbox: "read-only" });
    expect(s.mcpServers.map((m) => [m.name, m.transport, m.enabled])).toEqual([
      ["playwright", "stdio", true],
      ["docs", "http", true],
    ]);
  });

  test("ignores unknown modes instead of passing them to the CLIs", () => {
    const s = sanitizeSettings({ agents: { claude: { permissionMode: "yolo" }, codex: { sandbox: "everything" } } }, defaults) as Settings;
    expect(s.agents.claude.permissionMode).toBe("acceptEdits");
    expect(s.agents.codex.sandbox).toBe("workspace-write");
  });

  test("refuses names agents cannot use, duplicates, and servers without a way to start", () => {
    expect(sanitizeSettings({ mcpServers: [{ id: "1", name: "my server", transport: "stdio", command: "x" }] }, defaults)).toContain(
      "letters",
    );
    expect(
      sanitizeSettings(
        {
          mcpServers: [
            { id: "1", name: "a", transport: "stdio", command: "x" },
            { id: "2", name: "A", transport: "stdio", command: "y" },
          ],
        },
        defaults,
      ),
    ).toContain("Two servers");
    expect(sanitizeSettings({ mcpServers: [{ id: "1", name: "a", transport: "http", url: "ftp://x" }] }, defaults)).toContain("URL");
    expect(sanitizeSettings({ mcpServers: [{ id: "1", name: "a", transport: "stdio" }] }, defaults)).toContain("command");
    expect(
      sanitizeSettings({ mcpServers: [{ id: "1", name: "a", transport: "stdio", command: "x", env: { "bad key": "v" } }] }, defaults),
    ).toContain("environment");
  });
});

test("splits a command line into arguments, honoring quotes", () => {
  expect(splitArgs(`-y @playwright/mcp --browser "chrome beta" ''`)).toEqual(["-y", "@playwright/mcp", "--browser", "chrome beta", ""]);
  expect(splitArgs("   ")).toEqual([]);
});

test("keeps providers only for the right agent, and checks keys and endpoints", () => {
  const s = sanitizeSettings(
    {
      agents: { claude: { provider: "openai", effort: "max" }, codex: { provider: "groq", effort: "xhigh" } },
      providers: {
        groq: { key: " gsk_1 " },
        claude: { key: "ignored" },
        nope: { key: "x" },
        ollama: { baseUrl: "http://127.0.0.1:11434" },
      },
    },
    defaults,
  ) as Settings;
  expect(s.agents.claude.provider).toBe("claude");
  expect(s.agents.claude.effort).toBe("max");
  expect(s.agents.codex).toMatchObject({ provider: "groq", effort: "xhigh" });
  expect(s.providers).toEqual({ groq: { key: "gsk_1" }, ollama: { baseUrl: "http://127.0.0.1:11434" } });
  expect(sanitizeSettings({ providers: { ollama: { baseUrl: "file:///etc" } } }, defaults)).toBe(
    "Ollama: the endpoint must be an http(s) URL.",
  );
});

describe("secrets", () => {
  const stored = sanitizeSettings(
    {
      providers: { groq: { key: "gsk_real" }, ollama: { baseUrl: "http://127.0.0.1:11434" } },
      mcpServers: [
        {
          id: "gh",
          name: "github",
          catalogId: "github",
          transport: "http",
          url: "https://api.example.com/mcp",
          headers: { Authorization: "Bearer ghp_real" },
        },
        { id: "sb", name: "supabase", transport: "stdio", command: "npx", env: { SUPABASE_ACCESS_TOKEN: "sbp_real", EMPTY: "" } },
      ],
    },
    defaults,
  ) as Settings;

  test("the API view masks every key and env/header value, and keeps the rest", () => {
    const view = maskSettings(stored);
    expect(view.providers).toEqual({ groq: { key: SECRET_MASK }, ollama: { baseUrl: "http://127.0.0.1:11434" } });
    expect(view.mcpServers[0]?.headers).toEqual({ Authorization: SECRET_MASK });
    expect(view.mcpServers[1]?.env).toEqual({ SUPABASE_ACCESS_TOKEN: SECRET_MASK, EMPTY: "" });
    expect(view.mcpServers[0]?.url).toBe("https://api.example.com/mcp");
    expect(JSON.stringify(view)).not.toContain("_real");
    // The stored settings themselves stay untouched.
    expect(stored.providers.groq?.key).toBe("gsk_real");
  });

  test("a masked view sent back unchanged saves exactly what was stored", () => {
    const back = restoreSecrets(JSON.parse(JSON.stringify(maskSettings(stored))), stored);
    if (typeof back === "string") throw new Error(back);
    expect(sanitizeSettings(back.input, stored)).toEqual(stored);
  });

  test("a retyped value replaces the stored one; a removed entry is removed", () => {
    const view = maskSettings(stored);
    const edited = {
      ...view,
      providers: { groq: { key: "gsk_new" } },
      mcpServers: [
        { ...view.mcpServers[0], headers: { Authorization: "Bearer ghp_new" } },
        { ...view.mcpServers[1], env: {} },
      ],
    };
    const back = restoreSecrets(edited, stored);
    if (typeof back === "string") throw new Error(back);
    const saved = sanitizeSettings(back.input, stored) as Settings;
    expect(saved.providers).toEqual({ groq: { key: "gsk_new" } });
    expect(saved.mcpServers[0]?.headers).toEqual({ Authorization: "Bearer ghp_new" });
    expect(saved.mcpServers[1]?.env).toEqual({});
  });

  test("a provider sent without its key keeps the stored key", () => {
    const back = restoreSecrets({ providers: { groq: {} } }, stored);
    if (typeof back === "string") throw new Error(back);
    expect((sanitizeSettings(back.input, stored) as Settings).providers).toEqual({ groq: { key: "gsk_real" } });
  });

  test("a mask with nothing stored behind it is refused, not saved as the literal mask", () => {
    const renamed = { mcpServers: [{ id: "sb", name: "supabase", transport: "stdio", command: "npx", env: { TOKEN: SECRET_MASK } }] };
    expect(restoreSecrets(renamed, stored)).toContain("`TOKEN`");
    const unknown = { mcpServers: [{ id: "new", name: "x", transport: "stdio", command: "npx", env: { A: SECRET_MASK } }] };
    expect(typeof restoreSecrets(unknown, stored)).toBe("string");
  });
});

test("keeps the catalog entry a server came from, and drops one that is not a valid id", () => {
  const s = sanitizeSettings(
    {
      mcpServers: [
        { id: "1", name: "playwright-2", catalogId: "playwright", transport: "stdio", command: "npx" },
        { id: "2", name: "mine", catalogId: "not valid!", transport: "stdio", command: "npx" },
      ],
    },
    defaults,
  ) as Settings;
  expect(s.mcpServers.map((m) => m.catalogId)).toEqual(["playwright", undefined]);
});

test("tasks at once only takes a value from the list", () => {
  const ok = sanitizeSettings({ concurrency: 6 }, defaults);
  const bad = sanitizeSettings({ concurrency: 500 }, defaults);
  expect(typeof ok === "object" && ok.concurrency).toBe(6);
  expect(typeof bad === "object" && bad.concurrency).toBe(3);
});
