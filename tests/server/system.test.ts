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
  expect(text).toContain("- github (GitHub): Repos, issues, pull requests and Actions");
  expect(text).toContain("- mine: a custom connector");
  expect(text).not.toContain("- off");
  expect(text).toMatch(/Connectors in the catalog but not installed[^\n]*context7/);
  expect(text).not.toMatch(/Connectors in the catalog but not installed[^\n]*github/);
  expect(text.indexOf("Connectors the person installed")).toBeLessThan(text.indexOf("Local command-line tools on PATH"));
  expect(text).toContain("reached only through connectors");
  expect(text).not.toMatch(/Local command-line tools on PATH[^\n]*\bgh\b/);
  expect(text).not.toContain("secret");
});

test("the lead knows Satgas itself: its version, where it runs, its pages and where the guide is", async () => {
  const { describeSatgas } = await import("../../src/server/system");
  const pkg = (await import("../../package.json")).default;
  const about = describeSatgas();
  expect(about).toContain(`Satgas ${pkg.version}`);
  expect(about).toContain("AGPL-3.0");
  for (const page of ["Home", "Pipeline", "Schedules", "Memory", "Integrations", "Configurations"]) expect(about).toContain(page);
  for (const tab of ["Connectors", "Providers", "Skills", "Tools"]) expect(about).toContain(tab);
  expect(about).toContain("reference/satgas-guide.md");
  expect(about).toContain("never by searching the web");
  expect(describeSystem().indexOf("<satgas_about>")).toBe(0);
});

test("the satgas skill carries the README as its guide, so a binary or a container has it too", async () => {
  const { BUILTIN, guideOf } = await import("../../src/server/builtin-skills");
  const readme = await Bun.file(new URL("../../README.md", import.meta.url)).text();
  const guide = BUILTIN.satgas?.["reference/satgas-guide.md"] ?? "";
  expect(guide).toBe(guideOf(readme));
  expect(guide).toContain("## Self-hosting");
  expect(guide).toContain("](https://github.com/zeative/satgas/blob/main/CONTRIBUTING.md)");
  expect(guide).not.toMatch(/\]\((?![a-z]+:|#)[\w./-]+\)/);
});
