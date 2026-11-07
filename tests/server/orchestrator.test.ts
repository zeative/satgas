import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { undoEdit } from "../../src/server/edits";
import {
  answerRun,
  approveTask,
  cancelRun,
  continueRun,
  continueTask,
  isLive,
  queuePrompt,
  resumeAfterConnect,
  startRun,
  unqueuePrompt,
} from "../../src/server/orchestrator";
import { getSettings, saveSettings } from "../../src/server/settings";
import { decideSetup, undoSetup } from "../../src/server/setup";
import { boardOps, flushAll, getRun, patchRun } from "../../src/server/store";
import { jsonl, makeFakeCli, setFake } from "../helpers/fake-cli";

const original = { bin: config.claudeBin, codexBin: config.codexBin, dataDir: config.dataDir };
let dir = "";
let cli = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-orchestrator-"));
  await mkdir(join(dir, "runs"), { recursive: true });
  config.dataDir = dir;
  const fake = await makeFakeCli();
  cli = fake.dir;
  config.claudeBin = fake.bin;
  config.codexBin = fake.bin;
});

afterAll(async () => {
  // Saves still waiting on their timer would otherwise land in the real data folder.
  await flushAll();
  config.claudeBin = original.bin;
  config.codexBin = original.codexBin;
  config.dataDir = original.dataDir;
  await rm(dir, { recursive: true, force: true });
  await rm(cli, { recursive: true, force: true });
});

const planned = (plan: object) => jsonl({ type: "result", subtype: "success", is_error: false, result: "", structured_output: plan });
const platform = {
  header: "Platform",
  question: "Which platform first?",
  multiSelect: false,
  options: [
    { label: "TikTok", description: "Short vertical video" },
    { label: "YouTube", description: "Long-form explainers" },
  ],
};
const asking = planned({ title: "Video channel", summary: "Start one", reply: "", questions: [platform], nodes: [] });

// Generous on purpose: real CLI processes start here, and a loaded machine makes them slow, not wrong.
setDefaultTimeout(30_000);
async function until(check: () => boolean, ms = 20_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await Bun.sleep(20);
  }
}

test("asks before planning, then plans once with the answers", async () => {
  setFake({ FAKE_CLI_OUTPUT: asking });
  const { id } = startRun("Start a video channel", dir);
  await until(() => getRun(id)?.status === "asking");
  expect(getRun(id)?.asks?.[0]?.questions.map((q) => q.header)).toEqual(["Platform"]);
  expect(getRun(id)?.title).toBe("Video channel");

  expect(answerRun(id, [{ picked: ["Instagram"] }])).toBe("invalid");
  const stdin = join(cli, "stdin.txt");
  const args = join(cli, "args.json");
  setFake({
    FAKE_CLI_STDIN_OUT: stdin,
    FAKE_CLI_ARGS_OUT: args,
    FAKE_CLI_OUTPUT: planned({ title: "Video channel", summary: "Start one", reply: "TikTok first, then.", nodes: [] }),
  });
  expect(answerRun(id, [{ picked: ["TikTok"], own: "  reels later " }])).toBe("ok");
  expect(answerRun(id, [{ picked: ["TikTok"] }])).toBe("busy");
  await until(() => getRun(id)?.status === "done");

  const run = getRun(id);
  expect(run?.asks?.[0]?.answers).toEqual([{ picked: ["TikTok"], own: "reels later" }]);
  expect(run?.answers?.[0]).toBe("TikTok first, then.");
  expect(await Bun.file(stdin).text()).toContain("they answered:\n- Which platform first?\n  TikTok; reels later");
  // The second pass cannot ask again: its schema has no questions.
  const argv: string[] = await Bun.file(args).json();
  expect(argv[argv.indexOf("--json-schema") + 1]).not.toContain("questions");
  expect(answerRun(id, [{ picked: ["TikTok"] }])).toBe("closed");
});

