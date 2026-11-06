import { beforeEach, describe, expect, test } from "bun:test";
import {
  type ChannelAdapter,
  ChannelHub,
  type ChatButton,
  emptyHubState,
  type Inbound,
  type Runtime,
} from "../../../src/server/channels/hub";
import { noticesFor, reportOf, statusLine } from "../../../src/server/channels/notices";
import type { Run } from "../../../src/shared/types";

const me: Inbound = { kind: "telegram", chat: "42", from: ["7"], name: "Zaa" };
const stranger: Inbound = { kind: "telegram", chat: "99", from: ["666"], name: "Stranger" };

type Sent = { chat: string; text: string; buttons?: ChatButton[] };
let sent: Sent[];
let edits: string[];
let runs: Map<string, Run>;
let calls: string[];
let answered: unknown;
let clock: number;
let hub: ChannelHub;

const run = (id: string, extra: Partial<Run> = {}): Run =>
  ({ id, prompt: `Board ${id}`, cwd: "/w", status: "planning", createdAt: 0, seenAt: 0, nodes: [], ...extra }) as Run;

const runtime: Runtime = {
  getRun: (id) => runs.get(id),
  listBoards: () => [...runs.values()].map((r) => ({ id: r.id, title: r.prompt })),
  start: async (prompt) => {
    calls.push(`start:${prompt}`);
    runs.set("new1", run("new1", { prompt }));
    return "new1";
  },
  follow: (board, prompt) => {
    calls.push(`follow:${board}:${prompt}`);
    return true;
  },
  answer: (board, answers) => {
    answered = answers;
    calls.push(`answer:${board}`);
    return true;
  },
  approve: (board, node, allow) => {
    calls.push(`approve:${board}:${node}:${allow}`);
    return true;
  },
  declineSecret: async (board, ask) => {
    calls.push(`decline:${board}:${ask}`);
    return true;
  },
  cancel: (board) => {
    calls.push(`cancel:${board}`);
    return true;
  },
  hasAgents: () => true,
  boardUrl: (board) => `https://satgas.test/boards/${board}`,
};

const adapter = (over: Partial<ChannelAdapter> = {}): ChannelAdapter => ({
  kind: "telegram",
  canEdit: true,
  numberChoices: false,
  send: async (chat, text, buttons) => {
    sent.push({ chat, text, ...(buttons ? { buttons } : {}) });
    return String(sent.length);
  },
  edit: async (_chat, _id, text) => {
    edits.push(text);
  },
  ...over,
});

const pair = async () => {
  const { code } = hub.newPairing();
  await hub.onText(me, code);
  sent.length = 0;
};
const lastText = () => sent.at(-1)?.text ?? "";

beforeEach(() => {
  sent = [];
  edits = [];
  runs = new Map();
  calls = [];
  answered = undefined;
  clock = 1_000_000;
  hub = new ChannelHub(
    emptyHubState(),
    runtime,
    () => {},
    () => clock,
  );
  hub.adapters.set("telegram", adapter());
});

