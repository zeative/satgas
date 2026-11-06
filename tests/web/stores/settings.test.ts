import "../../helpers/browser";
import { afterAll, beforeEach, expect, test } from "bun:test";
import type { Settings } from "../../../src/shared/settings";

const { loadSettings, saveSettings, useSettings } = await import("../../../src/web/stores/settings");

// Each request waits until the test answers it, so the order responses arrive in is up to the test.
interface Call {
  method: string;
  body: Settings | null;
  answer: (status: number, body: unknown) => void;
}
let calls: Call[] = [];
// Every test file shares one process, so the real fetch comes back afterwards.
const realFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});
globalThis.fetch = ((_url: string, init?: RequestInit) =>
  new Promise<Response>((resolve) => {
    calls.push({
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
      answer: (status, body) => resolve(new Response(JSON.stringify(body), { status })),
    });
  })) as unknown as typeof fetch;

const tick = () => new Promise((r) => setTimeout(r, 0));
const withModel = (model: string): Settings => ({
  agents: {
    claude: { tasks: true, provider: "claude", model, plannerModel: "sonnet", effort: "", permissionMode: "acceptEdits" },
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
});
const model = () => useSettings.getState().settings?.agents.claude.model;

beforeEach(() => {
  calls = [];
  useSettings.setState({ settings: withModel("start"), error: null });
});

test("saves go out one at a time, in the order they were made", async () => {
  const a = saveSettings(withModel("a"));
  const b = saveSettings(withModel("b"));
  await tick();
  expect(calls.map((c) => c.body?.agents.claude.model)).toEqual(["a"]);
  calls[0]?.answer(200, withModel("a"));
  await tick();
  expect(calls.map((c) => c.body?.agents.claude.model)).toEqual(["a", "b"]);
  calls[1]?.answer(200, withModel("b"));
  expect(await a).toBeNull();
  expect(await b).toBeNull();
  expect(model()).toBe("b");
});

test("an older save's answer never overwrites a newer change on screen", async () => {
  saveSettings(withModel("a"));
  const b = saveSettings(withModel("b"));
  await tick();
  calls[0]?.answer(200, withModel("a"));
  await tick();
  expect(model()).toBe("b");
  calls[1]?.answer(200, withModel("b"));
  await b;
  expect(model()).toBe("b");
});

test("an older save failing after a newer change leaves the newer one in place", async () => {
  const a = saveSettings(withModel("a"));
  const b = saveSettings(withModel("b"));
  await tick();
  calls[0]?.answer(400, { error: "nope" });
  expect(await a).toBe("nope");
  await tick();
  expect(model()).toBe("b");
  calls[1]?.answer(200, withModel("b"));
  expect(await b).toBeNull();
  expect(model()).toBe("b");
  expect(calls.map((c) => c.method)).toEqual(["PUT", "PUT"]);
});

test("the newest save failing reads the server's settings back instead of guessing", async () => {
  const a = saveSettings(withModel("a"));
  await tick();
  calls[0]?.answer(500, {});
  expect(await a).toBe("Could not save the settings (500)");
  await tick();
  expect(calls.map((c) => c.method)).toEqual(["PUT", "GET"]);
  calls[1]?.answer(200, withModel("server"));
  await tick();
  expect(model()).toBe("server");
});

test("a read that started before a save never undoes it", async () => {
  const load = loadSettings();
  const save = saveSettings(withModel("a"));
  await tick();
  calls[0]?.answer(200, withModel("stale"));
  await load;
  expect(model()).toBe("a");
  await tick();
  calls[1]?.answer(200, withModel("a"));
  await save;
  expect(model()).toBe("a");
});