test("setting the questions aside stops the round", async () => {
  setFake({ FAKE_CLI_OUTPUT: asking });
  const { id } = startRun("Start a video channel", dir);
  await until(() => getRun(id)?.status === "asking");
  expect(cancelRun(id)).toBe(true);
  expect(getRun(id)?.status).toBe("cancelled");
  expect(answerRun(id, [{ picked: ["TikTok"] }])).toBe("closed");
  expect(cancelRun(id)).toBe(false);
});

test("a planner that only offers catch-all options gets no questions through", async () => {
  const vague = {
    ...platform,
    options: [
      { label: "TikTok", description: "" },
      { label: "Other", description: "" },
    ],
  };
  setFake({ FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "", questions: [vague], nodes: [] }) });
  const { id } = startRun("Start a video channel", dir);
  await until(() => getRun(id)?.status === "failed");
  expect(getRun(id)?.error).toBe("The plan contains no tasks.");
  expect(getRun(id)?.asks).toBeUndefined();
});

test("/ask makes the planner ask first, and the lookup is kept for the round", async () => {
  const args = join(cli, "ask-args.json");
  const stdin = join(cli, "ask-stdin.txt");
  setFake({ FAKE_CLI_OUTPUT: asking, FAKE_CLI_ARGS_OUT: args, FAKE_CLI_STDIN_OUT: stdin });
  const { id } = startRun("/ask /claude Start a video channel", dir);
  await until(() => getRun(id)?.status === "asking");
  const argv: string[] = await Bun.file(args).json();
  const schema = JSON.parse(argv[argv.indexOf("--json-schema") + 1] ?? "{}");
  expect(schema.properties.questions.minItems).toBe(1);
  expect(schema.properties.nodes.maxItems).toBe(0);
  expect(argv.join(" ")).toContain('always use "claude"; the user picked it');
  expect(await Bun.file(stdin).text()).toContain("The user typed /ask");
  expect(getRun(id)?.refs?.[0]).toEqual({ ask: true, only: "claude" });
  cancelRun(id);
});

test("a board the person renamed keeps its name when the planner names it again", async () => {
  setFake({ FAKE_CLI_OUTPUT: asking });
  const { id } = startRun("Start a video channel", dir);
  await until(() => getRun(id)?.status === "asking");
  patchRun(id, { title: "Channel Just Media", named: true });
  setFake({ FAKE_CLI_OUTPUT: planned({ title: "Planner name", summary: "New summary", reply: "Done.", nodes: [] }) });
  expect(answerRun(id, [{ picked: ["TikTok"] }])).toBe("ok");
  await until(() => getRun(id)?.status === "done");
  expect(getRun(id)?.title).toBe("Channel Just Media");
  expect(getRun(id)?.summary).toBe("New summary");
});

test("hires the people a plan needs, and their tasks take the member's role", async () => {
  const stdin = join(cli, "team-stdin.txt");
  setFake({
    FAKE_CLI_STDIN_OUT: stdin,
    FAKE_CLI_OUTPUT: planned({
      title: "Promo page",
      summary: "Nadia designs it",
      reply: "",
      questions: [],
      hires: [{ id: "nadia", name: "Nadia", role: "Designer", brief: "Warm palettes.", agent: "claude" }],
      nodes: [{ id: "palette", title: "Palette", member: "nadia", task: "Pick colours", dependsOn: [] }],
    }),
  });
  const { id } = startRun("Make a promo page", dir);
  await until(() => getRun(id)?.status === "done" || getRun(id)?.status === "failed");
  const run = getRun(id);
  expect(run?.team?.map((m) => [m.id, m.name, m.role, m.round])).toEqual([["nadia", "Nadia", "Designer", 0]]);
  expect(run?.nodes[0]).toMatchObject({ member: "nadia", role: "Designer" });
  // The lead's plan line for the round is kept for the bubble beside the lead.
  expect(run?.plans?.[0]).toBe("Nadia designs it");
  // The task's own prompt names the person and carries their standing brief.
  expect(await Bun.file(stdin).text()).toContain("You are Nadia, the Designer on this team.");
});

