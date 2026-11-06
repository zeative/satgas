import { afterAll, beforeAll, expect, test } from "bun:test";
import { defaultSettings } from "../../src/server/settings";
import { clis, describeSystem } from "../../src/server/system";
import type { Settings } from "../../src/shared/settings";

const g = globalThis as { __satgasSettings?: Settings };
const before = g.__satgasSettings;

beforeAll(() => {
  const s = defaultSettings();
  g.__satgasSettings = {
    ...s,
    agents: { ...s.agents, claude: { ...s.agents.claude, tasks: true }, codex: { ...s.agents.codex, tasks: false } },
    mcpServers: [
      {
        id: "1",
        name: "github",
        catalogId: "github",
        enabled: true,
        transport: "http",
        url: "https://example.test/mcp",
        headers: { Authorization: "Bearer secret-token" },
      },
      { id: "2", name: "mine", enabled: true, transport: "stdio", command: "x", env: { KEY: "secret-env" } },
      { id: "3", name: "off", enabled: false, transport: "stdio", command: "y" },
    ],
  };
});

afterAll(() => {
  g.__satgasSettings = before;
});

test("finds the command-line tools on PATH", () => {
  // The tests themselves run on Bun, so it is always there.
  expect(clis()).toContain("bun (Bun)");
});

test("describes the agents, puts installed connectors first with what they cover, and never leaks a secret", () => {
  const text = describeSystem();
  expect(text).toContain("- Claude Code: on");
  expect(text).toContain("- Codex: off");
  expect(text).toContain("- github (GitHub): Repositories, issues, pull requests and Actions runs");
  expect(text).toContain("- mine: a custom connector");
  expect(text).not.toContain("- off");
  expect(text).toMatch(/Connectors in the catalog but not installed[^\n]*context7/);
  expect(text).not.toMatch(/Connectors in the catalog but not installed[^\n]*github/);
  expect(text.indexOf("Connectors the person installed")).toBeLessThan(text.indexOf("Command-line tools on PATH"));
  expect(text).not.toContain("secret");
});
