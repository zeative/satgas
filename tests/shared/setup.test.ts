import { expect, test } from "bun:test";
import type { Settings } from "../../src/shared/settings";
import { applyToSettings, cleanSetup, needsApproval } from "../../src/shared/setup";

const base: Settings = {
  agents: {
    claude: { tasks: true, provider: "claude", model: "", plannerModel: "", effort: "", permissionMode: "acceptEdits" },
    codex: { tasks: false, provider: "codex", model: "", effort: "", sandbox: "workspace-write" },
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
let n = 0;
const id = () => `id${++n}`;

test("only setup Satgas can make passes; the rest is reported back", () => {
  const { commands, skipped } = cleanSetup([
    { op: "connect", id: "context7" },
    { op: "connect", id: "not-in-catalog" },
    { op: "tool", id: "check", on: true },
    { op: "install-skills", repo: "vercel-labs/agent-skills" },
    { op: "install-skills", repo: "rm -rf /" },
    { op: "custom-connector", name: "mine", url: "http://insecure.test" },
    { op: "agent", agent: "codex", tasks: true },
    { op: "format-disk" },
  ]);
  expect(commands.map((c) => c.op)).toEqual(["connect", "tool", "install-skills", "agent"]);
  expect(skipped).toHaveLength(4);
  expect(commands.map(needsApproval)).toEqual([false, false, true, false]);
});

test("each change comes with the way back", () => {
  const added = applyToSettings(base, { op: "connect", id: "context7" }, id);
  if (typeof added === "string") throw new Error(added);
  expect(added.settings.mcpServers.map((m) => m.catalogId)).toEqual(["context7"]);
  const undone = applyToSettings(added.settings, added.undo[0] as never, id);
  if (typeof undone === "string") throw new Error(undone);
  expect(undone.settings.mcpServers[0]?.enabled).toBe(false);

  const tool = applyToSettings(base, { op: "tool", id: "check", on: true }, id);
  if (typeof tool === "string") throw new Error(tool);
  expect(tool.undo).toEqual([{ op: "tool", id: "check", on: false }]);

  const agent = applyToSettings(base, { op: "agent", agent: "codex", tasks: true }, id);
  if (typeof agent === "string") throw new Error(agent);
  expect(agent.settings.agents.codex.tasks).toBe(true);
  expect(agent.settings.agents.claude.tasks).toBe(false);
  expect(agent.undo).toEqual([{ op: "agent", agent: "codex", tasks: false }]);
});

test("a connector that signs in adds nothing until the person does", () => {
  expect(applyToSettings(base, { op: "connect", id: "monveo" }, id)).toMatchObject({ needsKey: "monveo", undo: [] });
});

test("a connector that needs a key adds nothing until the person types it", () => {
  const r = applyToSettings(base, { op: "connect", id: "github" }, id);
  if (typeof r === "string") throw new Error(r);
  expect(r.needsKey).toBe("github");
  expect(r.settings.mcpServers).toEqual([]);
  expect(applyToSettings(base, { op: "connector", name: "nope", on: true }, id)).toBeString();
});