test("a plan that gives work to someone not on the team fails instead of running it", async () => {
  setFake({
    FAKE_CLI_OUTPUT: planned({
      title: "T",
      summary: "S",
      reply: "",
      questions: [],
      hires: [],
      nodes: [{ id: "x", title: "X", member: "ghost", task: "Do it", dependsOn: [] }],
    }),
  });
  const { id } = startRun("Do something", dir);
  await until(() => getRun(id)?.status === "failed");
  expect(getRun(id)?.error).toContain("ghost");
});

test("the lead clears the canvas itself, and the person can undo it from the chat", async () => {
  const stdin = join(cli, "edit-stdin.txt");
  setFake({ FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "Halo.", questions: [], hires: [], nodes: [] }) });
  const { id } = startRun("halo", dir);
  await until(() => getRun(id)?.status === "done");
  const note = (cid: string, locked = false) => ({ id: cid, kind: "note" as const, x: 0, y: 0, w: 100, h: 80, createdAt: 1, locked });
  boardOps(id, [
    { op: "put", card: note("a") },
    { op: "put", card: note("b", true) },
    { op: "put", card: note("c") },
  ]);

  setFake({
    FAKE_CLI_STDIN_OUT: stdin,
    FAKE_CLI_OUTPUT: planned({
      title: "T",
      summary: "S",
      reply: "Semua kartu dihapus.",
      questions: [],
      hires: [],
      nodes: [],
      board: [{ op: "delete", all: true }],
    }),
  });
  expect(continueRun(id, "hapus semua node")).toBe("ok");
  await until(() => getRun(id)?.status === "done" && !!getRun(id)?.edits?.[1]);
  // The lead saw the cards by id before deciding.
  expect(await Bun.file(stdin).text()).toContain("- a note");
  expect(getRun(id)?.board?.cards.map((c) => c.id)).toEqual(["b"]);
  expect(getRun(id)?.edits?.[1]?.counts.removed).toBe(2);
  expect(getRun(id)?.answers?.[1]).toBe("Semua kartu dihapus.");

  expect(undoEdit(id, 1)).toBe("ok");
  expect(
    getRun(id)
      ?.board?.cards.map((c) => c.id)
      .sort(),
  ).toEqual(["a", "b", "c"]);
  expect(undoEdit(id, 1)).toBe("done");
});

// The lead's quick answer to a message sent mid-work: what it says, who hears it, and whether it is new work.
const aside = (reply: string, later: boolean, tell: string[] = []) => planned({ reply, tell, later });

test("a message sent while the team works is answered by the lead at once, and new work runs as the next round", async () => {
  const reply = (text: string) => planned({ title: "T", summary: "S", reply: text, questions: [], hires: [], nodes: [] });
  setFake({
    FAKE_CLI_OUTPUT: reply("Halo."),
    FAKE_CLI_SLEEP: "400",
    FAKE_CLI_ASIDE_OUTPUT: aside("Siap, setelah ini saya kerjakan.", true),
  });
  const { id } = startRun("halo", dir);
  expect(isLive(id)).toBe(true);
  expect(queuePrompt(id, "gajadi")).toBe("ok");
  expect(getRun(id)?.queue?.[0]).toMatchObject({ prompt: "gajadi", reading: true });
  await until(() => getRun(id)?.queue?.[0]?.reply === "Siap, setelah ini saya kerjakan.");
  setFake({ FAKE_CLI_OUTPUT: reply("Oke, dibatalkan.") });
  await until(() => getRun(id)?.rounds?.length === 1 && getRun(id)?.status === "done");
  expect(getRun(id)?.rounds).toEqual(["gajadi"]);
  // Cleared as an empty list, which survives the JSON that carries live updates (undefined would not).
  expect(JSON.parse(JSON.stringify(getRun(id)?.queue))).toEqual([]);
  expect(getRun(id)?.replies?.[1]).toEqual(["Siap, setelah ini saya kerjakan."]);
  expect(getRun(id)?.answers?.[1]).toBe("Oke, dibatalkan.");
});

