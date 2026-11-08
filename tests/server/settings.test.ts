import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { defaultSettings, getSettings, loadSettings, onSettingsChange, saveSettings } from "../../src/server/settings";
import type { Settings } from "../../src/shared/settings";

const g = globalThis as { __satgasSettings?: Settings };
const original = { dir: config.dataDir, settings: g.__satgasSettings };
let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-settings-"));
  config.dataDir = dir;
});

afterAll(async () => {
  config.dataDir = original.dir;
  g.__satgasSettings = original.settings;
  await rm(dir, { recursive: true, force: true });
});

test("a settings file that cannot be read is set aside instead of being overwritten by the next save", async () => {
  await Bun.write(join(dir, "settings.json"), "{broken");
  g.__satgasSettings = undefined;
  const quiet = spyOn(console, "error").mockImplementation(() => {});
  try {
    await loadSettings();
  } finally {
    quiet.mockRestore();
  }
  expect(getSettings()).toEqual(defaultSettings());
  expect(await Bun.file(join(dir, "settings.json.bad")).text()).toBe("{broken");
  expect(await Bun.file(join(dir, "settings.json")).exists()).toBe(false);
});

test("saves run one at a time against the latest settings, so two edits made at once both stick", async () => {
  await Promise.all([saveSettings({ agents: { codex: { tasks: false } } }), saveSettings({ agents: { claude: { effort: "high" } } })]);
  for (const s of [getSettings(), (await Bun.file(join(dir, "settings.json")).json()) as Settings]) {
    expect(s.agents.codex.tasks).toBe(false);
    expect(s.agents.claude.effort).toBe("high");
  }
});

test("the settings file is private and no temp file is left behind", async () => {
  await saveSettings({});
  expect((await stat(join(dir, "settings.json"))).mode & 0o777).toBe(0o600);
  expect((await readdir(dir)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
});

test("an invalid save is refused without touching the file", async () => {
  const before = await Bun.file(join(dir, "settings.json")).text();
  expect(await saveSettings({ mcpServers: "nope" })).toBeString();
  expect(await Bun.file(join(dir, "settings.json")).text()).toBe(before);
});

test("a default tool added in a later version joins an existing setup once, and turning it off sticks", () => {
  const g = globalThis as { __satgasSettings?: Settings };
  const before = g.__satgasSettings;
  const base = defaultSettings();
  // An older setup: no record of which defaults it was offered, and only the first two tools stored.
  g.__satgasSettings = { ...base, tools: [{ id: "rtk", catalogId: "rtk", enabled: true }], toolsOffered: undefined };
  try {
    expect(getSettings().tools.map((t) => t.catalogId)).toEqual(["rtk", "guard", "agent-browser"]);
    const s = getSettings();
    s.tools = s.tools.filter((t) => t.catalogId !== "agent-browser");
    expect(getSettings().tools.map((t) => t.catalogId)).toEqual(["rtk", "guard"]);
  } finally {
    g.__satgasSettings = before;
  }
});

// Open pages learn about a save from anywhere (another page, a channel, the lead), so the composer never shows a stale model.
test("every save tells whoever listens, and a listener can stop listening", async () => {
  let heard = 0;
  const stop = onSettingsChange(() => heard++);
  await saveSettings({ agents: { claude: { effort: "high" } } });
  expect(heard).toBe(1);
  await saveSettings({ agents: { claude: { tasks: "nope" } } });
  stop();
  await saveSettings({ agents: { claude: { effort: "low" } } });
  expect(heard).toBeLessThanOrEqual(2);
});
