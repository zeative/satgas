import { describe, expect, test } from "bun:test";
import type { NodeState, Run } from "../../../../src/shared/types";
import { finalTasks, roundsOf } from "../../../../src/web/features/missions/rounds";

const task = (id: string, over: Partial<NodeState> = {}): NodeState => ({
  id,
  title: id,
  role: "dev",
  agent: "claude",
  task: id,
  dependsOn: [],
  status: "done",
  x: 0,
  y: 0,
  ...over,
});

const run = (over: Partial<Run>): Run => ({ id: "r", prompt: "first", cwd: "/", status: "done", createdAt: 0, nodes: [], ...over });

// Round 0: a → b. Round 1 continues from b through `after`, so b is still a sink of the whole graph.
const twoRounds = [
  task("a", { output: "a says" }),
  task("b", { dependsOn: ["a"], output: "round one report" }),
  task("c", { round: 1, after: ["b"], output: "round two report" }),
];

describe("finalTasks", () => {
  test("takes the finals of the latest round only", () => {
    expect(finalTasks(twoRounds).map((n) => n.id)).toEqual(["c"]);
  });

  test("keeps a final that succeeded beside one that failed", () => {
    const nodes = [task("a"), task("b", { dependsOn: ["a"], output: "done" }), task("x", { dependsOn: ["a"], status: "failed" })];
    expect(finalTasks(nodes).map((n) => n.id)).toEqual(["b"]);
  });
});

describe("roundsOf", () => {
  test("gives each round its own finals and report", () => {
    const [one, two] = roundsOf(run({ rounds: ["second"], nodes: twoRounds }));
    expect([...(one?.finals ?? [])]).toEqual(["b"]);
    expect(one?.report).toBe("round one report");
    expect(two?.report).toBe("round two report");
    expect(two?.outcome).toBeNull();
  });

  test("marks an earlier round with no tasks as having no plan", () => {
    const rounds = roundsOf(run({ rounds: ["second"], nodes: [task("c", { round: 1, output: "ok" })] }));
    expect(rounds.map((r) => r.outcome)).toEqual(["noPlan", null]);
  });

  test("leaves the latest failed plan to the run error", () => {
    expect(roundsOf(run({ status: "failed", error: "planner crashed" }))[0]?.outcome).toBeNull();
    expect(roundsOf(run({ status: "failed" }))[0]?.outcome).toBe("noPlan");
  });

  test("marks cancelled rounds, earlier ones by their tasks", () => {
    const nodes = [task("a", { status: "cancelled" }), task("c", { round: 1 })];
    expect(roundsOf(run({ rounds: ["second"], nodes })).map((r) => r.outcome)).toEqual(["cancelled", null]);
    expect(roundsOf(run({ status: "cancelled" }))[0]?.outcome).toBe("cancelled");
  });

  test("says nothing while the latest round is live", () => {
    expect(roundsOf(run({ status: "planning" }))[0]?.outcome).toBeNull();
    expect(roundsOf(run({ status: "running", nodes: [task("a", { status: "running" })] }))[0]?.outcome).toBeNull();
  });
});