test("a question sent while the team works is answered then and there, with no new round", async () => {
  setFake({
    FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "Halo.", questions: [], hires: [], nodes: [] }),
    FAKE_CLI_SLEEP: "400",
    FAKE_CLI_ASIDE_OUTPUT: aside("Masih jalan, sebentar lagi selesai.", false),
  });
  const { id } = startRun("halo", dir);
  queuePrompt(id, "udah sampai mana?");
  await until(() => !getRun(id)?.queue?.length && getRun(id)?.status === "done");
  expect(getRun(id)?.asides?.[0]).toMatchObject([{ prompt: "udah sampai mana?", reply: "Masih jalan, sebentar lagi selesai." }]);
  expect(getRun(id)?.rounds ?? []).toEqual([]);
});

test("a queued message can be taken back before it starts", async () => {
  setFake({
    FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "Halo.", questions: [], hires: [], nodes: [] }),
    FAKE_CLI_SLEEP: "300",
  });
  const { id } = startRun("halo", dir);
  queuePrompt(id, "nanti saja");
  const item = getRun(id)?.queue?.[0]?.id ?? "";
  expect(unqueuePrompt(id, item)).toBe(true);
  await until(() => getRun(id)?.status === "done");
  expect(getRun(id)?.rounds ?? []).toEqual([]);
  expect(unqueuePrompt(id, item)).toBe(false);
});

test("a message sent while a Claude task works reaches it mid-task, and the lead then plans only what is left", async () => {
  const heardFile = join(cli, "heard.json");
  const leadStdin = join(cli, "steer-lead.txt");
  setFake({
    FAKE_CLI_OUTPUT: planned({
      title: "T",
      summary: "S",
      reply: "",
      questions: [],
      hires: [{ id: "raka", name: "Raka", role: "Developer", brief: "Builds.", agent: "claude" }],
      nodes: [{ id: "build", title: "Build", member: "raka", task: "Build it", dependsOn: [] }],
    }),
    FAKE_CLI_HEARD_OUT: heardFile,
    FAKE_CLI_HEAR_MS: "3000",
  });
  const { id } = startRun("Build a page", dir);
  await until(() => getRun(id)?.nodes[0]?.status === "running");
  expect(queuePrompt(id, "Tambahkan dark mode")).toBe("ok");
  // It reaches the task as soon as the CLI's inbox opens, however long a busy machine takes to start it.
  await until(() => getRun(id)?.queue?.[0]?.heard?.includes("Raka") === true);
  expect(getRun(id)?.queue?.[0]?.heard).toEqual(["Raka"]);
  // Once it reached someone, it is part of their work and can no longer be taken back.
  expect(unqueuePrompt(id, getRun(id)?.queue?.[0]?.id ?? "")).toBe(false);
  setFake({
    FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "Raka sudah menambahkan dark mode.", questions: [], hires: [], nodes: [] }),
    FAKE_CLI_STDIN_OUT: leadStdin,
  });
  await until(() => getRun(id)?.rounds?.length === 1 && getRun(id)?.status === "done");
  expect(JSON.parse(await Bun.file(heardFile).text())[0]).toContain("Tambahkan dark mode");
  expect(await Bun.file(leadStdin).text()).toContain("it already reached Raka mid-task");
  expect(getRun(id)?.answers?.[1]).toBe("Raka sudah menambahkan dark mode.");
});

test("several messages sent during one round run together as one next round", async () => {
  setFake({
    FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "Halo.", questions: [], hires: [], nodes: [] }),
    FAKE_CLI_SLEEP: "500",
    FAKE_CLI_ASIDE_OUTPUT: aside("Nanti saya kerjakan.", true),
  });
  const { id } = startRun("halo", dir);
  queuePrompt(id, "satu");
  queuePrompt(id, "dua");
  await until(() => getRun(id)?.queue?.every((q) => q.reply) === true);
  setFake({
    FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "Oke.", questions: [], hires: [], nodes: [] }),
    FAKE_CLI_ASIDE_OUTPUT: aside("Nanti saya kerjakan.", true),
  });
  await until(() => getRun(id)?.rounds?.length === 1 && getRun(id)?.status === "done");
  expect(getRun(id)?.rounds).toEqual(["satu\n\ndua"]);
});

