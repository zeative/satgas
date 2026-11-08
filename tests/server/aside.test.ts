import { expect, test } from "bun:test";
import { asideMessage, describeWork } from "../../src/server/aside";
import type { NodeState, Run } from "../../src/shared/types";

const node = (id: string, round: number, status: NodeState["status"], output?: string): NodeState => ({
  id,
  title: `Task ${id}`,
  role: "Engineer",
  agent: "claude",
  task: "t",
  dependsOn: [],
  status,
  round,
  x: 0,
  y: 0,
  ...(output ? { output } : {}),
});

// The board that broke: "GASS A" sent while the lead planned the build it had just asked about got "what should I do?".
const run: Run = {
  id: "r1",
  prompt: "Buatkan game balap mengetik",
  cwd: "/w",
  status: "planning",
  createdAt: 0,
  rounds: ["GASS S"],
  nodes: [node("wire", 0, "done", "Pilih A atau B, atau sebutkan yang mau diubah.")],
};

test("a short message mid-work comes with the mission and the question it answers", () => {
  const work = describeWork(run);
  expect(work).toContain("Buatkan game balap mengetik");
  expect(work).toContain("Pilih A atau B");
  expect(work).toContain("GASS S");
});

test("while planning, the lead is told the work is under way, not that nothing is running", () => {
  expect(describeWork(run)).toContain("You are planning this round right now");
  expect(describeWork({ ...run, status: "running", nodes: [...run.nodes, node("build", 1, "running")] })).not.toContain(
    "planning this round",
  );
});

test("what was already said this round carries over, so a second message is not treated as the first", () => {
  const said = { ...run, asides: { 1: [{ id: "a", prompt: "GASS A", reply: "Build sedang disiapkan", at: 1 }] } };
  expect(describeWork(said)).toContain("Build sedang disiapkan");
});

test("a card selected with the message is named", () => {
  const board = {
    cards: [{ id: "c1", kind: "preview" as const, title: "design/wireframe-a.html", x: 0, y: 0, w: 1, h: 1, createdAt: 1 }],
    links: [],
    moved: {},
  };
  expect(asideMessage({ ...run, board }, "A", ["c1"])).toContain("design/wireframe-a.html");
  expect(asideMessage({ ...run, board }, "A")).not.toContain("selected");
});
