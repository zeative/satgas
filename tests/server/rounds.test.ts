import { describe, expect, test } from "bun:test";
import { placeRound, roundContext } from "../../src/server/rounds";
import type { Card } from "../../src/shared/board";
import type { NodeState, PlanNode } from "../../src/shared/types";

const done = (id: string, x: number, y: number, extra: Partial<NodeState> = {}): NodeState => ({
  id,
  title: `Task ${id}`,
  role: "Engineer",
  agent: "claude",
  task: "",
  dependsOn: [],
  status: "done",
  x,
  y,
  ...extra,
});
const plan = (id: string, dependsOn: string[] = []): PlanNode => ({ id, title: id, role: "R", agent: "claude", task: "t", dependsOn });

describe("placeRound", () => {
  test("lays out the first round as planned", () => {
    const nodes = placeRound([], [], [plan("a"), plan("b", ["a"])], 0);
    expect(nodes.map((n) => [n.id, n.round, n.status, n.after])).toEqual([
      ["a", 0, "pending", undefined],
      ["b", 0, "pending", undefined],
    ]);
  });

  test("prefixes follow-up ids, places them right of everything and threads roots onto the last round's ends", () => {
    const existing = [done("a", 0, 0), done("b", 328, 0, { dependsOn: ["a"] })];
    const cards: Card[] = [{ id: "c", kind: "doc", x: 700, y: 0, w: 400, h: 200, createdAt: 1 }];
    const next = placeRound(existing, cards, [plan("fix"), plan("check", ["fix"])], 1);
    expect(next.map((n) => n.id)).toEqual(["r2-fix", "r2-check"]);
    expect(next[1]?.dependsOn).toEqual(["r2-fix"]);
    expect(next[0]?.after).toEqual(["b"]);
    expect(next[1]?.after).toBeUndefined();
    expect(Math.min(...next.map((n) => n.x))).toBeGreaterThanOrEqual(1100);
    expect(next.every((n) => n.round === 1 && n.status === "pending")).toBe(true);
  });
});

test("shelves each round's cards under its own graph", async () => {
  const { placeOnShelf } = await import("../../src/server/artifacts");
  const nodes = [done("a", 0, 0), done("r2-a", 2000, 0, { round: 1 })];
  const run = { id: "r", prompt: "p", cwd: "/w", status: "running" as const, createdAt: 1, nodes };
  const [first] = placeOnShelf(run, [{ id: "c1", kind: "note", from: "r2-a", w: 200, h: 100, createdAt: 1 }], 1);
  expect(first?.x).toBe(2000);
});

test("gives the planner the last round's outcome, report and people's notes", () => {
  const nodes = [
    done("a", 0, 0, { output: "Built the page" }),
    done("b", 0, 0, { round: 1, status: "failed", error: "tests failed", dependsOn: [] }),
  ];
  const cards: Card[] = [
    { id: "n1", kind: "note", text: "Use the brand amber", x: 0, y: 0, w: 1, h: 1, createdAt: 1 },
    { id: "n2", kind: "note", text: "agent note", from: "a", x: 0, y: 0, w: 1, h: 1, createdAt: 1 },
  ];
  const context = roundContext("Build a page", ["Add tests", "Fix the tests"], nodes, cards);
  expect(context).toContain("Original mission:\nBuild a page");
  expect(context).toContain("- Add tests");
  expect(context).toContain("Task b (Engineer): failed — tests failed");
  expect(context).toContain("- Use the brand amber");
  expect(context).not.toContain("agent note");
});