test("a task the provider refuses is not retried on another agent, and the reason stays on the task", async () => {
  setFake({
    FAKE_CLI_OUTPUT: planned({
      title: "Issues",
      summary: "Rafi maps them",
      reply: "",
      questions: [],
      hires: [{ id: "rafi", name: "Rafi", role: "Analyst", brief: "Careful.", agent: "claude" }],
      nodes: [{ id: "map", title: "Map the issues", member: "rafi", task: "Map every issue", dependsOn: [] }],
    }),
    FAKE_CLI_WORKER_OUTPUT: jsonl({
      type: "result",
      subtype: "success",
      is_error: true,
      result: 'API Error: 400 {"code":"InvalidParameter","message":"Input data may contain inappropriate content."}',
    }),
  });
  const { id } = startRun("Map the issues of the jailbreaks repo", dir);
  await until(() => getRun(id)?.status === "done" || getRun(id)?.status === "failed");
  const node = getRun(id)?.nodes.find((n) => n.id === "map");
  expect(node).toMatchObject({ status: "failed", agent: "claude", recovery: { kind: "refused", from: "claude" } });
  expect(node?.recovery?.to).toBeUndefined();
});

test("a request that waited for a connector runs by itself once it is connected, and only once", async () => {
  const g = globalThis as { __satgasSettings?: unknown };
  const before = g.__satgasSettings;
  const leadOnly = { title: "Canva", summary: "", reply: "Connect it first.", questions: [], hires: [], nodes: [], board: [] };
  setFake({ FAKE_CLI_OUTPUT: planned({ ...leadOnly, setup: [{ op: "connect", id: "github" }] }) });
  try {
    const { id } = startRun("cek github saya", dir);
    await until(() => getRun(id)?.status === "done" || getRun(id)?.status === "failed");
    expect(getRun(id)?.setups?.[0]?.keys).toEqual(["github"]);
    expect(resumeAfterConnect(id, 0)).toBe(false);

    const server = {
      id: "g",
      name: "github",
      catalogId: "github",
      enabled: true,
      transport: "http" as const,
      url: "https://example.com/mcp",
      headers: {},
    };
    await saveSettings({ ...getSettings(), mcpServers: [...getSettings().mcpServers, server] });
    setFake({ FAKE_CLI_OUTPUT: planned(leadOnly) });
    expect(resumeAfterConnect(id, 0)).toBe(true);
    expect(getRun(id)?.rounds).toEqual(["cek github saya"]);
    expect(getRun(id)?.origins?.[1]).toEqual({ kind: "connect", label: "GitHub" });
    await until(() => getRun(id)?.status === "done" || getRun(id)?.status === "failed");
    expect(resumeAfterConnect(id, 0)).toBe(false);
    expect(getRun(id)?.rounds).toHaveLength(1);
  } finally {
    g.__satgasSettings = before;
  }
});

test("the lead changes setup from a message: known changes apply with Undo, outside code waits for Allow", async () => {
  const g = globalThis as { __satgasSettings?: unknown };
  const before = g.__satgasSettings;
  setFake({
    FAKE_CLI_OUTPUT: planned({
      title: "Setup",
      summary: "Switch on the done check",
      reply: "Done check is on; the skills wait for your Allow.",
      questions: [],
      hires: [],
      nodes: [],
      board: [],
      setup: [
        { op: "tool", id: "check", on: true },
        { op: "install-skills", repo: "someone/skills" },
        { op: "connect", id: "github" },
      ],
    }),
  });
  try {
    const { id } = startRun("nyalakan done check dan pasang skill dari someone/skills, sambungkan github", dir);
    await until(() => getRun(id)?.status === "done" || getRun(id)?.status === "failed");
    const rec = getRun(id)?.setups?.[0];
    expect(rec?.applied).toEqual([{ op: "tool", id: "check", on: true }]);
    expect(rec?.pending.map((p) => [p.cmd.op, p.state])).toEqual([["install-skills", "waiting"]]);
    expect(rec?.keys).toEqual(["github"]);
    expect(getSettings().tools.some((t) => t.catalogId === "check" && t.enabled)).toBe(true);

    expect(await decideSetup(id, 0, 0, false)).toBeNull();
    expect(getRun(id)?.setups?.[0]?.pending[0]?.state).toBe("skipped");
    expect(await undoSetup(id, 0)).toBeNull();
    expect(getSettings().tools.some((t) => t.catalogId === "check" && t.enabled)).toBe(false);
    expect(getRun(id)?.setups?.[0]?.undone).toBe(true);
  } finally {
    g.__satgasSettings = before;
  }
});

