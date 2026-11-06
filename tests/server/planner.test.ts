import { afterAll, beforeAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { config } from "../../src/server/config";
import { plan } from "../../src/server/planner";
import type { PlanDraft } from "../../src/shared/types";
import { collector, jsonl, makeFakeCli, setFake } from "../helpers/fake-cli";

const original = config.claudeBin;
let dir = "";
beforeAll(async () => {
  const fake = await makeFakeCli();
  dir = fake.dir;
  config.claudeBin = fake.bin;
});
afterAll(async () => {
  config.claudeBin = original;
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
