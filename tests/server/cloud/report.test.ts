import { expect, test } from "bun:test";
import { createReporter, fetchQuota, signBody } from "../../../src/server/cloud/report";

type Call = { url: string; init: RequestInit };
const fake = (answers: (Response | Error)[]) => {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift() ?? Response.json({});
    if (a instanceof Error) throw a;
    return a;
  }) as unknown as typeof fetch;
  return { f, calls };
};
const opts = (f: typeof fetch) => ({
  url: "https://cloud.test/",
  instance: "ws-acme",
  secret: "s".repeat(32),
  every: 60_000,
  fetch: f,
  now: () => 5,
});

test("events go out in signed batches with counts only, and the answer sets the plan's state", async () => {
  const { f, calls } = fake([Response.json({ quota: { blocked: true, message: "The Starter plan's 200 tasks are used." } })]);
  const r = createReporter(opts(f));
  r.report({ type: "round.started", run: "r1", round: 0 });
  r.report({
    type: "task.finished",
    run: "r1",
    round: 0,
    task: "t1",
    agent: "claude",
    status: "done",
    ms: 1200,
    usage: { input: 10, cached: 2, output: 5 },
  });
  await r.flush();
  r.stop();
  expect(calls).toHaveLength(1);
  const call = calls[0] as Call;
  expect(call.url).toBe("https://cloud.test/v1/instances/ws-acme/events");
  const body = String(call.init.body);
  expect((call.init.headers as Record<string, string>)["x-satgas-signature"]).toBe(signBody("s".repeat(32), body));
  expect(JSON.parse(body)).toMatchObject({
    v: 1,
    events: [
      { type: "round.started", at: 5 },
      { type: "task.finished", ms: 1200 },
    ],
  });
  expect(r.quota()).toEqual({ blocked: "The Starter plan's 200 tasks are used." });
});

test("a control plane that is down loses nothing: events wait for the next try", async () => {
  const { f, calls } = fake([new Error("down"), Response.json({ quota: { blocked: false } })]);
  const r = createReporter(opts(f));
  r.report({ type: "round.started", run: "r1", round: 0 });
  await r.flush();
  await r.flush();
  r.stop();
  expect(calls).toHaveLength(2);
  expect(JSON.parse(String(calls[1]?.init.body)).events).toHaveLength(1);
  expect(r.quota()).toEqual({ blocked: null });
});

test("the queue is bounded while the control plane is away, and says how many it had to drop", async () => {
  const { f, calls } = fake([Response.json({})]);
  const r = createReporter(opts(f));
  for (let i = 0; i < 1005; i++) r.report({ type: "round.started", run: `r${i}`, round: 0 });
  expect(r.dropped()).toBe(5);
  await r.flush();
  r.stop();
  expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ dropped: 5 });
  expect(calls).toHaveLength(10);
});

test("the plan's state can be asked outright, signed over its path", async () => {
  const { f, calls } = fake([Response.json({ quota: { blocked: false } }), new Response("no", { status: 500 })]);
  expect(await fetchQuota("https://cloud.test", "ws-acme", "s".repeat(32), f)).toEqual({ blocked: null });
  expect(((calls[0] as Call).init.headers as Record<string, string>)["x-satgas-signature"]).toBe(
    signBody("s".repeat(32), "/v1/instances/ws-acme/quota"),
  );
  expect(await fetchQuota("https://cloud.test", "ws-acme", "s".repeat(32), f)).toBeNull();
});
