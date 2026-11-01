import { expect, test } from "bun:test";
import { buildNodePrompt } from "../../src/server/prompt";
import type { NodeState, Run } from "../../src/shared/types";

const node = (id: string, dependsOn: string[] = [], output?: string): NodeState => ({
  id,
  title: `Task ${id}`,
  role: "Engineer",
  agent: "claude",
  task: `Do ${id}`,
  dependsOn,
  status: output ? "done" : "pending",
  output,
  x: 0,
  y: 0,
});

const run = (nodes: NodeState[]): Run => ({ id: "r1", prompt: "Ship it", cwd: "/work", status: "running", createdAt: 0, nodes });

test("includes the mission, the task and only direct upstream reports", () => {
  const nodes = [node("a", [], "report A"), node("b", ["a"], "report B"), node("c", ["b"])];
  const prompt = buildNodePrompt(run(nodes), nodes[2] as NodeState, 1000);
  expect(prompt).toContain("Overall mission:\nShip it");
  expect(prompt).toContain("Your task: Task c\nDo c");
  expect(prompt).toContain("report B");
  expect(prompt).not.toContain("report A");
});

test("only the final task is asked for the user-facing report", () => {
  const nodes = [node("a"), node("b", ["a"])];
  expect(buildNodePrompt(run(nodes), nodes[0] as NodeState, 1000)).toContain("handed to the next tasks");
  expect(buildNodePrompt(run(nodes), nodes[1] as NodeState, 1000)).toContain("final report for the user");
});

test("long upstream reports keep their ending", () => {
  const nodes = [node("a", [], `${"x".repeat(50)}CONCLUSION`), node("b", ["a"])];
  const prompt = buildNodePrompt(run(nodes), nodes[1] as NodeState, 20);
  expect(prompt).toContain("CONCLUSION");
  expect(prompt).not.toContain("x".repeat(50));
});
