import { afterAll, beforeAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { config } from "../../src/server/config";
import { plan, safeParse } from "../../src/server/planner";
import { defaultSettings } from "../../src/server/settings";
import { withAgent } from "../../src/shared/settings";
import type { PlanDraft } from "../../src/shared/types";
import { collector, jsonl, makeFakeCli, setFake } from "../helpers/fake-cli";

const original = config.claudeBin;
const originalCodex = config.codexBin;
let dir = "";
beforeAll(async () => {
  const fake = await makeFakeCli();
  dir = fake.dir;
  config.claudeBin = fake.bin;
  config.codexBin = fake.bin;
});
afterAll(async () => {
  config.claudeBin = original;
  config.codexBin = originalCodex;
  await rm(dir, { recursive: true, force: true });
});

test("the plan streams in as a draft while the lead writes it", async () => {
  const final = {
    title: "Cek repo",
    summary: "Rizky reads the repo",
    reply: "",
    questions: [],
    hires: [{ id: "rizky", name: "Rizky", role: "Developer", brief: "Careful.", agent: "claude" }],
    nodes: [{ id: "read", title: "Cek repo GitHub", member: "rizky", task: "Read it", dependsOn: [] }],
    board: [],
    setup: [],
  };
  const text = JSON.stringify(final);
  const cut = text.indexOf('"task"');
  setFake({
    FAKE_CLI_OUTPUT: jsonl(
      { type: "stream_event", event: { type: "content_block_start", index: 0 } },
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "Looking at what they asked" } },
      },
      { type: "stream_event", event: { type: "content_block_start", index: 1 } },
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: text.slice(0, cut) } },
      },
      { type: "result", subtype: "success", is_error: false, result: "", structured_output: final },
    ),
  });
  const drafts: Omit<PlanDraft, "round">[] = [];
  const result = await plan({
    mission: "cek repo",
    cwd: dir,
    signal: new AbortController().signal,
    ...collector(),
    onDraft: (d) => drafts.push(d),
  });
  expect(result.nodes.map((n) => n.title)).toEqual(["Cek repo GitHub"]);
  expect(drafts[0]?.thinking).toBe("Looking at what they asked");
  // The quick second update was held back, not dropped; stop() then keeps it from landing after the plan.
  expect(drafts).toHaveLength(1);
});

test("a draft held back lands a moment later while the lead is still writing", async () => {
  const final = { title: "T", summary: "Raka builds it", reply: "", questions: [], hires: [], nodes: [], board: [], setup: [] };
  const text = JSON.stringify(final);
  setFake({
    FAKE_CLI_OUTPUT: jsonl(
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: text.slice(0, 10) } },
      },
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: text.slice(10, 40) } },
      },
    ),
    FAKE_CLI_SLEEP: "600",
  });
  const drafts: Omit<PlanDraft, "round">[] = [];
  await plan({ mission: "x", cwd: dir, signal: new AbortController().signal, ...collector(), onDraft: (d) => drafts.push(d) }).catch(
    () => {},
  );
  expect(drafts.at(-1)?.summary).toBe("Raka builds it");
});

test("with an OpenAI model chosen the lead plans on Codex, answers in plain JSON and every task goes to Codex", async () => {
  const g = globalThis as { __satgasSettings?: unknown };
  const before = g.__satgasSettings;
  const base = defaultSettings();
  g.__satgasSettings = { ...base, agents: withAgent(base.agents, "codex", true) };
  const answer = {
    title: "Cek repo",
    summary: "Rizky reads the repo",
    reply: "",
    questions: [],
    hires: [{ id: "rizky", name: "Rizky", role: "Developer", brief: "Careful.", agent: "claude" }],
    nodes: [{ id: "read", title: "Cek repo", member: "rizky", task: "Read it", dependsOn: [] }],
    board: [],
    setup: [],
  };
  const args = `${dir}/args.txt`;
  const stdin = `${dir}/stdin.txt`;
  const reply = `Here is the plan:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``;
  setFake({
    FAKE_CLI_ARGS_OUT: args,
    FAKE_CLI_STDIN_OUT: stdin,
    FAKE_CLI_OUTPUT: jsonl(
      { type: "item.completed", item: { type: "agent_message", text: reply } },
      { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } },
    ),
  });
  try {
    const result = await plan({ mission: "cek repo", cwd: dir, signal: new AbortController().signal, ...collector() });
    expect(result.nodes.map((n) => n.agent)).toEqual(["codex"]);
    expect(result.usage?.output).toBe(5);
    const sent = await Bun.file(args).text();
    expect(sent).toContain("exec");
    expect(sent).toContain("read-only");
    expect(await Bun.file(stdin).text()).toContain("must match this JSON schema");
  } finally {
    g.__satgasSettings = before;
  }
});

test("a task whose answer left out its dependencies still plans", async () => {
  const g = globalThis as { __satgasSettings?: unknown };
  const before = g.__satgasSettings;
  const base = defaultSettings();
  g.__satgasSettings = { ...base, agents: withAgent(base.agents, "codex", true) };
  const answer = {
    title: "T",
    summary: "S",
    hires: [{ id: "a", name: "A", role: "Dev", brief: "b", agent: "codex" }],
    nodes: [{ id: "t", title: "T", member: "a", task: "Do it" }],
  };
  setFake({
    FAKE_CLI_OUTPUT: jsonl(
      { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(answer) } },
      { type: "turn.completed" },
    ),
  });
  try {
    const result = await plan({ mission: "x", cwd: dir, signal: new AbortController().signal, ...collector() });
    expect(result.nodes[0]?.dependsOn).toEqual([]);
  } finally {
    g.__satgasSettings = before;
  }
});

test("a plan wrapped in a sentence or a code fence still parses, and anything else does not", () => {
  expect(safeParse('{"a":1}')).toEqual({ a: 1 });
  expect(safeParse('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(safeParse("no plan here")).toBeUndefined();
});

test("a Codex lead whose answer is unusable gets one more try, told why, and a second failure stands", async () => {
  const g = globalThis as { __satgasSettings?: unknown };
  const before = g.__satgasSettings;
  const base = defaultSettings();
  g.__satgasSettings = { ...base, agents: withAgent(base.agents, "codex", true) };
  // Every attempt answers the same, so the attempts show in the usage the second run adds up.
  const said = (text: string) =>
    jsonl(
      { type: "item.completed", item: { type: "agent_message", text } },
      { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } },
    );
  const stdin = `${dir}/retry-stdin.txt`;
  try {
    setFake({ FAKE_CLI_OUTPUT: said("I cannot do that."), FAKE_CLI_STDIN_OUT: stdin });
    const { logs, onLog } = collector();
    await expect(plan({ mission: "x", cwd: dir, signal: new AbortController().signal, onLog })).rejects.toThrow(
      "did not return a valid plan",
    );
    expect(logs.some((l) => l.text.includes("trying again"))).toBe(true);
    expect(await Bun.file(stdin).text()).toContain("Your previous reply was rejected: The planner did not return a valid plan.");

    setFake({ FAKE_CLI_OUTPUT: said(JSON.stringify({ title: "T", summary: "S", reply: "", questions: [], hires: [], nodes: [] })) });
    await expect(plan({ mission: "x", cwd: dir, signal: new AbortController().signal, ...collector() })).rejects.toThrow(
      "The plan contains no tasks",
    );
  } finally {
    g.__satgasSettings = before;
  }
});
