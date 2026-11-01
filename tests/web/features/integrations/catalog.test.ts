import { describe, expect, test } from "bun:test";
import { MCP_NAME, type Settings, sanitizeSettings } from "../../../../src/shared/settings";
import { byId, CATALOG, catalogOf, toServer } from "../../../../src/web/features/integrations/catalog";

const base: Settings = {
  agents: {
    claude: { tasks: true, provider: "claude", model: "", plannerModel: "sonnet", effort: "", permissionMode: "acceptEdits" },
    codex: { tasks: true, provider: "codex", model: "", effort: "", sandbox: "workspace-write" },
  },
  providers: {},
  mcpServers: [],
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
    const supabase = byId.get("supabase");
    if (!github || !supabase) throw new Error("missing entries");
    expect(toServer(github, { Authorization: " ghp_x " }, "a").headers).toEqual({ Authorization: "Bearer ghp_x" });
    expect(toServer(supabase, { SUPABASE_ACCESS_TOKEN: "sbp_x" }, "b").env).toEqual({ SUPABASE_ACCESS_TOKEN: "sbp_x" });
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

  test("servers saved before catalogId still match by name and command", () => {
    const pw = byId.get("playwright");
    if (!pw) throw new Error("missing entry");
    const { catalogId: _old, ...legacy } = toServer(pw, {}, "l");
    expect(catalogOf(legacy)).toBe(pw);
  });
});
