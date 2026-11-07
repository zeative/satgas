import "../../helpers/browser";
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { type BoardOp, type Card, emptyBoard } from "../../../src/shared/board";
import type { Run } from "../../../src/shared/types";
import { connect, sendBoardOps, useRuns, watch } from "../../../src/web/stores/runs";

const card = (id: string): Card => ({ id, kind: "note", x: 0, y: 0, w: 10, h: 10, text: id, createdAt: 0 });
const put = (id: string): BoardOp[] => [{ op: "put", card: card(id) }];
const run = (cards: Card[] = []): Run => ({
  id: "r1",
  prompt: "p",
  cwd: "/",
  status: "done",
  createdAt: 0,
  nodes: [],
  board: { ...emptyBoard(), cards },
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const shown = () => (useRuns.getState().run?.board?.cards ?? []).map((c) => c.id).sort();
const settle = () => new Promise((r) => setTimeout(r, 0));

const realFetch = globalThis.fetch;
let calls: string[];

beforeEach(() => {
  calls = [];
  useRuns.setState({ run: run() });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Each call takes the next scripted answer; the log keeps the order requests actually left in.
function script(answers: (() => Promise<Response>)[]) {
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const next = answers.shift();
    if (!next) throw new Error(`unexpected request ${url}`);
    return next();
  }) as typeof fetch;
}

describe("sendBoardOps", () => {
  test("a refused change reloads after the changes queued behind it", async () => {
    const first = deferred<Response>();
    script([() => first.promise, async () => json({}), async () => json(run([card("b")]))]);
    const a = sendBoardOps("r1", put("a"));
    const b = sendBoardOps("r1", put("b"));
    first.resolve(json({ error: "refused" }, 409));
    await Promise.all([a, b]);
    await settle();
    expect(calls).toEqual(["POST /api/runs/r1/board", "POST /api/runs/r1/board", "GET /api/runs/r1"]);
    expect(shown()).toEqual(["b"]);
  });

  test("a change made while the reload is out stays on screen", async () => {
    const reload = deferred<Response>();
    script([async () => json({ error: "refused" }, 409), () => reload.promise, async () => json({})]);
    const a = sendBoardOps("r1", put("a"));
    while (!calls.includes("GET /api/runs/r1")) await settle();
    const c = sendBoardOps("r1", put("c"));
    reload.resolve(json(run()));
    await Promise.all([a, c]);
    expect(calls.at(-1)).toBe("POST /api/runs/r1/board");
    expect(shown()).toEqual(["c"]);
  });

  test("an unreachable server does not throw from the reload", async () => {
    script([
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => {
        throw new TypeError("Failed to fetch");
      },
    ]);
    await expect(sendBoardOps("r1", put("a"))).resolves.toBeUndefined();
    await settle();
    expect(calls).toHaveLength(2);
  });
});

// A socket that only records: tests open it, answer on it, or leave it silent the way a dead connection is.
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: { type: string; runId?: string | null }[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor() {
    sockets.push(this);
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
}
let sockets: FakeSocket[];

describe("connection", () => {
  const g = globalThis as Record<string, unknown>;
  const realSocket = g.WebSocket;
  beforeEach(() => {
    sockets = [];
    g.WebSocket = FakeSocket;
    g.location ??= { protocol: "http:", host: "localhost:4317" };
    const doc = g.document as { addEventListener?: unknown; visibilityState?: string };
    doc.addEventListener ??= () => {};
    globalThis.fetch = (async () => json([])) as unknown as typeof fetch;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    g.WebSocket = realSocket;
  });

  test("a board opened on a socket that stopped answering gets a new one, which asks for the board", () => {
    connect();
    sockets[0]?.open();
    watch("r1");
    expect(sockets[0]?.sent.map((m) => m.type)).toEqual(["watch", "watch", "ping"]);
    jest.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(2);
    sockets[1]?.open();
    expect(sockets[1]?.sent[0]).toEqual({ type: "watch", runId: "r1" });
  });

  test("a socket that answers is kept", () => {
    connect();
    sockets[0]?.open();
    watch("r1");
    sockets[0]?.onmessage?.({ data: JSON.stringify({ type: "pong" }) });
    jest.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(1);
  });

  test("a socket that never opens is replaced", () => {
    connect();
    jest.advanceTimersByTime(8000);
    expect(sockets).toHaveLength(2);
  });
});
