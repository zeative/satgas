import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { defaultSettings } from "../../../src/server/settings";
import { ATTRIBUTION, activeTools, codexHookArgs, describeTools, prepareToolHooks, removeToolHooks } from "../../../src/server/tools";
import type { Settings } from "../../../src/shared/settings";

const g = globalThis as { __satgasSettings?: Settings };
const before = g.__satgasSettings;

beforeAll(() => {
  g.__satgasSettings = {
    ...defaultSettings(),
    tools: [
      { id: "1", catalogId: "guard", enabled: true },
      { id: "2", catalogId: "check", enabled: true },
      { id: "3", catalogId: "format", enabled: false },
      { id: "4", enabled: true, name: "Missing", when: "edit", command: "x", needs: "satgas-no-such-bin" },
      { id: "5", enabled: true, name: "Bun", when: "available", needs: "bun", note: "bun is here for scripts." },
    ],
  };
});
afterAll(() => {
  g.__satgasSettings = before;
});

test("only tools that are on and installed take part", () => {
  expect(activeTools().map((t) => t.name)).toEqual(["Command guard", "Done check", "Bun"]);
});

test("hooks go to Claude Code as a private settings file and to Codex as config overrides", async () => {
  const h = await prepareToolHooks("codex");
  if (!h) throw new Error("expected hooks");
  try {
    expect(Object.keys(h.hooks)).toEqual(["PreToolUse", "PostToolUse", "Stop"]);
    expect(JSON.parse(await readFile(h.settingsPath, "utf8"))).toEqual({ hooks: h.hooks, attribution: ATTRIBUTION });
    expect((await stat(h.settingsPath)).mode & 0o777).toBe(0o600);
    expect(h.env.SATGAS_AGENT).toBe("codex");
    expect(JSON.parse(h.env.SATGAS_TOOLS ?? "[]").map((t: { name: string }) => t.name)).toEqual(["Command guard", "Done check"]);
    const args = codexHookArgs(h);
    expect(args).toContain("--dangerously-bypass-hook-trust");
    const pre = args.find((a) => a.startsWith("hooks.PreToolUse="));
    expect(pre).toStartWith('hooks.PreToolUse=[{ matcher = "Bash", hooks = [{ type = "command", command = ');
    expect(pre).toContain("hook.ts' command");
  } finally {
    await removeToolHooks(h);
  }
  expect(codexHookArgs(null)).toEqual([]);
});

test("a Claude Code model that cannot see gets the picture hooks even with no tools on; Codex never does", async () => {
  const kept = g.__satgasSettings;
  g.__satgasSettings = { ...defaultSettings(), tools: [] };
  const sight = { url: "http://127.0.0.1:4317/api/team", token: "tok" };
  try {
    expect(await prepareToolHooks("claude")).toBeNull();
    expect(await prepareToolHooks("codex", sight)).toBeNull();
    const h = await prepareToolHooks("claude", sight);
    if (!h) throw new Error("expected hooks");
    try {
      expect(h.hooks.PreToolUse?.map((g) => g.matcher)).toEqual(["Read"]);
      expect(h.hooks.PostToolUse?.map((g) => g.matcher)).toEqual(["mcp__.*"]);
      expect(h.hooks.PreToolUse?.[0]?.hooks[0]?.command).toEndWith(" see");
      expect(h.env).toMatchObject({ SATGAS_TEAM_URL: sight.url, SATGAS_TEAM_TOKEN: "tok" });
    } finally {
      await removeToolHooks(h);
    }
  } finally {
    g.__satgasSettings = kept;
  }
});

test("agents are told what runs around their work", () => {
  const text = describeTools() ?? "";
  expect(text).toContain("command guard blocks");
  expect(text).toContain("typecheck runs");
  expect(text).toContain("bun is here for scripts.");
  expect(text).not.toContain("Missing");
});
