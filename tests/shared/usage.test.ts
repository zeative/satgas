import { describe, expect, test } from "bun:test";
import { priceOf } from "../../src/shared/prices";
import type { NodeState, Run } from "../../src/shared/types";
import { readLimits, spanOf, UNKNOWN_MODEL, usageReport } from "../../src/shared/usage";

const NOW = Date.UTC(2026, 10, 5, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const node = (id: string, endedAt: number, usage?: NodeState["usage"], extra: Partial<NodeState> = {}): NodeState =>
  ({
    id,
    title: id,
    role: "Engineer",
    agent: "claude",
    task: "",
    dependsOn: [],
    status: "done",
    endedAt,
    usage,
    x: 0,
    y: 0,
    ...extra,
  }) as NodeState;
const run = (id: string, nodes: NodeState[], extra: Partial<Run> = {}): Run =>
  ({ id, prompt: `Board ${id}`, cwd: "/w", status: "done", createdAt: 0, seenAt: 0, nodes, ...extra }) as Run;
const opus = (input: number, read: number, write: number, output: number, cost?: number) => ({
  input: input + read + write,
  cached: read + write,
  output,
  byModel: { "claude-opus-5-5": { input, read, write, output, ...(cost === undefined ? {} : { cost }) } },
});

describe("the report", () => {
  test("adds up by day, agent, model, board and teammate, and counts the lead", () => {
    const r = usageReport(
      [
        run("a", [node("n1", NOW - DAY, opus(100, 40, 10, 10, 1.5))], {
          leadUsage: { 0: { ...opus(20, 0, 0, 2, 0.5), at: NOW } },
        }),
        run("b", [
          node(
            "n2",
            NOW,
            { input: 1000, cached: 0, output: 100, byModel: { "gpt-5.6-luna": { input: 1000, read: 0, write: 0, output: 100 } } },
            { agent: "codex" },
          ),
        ]),
      ],
      { range: "7", now: NOW, offset: 0 },
    );
    expect(r.tokens).toBe(160 + 22 + 1100);
    expect(r.uncached).toBe(1120);
    expect(r.read).toBe(40);
    expect(r.write).toBe(10);
    expect(r.cost).toBe(2);
    expect(r.counted).toBe(2);
    expect(r.buckets).toHaveLength(7);
    expect(r.buckets.at(-1)?.tokens).toBe(22 + 1100);
    expect(r.buckets.at(-2)).toMatchObject({ tokens: 160, cost: 1.5 });
    expect(r.agents.map((a) => a.key)).toEqual(["codex", "claude"]);
    expect(r.models.find((m) => m.key === "claude-opus-5-5")).toMatchObject({ tokens: 182, cost: 2, agent: "claude" });
    expect(r.people.find((p) => p.key === "Lead")?.tokens).toBe(22);
  });

  test("a model with no price reads as unpriced, never as free", () => {
    const r = usageReport(
      [
        run("a", [
          node("n", NOW, { input: 10, cached: 0, output: 1, byModel: { "kimi-k3": { input: 10, read: 0, write: 0, output: 1 } } }),
        ]),
      ],
      {
        range: "7",
        now: NOW,
        offset: 0,
      },
    );
    expect(r.models[0]).toMatchObject({ key: "kimi-k3", cost: null });
    expect(r.agents[0]?.cost).toBeNull();
    expect(r.cost).toBe(0);
  });

  test("a task from before models were recorded counts under an unknown model with no price", () => {
    const r = usageReport([run("a", [node("n", NOW, { input: 100, cached: 60, output: 5 })])], { range: "7", now: NOW, offset: 0 });
    expect(r.models[0]).toMatchObject({ key: UNKNOWN_MODEL, cost: null, tokens: 105 });
    expect(r.read).toBe(60);
    expect(r.uncached).toBe(40);
  });

  test("a task that reported nothing is named as unknown, never counted as zero tokens used", () => {
    const r = usageReport([run("a", [node("n1", NOW), node("n2", NOW, undefined, { status: "cancelled" })])], {
      range: "7",
      now: NOW,
      offset: 0,
    });
    expect(r.tokens).toBe(0);
    expect(r.counted).toBe(0);
    expect(r.unreported).toBe(1);
  });

  test("outside the period and what a fork copied from its source do not count", () => {
    const r = usageReport(
      [
        run("old", [node("n1", NOW - 10 * DAY, opus(5, 0, 0, 5))]),
        run("fork", [node("copied", NOW - 2 * DAY, opus(5, 0, 0, 5)), node("own", NOW, opus(7, 0, 0, 1))], {
          forkOf: { id: "src", title: "src", cwd: "/w", at: NOW - DAY },
        }),
      ],
      { range: "7", now: NOW, offset: 0 },
    );
    expect(r.tokens).toBe(8);
    expect(r.counted).toBe(1);
  });

  test("a teammate's row carries who they are, for their face, and the lead's matches the chat", () => {
    const r = usageReport(
      [
        run("a", [node("n", NOW, opus(9, 0, 0, 1), { member: "raka" } as Partial<NodeState>)], {
          team: [{ id: "raka", name: "Raka", role: "Engineer", agent: "claude", round: 0, brief: "", hiredAt: 0 }],
          leadUsage: { 0: { ...opus(1, 0, 0, 1), at: NOW } },
        } as Partial<Run>),
      ],
      {
        range: "7",
        now: NOW,
        offset: 0,
      },
    );
    expect(r.people.map((p) => [p.label, p.seed])).toEqual([
      ["Raka", "raka"],
      ["Lead", "Lead"],
    ]);
  });

  test("the past 24 hours come by the hour", () => {
    const r = usageReport([run("a", [node("n1", NOW - 2 * HOUR, opus(9, 0, 0, 1)), node("n2", NOW - 30 * HOUR, opus(9, 0, 0, 1))])], {
      range: "24h",
      now: NOW,
      offset: 0,
    });
    expect(r.buckets).toHaveLength(24);
    expect(r.tokens).toBe(10);
    expect(r.buckets.at(-3)?.tokens).toBe(10);
  });

  test("days follow the person's clock, not the server's", () => {
    const lateNight = Date.UTC(2026, 10, 5, 23);
    // UTC+7 reports an offset of -420, and for them this is already the 6th.
    const r = usageReport([run("a", [node("n1", lateNight, opus(9, 0, 0, 1))])], { range: "7", now: lateNight, offset: -420 });
    expect(r.buckets.at(-1)).toMatchObject({ key: "2026-11-06", tokens: 10 });
  });

  test("cost by type and cache savings follow list prices, with the total from the CLI", () => {
    const r = usageReport([run("a", [node("n", NOW, opus(1_000_000, 1_000_000, 1_000_000, 1_000_000, 99))])], {
      range: "7",
      now: NOW,
      offset: 0,
    });
    expect(r.cost).toBe(99);
    expect(r.costs).toEqual({ input: 4, read: 0.2, write: 8, output: 20 });
    expect(r.savings).toBeCloseTo(3.8);
  });
});

test("the price table matches what Claude Code charged on a real call", () => {
  const p = priceOf("claude-haiku-5-5");
  if (!p) throw new Error("no price");
  const cost = (1175 * p.input + 11228 * p.read + 6709 * p.write + 18 * p.output) / 1_000_000;
  expect(cost).toBeCloseTo(0.00158058, 8);
  expect(priceOf("kimi-k3")).toBeNull();
});

describe("limits", () => {
  test("reads the share left and when it resets from Claude Code's event", () => {
    const at = NOW / 1000 + 57 * 3600;
    const r = readLimits(
      {
        status: "allowed",
        unifiedWindows: { seven_day: { utilization: 0.64, resetsAt: at }, seven_day_fable: { utilization: 0, resetsAt: at } },
      },
      NOW,
    );
    expect(r.status).toBe("allowed");
    expect(r.windows).toEqual([
      { name: "seven_day", left: 36, resetsAt: at * 1000, span: 7 * DAY },
      { name: "seven_day_fable", left: 100, resetsAt: at * 1000, span: 7 * DAY },
    ]);
  });

  test("a window that already reset, or a malformed event, shows nothing rather than a stale figure", () => {
    expect(readLimits({ unifiedWindows: { seven_day: { utilization: 0.5, resetsAt: NOW / 1000 - 1 } } }, NOW).windows).toEqual([]);
    expect(readLimits({ unifiedWindows: { seven_day: { utilization: "x" } } }, NOW).windows).toEqual([]);
    expect(readLimits(null, NOW).windows).toEqual([]);
    expect(spanOf("five_hour")).toBe(5 * HOUR);
    expect(spanOf("mystery")).toBeNull();
  });
});
