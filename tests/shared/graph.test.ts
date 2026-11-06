import { describe, expect, test } from "bun:test";
import { depths, layout, sinks, taskCodes, validatePlan } from "../../src/shared/graph";
import type { Plan, PlanNode } from "../../src/shared/types";

const node = (id: string, dependsOn: string[] = []): PlanNode => ({ id, title: id, role: "r", agent: "claude", task: "t", dependsOn });
const plan = (nodes: PlanNode[]): Plan => ({ title: "p", summary: "s", nodes });

function positions(nodes: PlanNode[]) {
  const placed = layout(nodes);
  return (id: string) => {
    const n = placed.find((p) => p.id === id);
    if (!n) throw new Error(`missing ${id}`);
    return n;
  };
}

describe("validatePlan", () => {
  test("accepts a diamond DAG", () => {
    expect(validatePlan(plan([node("a"), node("b", ["a"]), node("c", ["a"]), node("d", ["b", "c"])]))).toBeNull();
  });
  test("rejects cycles, unknown deps, duplicates and empties", () => {
    expect(validatePlan(plan([node("a", ["b"]), node("b", ["a"])]))).toContain("cycle");
    expect(validatePlan(plan([node("a", ["x"])]))).toContain("unknown");
    expect(validatePlan(plan([node("a"), node("a")]))).toContain("Duplicate");
    expect(validatePlan(plan([]))).not.toBeNull();
  });
});

describe("layout", () => {
  test("places nodes in columns by longest path depth", () => {
    const nodes = [node("a"), node("b", ["a"]), node("c", ["a", "b"])];
    expect(depths(nodes)?.get("c")).toBe(2);
    const at = positions(nodes);
    expect(at("a").x).toBeLessThan(at("b").x);
    expect(at("b").x).toBeLessThan(at("c").x);
  });
  test("parallel nodes share a column at different rows", () => {
    const at = positions([node("a"), node("b", ["a"]), node("c", ["a"])]);
    expect(at("b").x).toBe(at("c").x);
    expect(at("b").y).not.toBe(at("c").y);
  });
  test("keeps every node and its fields", () => {
    const nodes = [node("a"), node("b", ["a"])];
    const placed = layout(nodes);
    expect(placed.map((n) => n.id)).toEqual(["a", "b"]);
    expect(placed[1]?.dependsOn).toEqual(["a"]);
  });
});

test("task codes follow reading order, column first", () => {
  const codes = taskCodes(layout([node("z"), node("b", ["z"]), node("a", ["z"])]));
  expect([codes.get("z"), codes.get("b"), codes.get("a")]).toEqual(["T-01", "T-02", "T-03"]);
});

test("sinks are nodes nobody depends on", () => {
  expect(sinks([node("a"), node("b", ["a"]), node("c", ["a"])]).map((n) => n.id)).toEqual(["b", "c"]);
});

test("a plan with no tasks is only valid when the planner answered the request itself", () => {
  expect(validatePlan({ title: "Hi", summary: "", nodes: [], reply: "Halo! Ada yang bisa dibantu?" })).toBeNull();
  expect(validatePlan({ title: "Hi", summary: "", nodes: [], reply: "  " })).toBe("The plan contains no tasks.");
});