test("a stopped task continues in its own session, remembering what it did", async () => {
  const args = join(cli, "continue-args.json");
  const stdin = join(cli, "continue-stdin.txt");
  setFake({
    FAKE_CLI_OUTPUT: planned({
      title: "Fix",
      summary: "Raka fixes it",
      reply: "",
      questions: [],
      hires: [{ id: "raka", name: "Raka", role: "Developer", brief: "Careful.", agent: "claude" }],
      nodes: [{ id: "fix", title: "Fix the bug", member: "raka", task: "Fix it", dependsOn: [], access: "read" }],
    }),
    FAKE_CLI_WORKER_OUTPUT: jsonl(
      { type: "system", subtype: "init", model: "m", session_id: "sess-1" },
      { type: "result", subtype: "success", is_error: true, result: "Tests failed: 2 of 9" },
    ),
    FAKE_CLI_ARGS_OUT: args,
  });
  const { id } = startRun("fix the bug", dir);
  await until(() => getRun(id)?.status === "failed");
  const first = getRun(id)?.nodes.find((n) => n.id === "fix");
  expect(first).toMatchObject({ status: "failed", session: "sess-1", access: "read" });
  // A read-only task never gets the file-editing tools.
  expect(JSON.parse(await Bun.file(args).text())).toContain("--disallowedTools");

  setFake({
    FAKE_CLI_WORKER_OUTPUT: jsonl({ type: "result", subtype: "success", is_error: false, result: "Fixed; all 9 pass." }),
    FAKE_CLI_ARGS_OUT: args,
    FAKE_CLI_STDIN_OUT: stdin,
  });
  expect(continueTask(id, "fix", "the two failures are in date parsing")).toBe("ok");
  expect(continueTask(id, "fix")).toBe("busy");
  await until(() => getRun(id)?.status === "done");
  const argv = JSON.parse(await Bun.file(args).text()) as string[];
  expect(argv[argv.indexOf("--resume") + 1]).toBe("sess-1");
  expect(await Bun.file(stdin).text()).toBe("the two failures are in date parsing");
  expect(getRun(id)?.nodes.find((n) => n.id === "fix")).toMatchObject({ status: "done", output: "Fixed; all 9 pass." });
});

test("a waiting message can be reworded and moved; one a teammate already got cannot be reworded", async () => {
  const { editQueued, moveQueued } = await import("../../src/server/orchestrator");
  const run = startRun("x", dir);
  await until(() => !isLive(run.id));
  patchRun(run.id, {
    queue: [
      { id: "a", prompt: "first", at: 1 },
      { id: "b", prompt: "second", at: 2 },
      { id: "c", prompt: "heard", at: 3, sent: ["n1"] },
    ],
  });
  expect(editQueued(run.id, "a", "  first, reworded ")).toBe(true);
  expect(editQueued(run.id, "c", "nope")).toBe(false);
  expect(editQueued(run.id, "a", "   ")).toBe(false);
  expect(moveQueued(run.id, "b", "a")).toBe(true);
  expect(getRun(run.id)?.queue?.map((q) => q.id)).toEqual(["b", "a", "c"]);
  expect(moveQueued(run.id, "b")).toBe(true);
  expect(getRun(run.id)?.queue?.map((q) => q.id)).toEqual(["a", "c", "b"]);
  expect(moveQueued(run.id, "a", "missing")).toBe(false);
  expect(getRun(run.id)?.queue?.[0]?.prompt).toBe("first, reworded");
  patchRun(run.id, { queue: [] });
});