describe("pairing", () => {
  test("a stranger gets no reply at all and nothing runs", async () => {
    await hub.onText(stranger, "delete everything");
    await hub.onText(stranger, "/new hack");
    await hub.onButton(stranger, "any");
    expect(sent).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("the right code pairs that person, once", async () => {
    const { code } = hub.newPairing();
    await hub.onText(me, code);
    expect(lastText()).toContain("You're paired, Zaa");
    expect(hub.state.people.map((p) => p.ids)).toEqual([["7"]]);
    sent.length = 0;
    await hub.onText(stranger, code);
    expect(sent).toEqual([]);
    expect(hub.state.people).toHaveLength(1);
  });

  test("an old code stops working, and so does one guessed at too often", async () => {
    const { code } = hub.newPairing();
    clock += 11 * 60_000;
    await hub.onText(me, code);
    expect(hub.state.people).toHaveLength(0);

    const next = hub.newPairing();
    for (let i = 0; i < 5; i++) await hub.onText(stranger, "000000");
    expect(hub.state.pairing).toBeNull();
    await hub.onText(me, next.code);
    expect(hub.state.people).toHaveLength(0);
  });

  test("being paired on one app says nothing about another", async () => {
    await pair();
    hub.adapters.set("whatsapp", adapter({ kind: "whatsapp" }));
    await hub.onText({ ...me, kind: "whatsapp" }, "hello");
    expect(calls).toEqual([]);
  });
});

describe("talking to the team", () => {
  beforeEach(pair);

  test("a first message starts a board, the next continues it, and /new starts another", async () => {
    await hub.onText(me, "build a landing page");
    expect(calls).toEqual(["start:build a landing page"]);
    await hub.onText(me, "make it blue");
    expect(calls[1]).toBe("follow:new1:make it blue");
    await hub.onText(me, "/new something else");
    expect(calls[2]).toBe("start:something else");
  });

  test("/stop, /boards and /use act on the right board", async () => {
    runs.set("a", run("a", { prompt: "First" }));
    runs.set("b", run("b", { prompt: "Second" }));
    await hub.onText(me, "/boards");
    expect(lastText()).toContain("2. Second");
    await hub.onText(me, "/use 2");
    expect(sent.some((m) => m.text === "Now on Second")).toBe(true);
    await hub.onText(me, "more");
    expect(calls).toContain("follow:b:more");
    await hub.onText(me, "/stop");
    expect(calls).toContain("cancel:b");
    await hub.onText(me, "/use 9");
    expect(lastText()).toContain("don't have that one");
  });

  test("an unknown command does not reach the team", async () => {
    await hub.onText(me, "/nonsense");
    expect(lastText()).toContain("I don't know /nonsense");
    expect(calls).toEqual([]);
  });
});

describe("hearing back", () => {
  beforeEach(async () => {
    await pair();
    await hub.onText(me, "go");
    sent.length = 0;
  });
  const set = (patch: Partial<Run>) => runs.set("new1", { ...(runs.get("new1") as Run), ...patch });
  const task = (id: string, extra = {}) => ({
    id,
    title: `Task ${id}`,
    role: "Engineer",
    agent: "claude",
    task: "",
    dependsOn: [],
    status: "running",
    x: 0,
    y: 0,
    ...extra,
  });

  test("the report arrives once with a link, even if the board keeps changing", async () => {
    set({ status: "done", nodes: [task("n", { status: "done", output: "All done" })] as Run["nodes"] });
    await hub.tick("new1");
    await hub.tick("new1");
    const reports = sent.filter((s) => s.text.includes("All done"));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.text).toContain("https://satgas.test/boards/new1");
  });

  test("a failure says why", async () => {
    set({ status: "failed", error: "out of credits" });
    await hub.tick("new1");
    expect(sent.at(-1)?.text).toContain("It failed: out of credits");
  });

  test("a held task asks with buttons, and only a paired person can answer", async () => {
    set({ status: "running", nodes: [task("n", { held: 1, approval: "Deletes the table" })] as Run["nodes"] });
    await hub.tick("new1");
    const ask = sent.find((s) => s.buttons);
    expect(ask?.text).toContain("Deletes the table");
    const allow = ask?.buttons?.[0]?.id as string;
    await hub.onButton(stranger, allow);
    expect(calls.some((c) => c.startsWith("approve"))).toBe(false);
    await hub.onButton(me, allow);
    expect(calls).toContain("approve:new1:n:true");
    await hub.onButton(me, allow);
    expect(calls.filter((c) => c.startsWith("approve"))).toHaveLength(1);
    expect(lastText()).toContain("no longer open");
  });

  test("a secret is never asked for in the chat, and can be declined from it", async () => {
    set({
      status: "running",
      nodes: [task("n")] as Run["nodes"],
      secrets: [{ id: "s1", nodeId: "n", label: "Stripe key", reason: "webhook", state: "waiting", at: 1 }],
    });
    await hub.tick("new1");
    const ask = sent.find((s) => s.text.includes("Stripe key"));
    expect(ask?.text).toContain("Don't send it here");
    expect(ask?.text).toContain("https://satgas.test/boards/new1");
    await hub.onButton(me, ask?.buttons?.[0]?.id as string);
    expect(calls).toContain("decline:new1:s1");
  });

  test("the lead's questions go one at a time, by button, number or own words", async () => {
    const q = (question: string) => ({
      header: "H",
      question,
      multiSelect: false,
      options: [
        { label: "Red", description: "" },
        { label: "Blue", description: "" },
      ],
    });
    set({ status: "asking", asks: { 0: { questions: [q("Colour?"), q("Shade?"), q("Name?")] } } });
    await hub.tick("new1");
    expect(lastText()).toContain("Colour?");
    await hub.onButton(me, sent.at(-1)?.buttons?.[1]?.id as string);
    expect(lastText()).toContain("Shade?");
    await hub.onText(me, "1");
    expect(lastText()).toContain("Name?");
    await hub.onText(me, "Something else");
    expect(answered).toEqual([{ picked: ["Blue"] }, { picked: ["Red"] }, { picked: [], own: "Something else" }]);
    expect(calls).toContain("answer:new1");
  });

  test("the status line is one message that changes, no faster than chat apps allow", async () => {
    set({ status: "planning" });
    await hub.tick("new1");
    const before = sent.length;
    set({ status: "running", nodes: [task("n")] as Run["nodes"] });
    await hub.tick("new1");
    expect(edits).toEqual([]);
    clock += 5000;
    await hub.tick("new1");
    expect(sent.length).toBe(before);
    expect(edits.at(-1)).toContain("0 of 1 done");
    set({ status: "done", nodes: [task("n", { status: "done", output: "ok" })] as Run["nodes"] });
    await hub.tick("new1");
    expect(edits.at(-1)).toBe("Finished");
  });

  test("an app without dependable buttons spells the choices out", async () => {
    hub.adapters.set("telegram", adapter({ numberChoices: true }));
    set({ status: "running", nodes: [task("n", { held: 1 })] as Run["nodes"] });
    await hub.tick("new1");
    expect(lastText()).toContain("1. Allow");
    await hub.onText(me, "2");
    expect(calls).toContain("approve:new1:n:false");
  });

  test("switching to a board does not repeat what already ended there", async () => {
    runs.set("old", run("old", { status: "done", answers: { 0: "Old report" } }));
    sent.length = 0;
    await hub.onText(me, "/boards");
    const number = [...runs.keys()].indexOf("old") + 1;
    await hub.onText(me, `/use ${number}`);
    await hub.tick("old");
    expect(sent.some((s) => s.text.includes("Old report"))).toBe(false);
  });
});

test("reports read without the blocks a chat cannot show", () => {
  const r = run("a", {
    status: "done",
    nodes: [
      {
        id: "n",
        title: "T",
        role: "E",
        agent: "claude",
        task: "",
        dependsOn: [],
        status: "done",
        x: 0,
        y: 0,
        output: "Hello\n\n```satgas:note\nA card\n```",
      },
    ] as Run["nodes"],
  });
  expect(reportOf(r, 0)).toBe("Hello");
  expect(noticesFor(r, new Set(["r:0"]))).toEqual([]);
  expect(statusLine(run("b", { status: "done" }))).toBeNull();
});
