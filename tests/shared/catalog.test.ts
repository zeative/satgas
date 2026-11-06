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
};

describe("connector catalog", () => {
  test("ids are valid, unique server names", () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG) expect(MCP_NAME.test(c.id)).toBe(true);
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
    expect(toServer(c7, { CONTEXT7_API_KEY: "c7_x" }, "b").env).toEqual({ CONTEXT7_API_KEY: "c7_x" });
  });

  test("an optional secret left empty is simply omitted", () => {
    const c7 = byId.get("context7");
    if (!c7) throw new Error("missing entry");
    expect(toServer(c7, {}, "c").env).toEqual({});
  });

  test("a server added from the catalog remembers its entry and takes a free name", () => {
    const pw = byId.get("playwright");
    if (!pw) throw new Error("missing entry");
    const custom = { id: "c", name: "Playwright", enabled: true, transport: "stdio" as const, command: "node", args: ["my-mcp.js"] };
    const added = toServer(pw, {}, "a", [custom]);
    expect(added).toMatchObject({ name: "playwright-2", catalogId: "playwright" });
    expect(catalogOf(added)).toBe(pw);
  });

  test("a custom server that only shares a catalog name stays custom", () => {
    const custom = { id: "c", name: "playwright", enabled: true, transport: "stdio" as const, command: "node", args: ["my-mcp.js"] };
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
    const pw = byId.get("playwright");
    if (!pw) throw new Error("missing entry");
    const { catalogId: _old, ...legacy } = toServer(pw, {}, "l");
    expect(catalogOf(legacy)).toBe(pw);
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
