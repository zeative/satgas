import { describe, expect, test } from "bun:test";
import { byId, CATALOG, catalogOf, toServer } from "../../src/shared/catalog";
import { MCP_NAME, type Settings, sanitizeSettings } from "../../src/shared/settings";

const base: Settings = {
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

describe("connector catalog", () => {
  test("ids are valid, unique server names", () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG) expect(MCP_NAME.test(c.id)).toBe(true);
  });

  test("every entry has a full detail page: features in both languages, tools once each, real links", () => {
    for (const c of CATALOG) {
      expect(c.features.length).toBeGreaterThan(0);
      for (const f of c.features) expect([f.title.en, f.title.id, f.text.en, f.text.id].every(Boolean)).toBe(true);
      expect(c.tools.length).toBeGreaterThan(0);
      expect(new Set(c.tools).size).toBe(c.tools.length);
      expect(c.added).toMatch(/^\d{4}-\d{2}$/);
      for (const url of [c.site, c.docs, c.support, c.privacy]) if (url) expect(url).toStartWith("https://");
    }
  });

  test("every entry installs as a server the settings accept", () => {
    const servers = CATALOG.map((c, i) => toServer(c, Object.fromEntries((c.secrets ?? []).map((s) => [s.key, "secret-value"])), `id${i}`));
    const parsed = sanitizeSettings({ ...base, mcpServers: servers }, base);
    expect(typeof parsed).not.toBe("string");
  });

  test("secrets land where the server reads them, with their prefix", () => {
    const github = byId.get("github");
    const c7 = byId.get("context7");
    if (!github || !c7) throw new Error("missing entries");
    expect(toServer(github, { Authorization: " ghp_x " }, "a").headers).toEqual({ Authorization: "Bearer ghp_x" });
    expect(toServer(c7, { CONTEXT7_API_KEY: "c7_x" }, "b").headers).toEqual({ CONTEXT7_API_KEY: "c7_x" });
  });

  test("an optional secret left empty is simply omitted", () => {
    const c7 = byId.get("context7");
    if (!c7) throw new Error("missing entry");
    expect(toServer(c7, {}, "c").headers).toEqual({});
  });

  test("a server added from the catalog remembers its entry and takes a free name", () => {
    const c7 = byId.get("context7");
    if (!c7) throw new Error("missing entry");
    const custom = { id: "c", name: "Context7", enabled: true, transport: "stdio" as const, command: "node", args: ["my-mcp.js"] };
    const added = toServer(c7, {}, "a", [custom]);
    expect(added).toMatchObject({ name: "context7-2", catalogId: "context7" });
    expect(catalogOf(added)).toBe(c7);
    expect(toServer(c7, {}, "b", [], c7.oauthUrl).url).toBe("https://mcp.context7.com/mcp/oauth");
  });

  test("a custom server that only shares a catalog name stays custom", () => {
    const custom = { id: "c", name: "context7", enabled: true, transport: "stdio" as const, command: "node", args: ["my-mcp.js"] };
    expect(catalogOf(custom)).toBeUndefined();
  });

  test("an installed connector no longer in the catalog stays as a custom one", () => {
    const old = {
      id: "n",
      name: "notion",
      catalogId: "notion",
      enabled: true,
      transport: "stdio" as const,
      command: "npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
    };
    expect(catalogOf(old)).toBeUndefined();
    expect(typeof sanitizeSettings({ ...base, mcpServers: [old] }, base)).not.toBe("string");
  });

  test("servers saved before catalogId still match by name and command", () => {
    const c7 = byId.get("context7");
    if (!c7) throw new Error("missing entry");
    const { catalogId: _old, ...legacy } = toServer(c7, {}, "l");
    expect(catalogOf(legacy)).toBe(c7);
  });
});

test("a GitHub connector on the default endpoint moves to the one with every toolset; a custom URL stays", () => {
  const gh = (url: string, catalogId?: string) => ({
    id: "g",
    name: "github",
    ...(catalogId ? { catalogId } : {}),
    transport: "http",
    url,
    headers: {},
  });
  const parsed = sanitizeSettings(
    {
      ...base,
      mcpServers: [
        gh("https://api.githubcopilot.com/mcp/", "github"),
        { ...gh("https://api.githubcopilot.com/mcp/"), id: "h", name: "mine" },
      ],
    },
    base,
  );
  if (typeof parsed === "string") throw new Error(parsed);
  expect(parsed.mcpServers.map((s) => (s.transport === "http" ? s.url : ""))).toEqual([
    "https://api.githubcopilot.com/mcp/x/all",
    "https://api.githubcopilot.com/mcp/",
  ]);
  expect(byId.get("github")?.server).toEqual({ transport: "http", url: "https://api.githubcopilot.com/mcp/x/all" });
});