test("cards selected on the canvas ride along with a message and reach the plan as pointed at", async () => {
  setFake({ FAKE_CLI_OUTPUT: planned({ title: "t", summary: "s", reply: "Done", nodes: [] }) });
  const run = startRun("x", dir);
  await until(() => !isLive(run.id));
  boardOps(run.id, [
    { op: "put", card: { id: "tbl", kind: "table", x: 0, y: 0, w: 200, h: 100, title: "Prices", rows: [["a"]], createdAt: 1 } },
  ]);
  expect(continueRun(run.id, "tidy the price column", [], undefined, [], undefined, ["tbl", "gone"])).toBe("ok");
  await until(() => !isLive(run.id));
  expect(getRun(run.id)?.selected?.[1]).toEqual(["tbl"]);
  expect(getRun(run.id)?.refs?.[1]?.cards).toEqual(["tbl"]);
});

test("a picture selected on the canvas reaches the round as an attached file, kept for answers to resume", async () => {
  setFake({ FAKE_CLI_OUTPUT: planned({ title: "t", summary: "s", reply: "Done", nodes: [] }) });
  const run = startRun("x", dir);
  await until(() => !isLive(run.id));
  await writeFile(join(dir, "shot.png"), "bytes");
  boardOps(run.id, [
    {
      op: "put",
      card: {
        id: "pic",
        kind: "image",
        x: 0,
        y: 0,
        w: 200,
        h: 100,
        title: "shot.png",
        src: `/api/runs/${run.id}/files/shot.png`,
        createdAt: 1,
      },
    },
  ]);
  expect(continueRun(run.id, "use this picture", [], undefined, [], undefined, ["pic"])).toBe("ok");
  await until(() => !isLive(run.id));
  expect(getRun(run.id)?.refs?.[1]).toMatchObject({ cards: ["pic"], media: { pic: "shot.png" } });
  expect(getRun(run.id)?.files?.[1]).toEqual(["shot.png"]);
});

test("a task held for approval waits for the Allow; a No fails it with the reason and skips what builds on it", async () => {
  const held = (approval: string) =>
    planned({
      title: "Release",
      summary: "Ship it",
      reply: "",
      questions: [],
      hires: [{ id: "rio", name: "Rio", role: "Release", brief: "", agent: "claude" }],
      nodes: [
        { id: "push", title: "Push the tag", member: "rio", task: "Push", dependsOn: [], approval },
        { id: "notes", title: "Post notes", member: "rio", task: "Post", dependsOn: ["push"], approval: "" },
      ],
    });
  setFake({ FAKE_CLI_OUTPUT: held("Pushes a tag to the shared repo") });
  const ok = startRun("Release v1", dir);
  await until(() => !!getRun(ok.id)?.nodes.find((n) => n.id === "push")?.held);
  expect(getRun(ok.id)?.nodes.find((n) => n.id === "push")?.status).toBe("pending");
  expect(approveTask(ok.id, "notes", true)).toBe("missing");
  expect(approveTask(ok.id, "push", true)).toBe("ok");
  await until(() => getRun(ok.id)?.status === "done");
  expect(getRun(ok.id)?.nodes.find((n) => n.id === "push")).toMatchObject({ status: "done", approved: "allowed" });

  const no = startRun("Release v2", dir);
  await until(() => !!getRun(no.id)?.nodes.find((n) => n.id === "push")?.held);
  expect(approveTask(no.id, "push", false)).toBe("ok");
  await until(() => getRun(no.id)?.status === "failed");
  const nodes = getRun(no.id)?.nodes ?? [];
  expect(nodes.find((n) => n.id === "push")).toMatchObject({
    status: "failed",
    approved: "declined",
    error: "Not allowed: Pushes a tag to the shared repo",
  });
  expect(nodes.find((n) => n.id === "notes")?.status).toBe("skipped");
}, 20_000);

test("a chat session is its own conversation: the lead hears only its rounds, and sessions never share a round", async () => {
  const lead = join(cli, "session-lead.txt");
  const reply = (text: string) => planned({ title: "Bug login", summary: "S", reply: text, questions: [], hires: [], nodes: [] });
  setFake({ FAKE_CLI_OUTPUT: reply("Halo.") });
  const { id } = startRun("Bikin landing page toko kopi", dir);
  await until(() => getRun(id)?.status === "done");
  patchRun(id, { sessions: [{ id: "s2", createdAt: Date.now() }] });

  setFake({ FAKE_CLI_OUTPUT: reply("Oke, saya cek."), FAKE_CLI_STDIN_OUT: lead });
  expect(continueRun(id, "Login error 500", [], undefined, [], undefined, [], "s2")).toBe("ok");
  await until(() => getRun(id)?.status === "done");
  const first = await Bun.file(lead).text();
  expect(first).toContain("starts a new chat session");
  expect(first).not.toContain("Original mission:\nBikin landing page");
  expect(getRun(id)?.roundSessions).toEqual({ 1: "s2" });
  // The session takes its name from its first plan.
  expect(getRun(id)?.sessions?.[0]?.title).toBe("Bug login");

  expect(continueRun(id, "Masih error", [], undefined, [], undefined, [], "s2")).toBe("ok");
  await until(() => getRun(id)?.status === "done");
  expect(await Bun.file(lead).text()).toContain("Original mission:\nLogin error 500");

  // Messages from two sessions sent while the team works run as separate rounds, oldest session first.
  setFake({ FAKE_CLI_OUTPUT: reply("Ya."), FAKE_CLI_SLEEP: "400", FAKE_CLI_ASIDE_OUTPUT: aside("Setelah ini.", true) });
  expect(continueRun(id, "Warna hero", [], undefined, [], undefined, [], undefined)).toBe("ok");
  queuePrompt(id, "Cek lagi login", [], undefined, undefined, [], "s2");
  queuePrompt(id, "Tambah testimoni");
  await until(() => getRun(id)?.queue?.find((q) => q.prompt === "Tambah testimoni")?.reply === "Setelah ini.");
  setFake({ FAKE_CLI_OUTPUT: reply("Ya."), FAKE_CLI_ASIDE_OUTPUT: aside("Setelah ini.", true) });
  await until(() => (getRun(id)?.rounds?.length ?? 0) === 5 && getRun(id)?.status === "done" && !getRun(id)?.queue?.length, 15_000);
  const run = getRun(id);
  expect(run?.rounds?.slice(3)).toEqual(["Cek lagi login", "Tambah testimoni"]);
  expect(run?.roundSessions?.[4]).toBe("s2");
  expect(run?.roundSessions?.[5]).toBeUndefined();
}, 30_000);

test("in Satgas Cloud, a plan that says no stops a new round before any agent runs, with the plan's message", async () => {
  const { useReporter } = await import("../../src/server/cloud");
  const { createReporter } = await import("../../src/server/cloud/report");
  const cloud = { instance: "ws-acme", url: "https://cloud.test", publicKey: "", secret: "s".repeat(32) };
  const reporter = createReporter({
    ...cloud,
    every: 60_000,
    fetch: (async () =>
      Response.json({ quota: { blocked: true, message: "This month's 200 tasks are used." } })) as unknown as typeof fetch,
  });
  (config as { cloud: typeof config.cloud }).cloud = cloud;
  useReporter(reporter, null);
  try {
    reporter.report({ type: "round.started", run: "earlier", round: 0 });
    await reporter.flush();
    setFake({ FAKE_CLI_OUTPUT: planned({ title: "T", summary: "S", reply: "Halo.", questions: [], hires: [], nodes: [] }) });
    const { id } = startRun("halo", dir);
    await until(() => getRun(id)?.status === "failed");
    expect(getRun(id)?.error).toBe("This month's 200 tasks are used.");
    expect(getRun(id)?.nodes).toEqual([]);
  } finally {
    reporter.stop();
    useReporter(null, null);
    (config as { cloud: typeof config.cloud }).cloud = null;
  }
});
