import { describe, expect, test } from "bun:test";
import {
  cleanHires,
  crew,
  currentTask,
  LEAD_H,
  LEAD_W,
  type Member,
  PERSON_W,
  personState,
  taskToOpen,
  teamBounds,
  teamLayout,
} from "../../src/shared/team";
import type { NodeState } from "../../src/shared/types";

const task = (id: string, member: string | undefined, extra: Partial<NodeState> = {}): NodeState => ({
  id,
  title: id,
  role: "Writer",
  agent: "claude",
  task: "",
  dependsOn: [],
  member,
  status: "done",
  x: 0,
  y: 0,
  ...extra,
});
const nadia: Member = { id: "nadia", name: "Nadia", role: "Designer", brief: "", agent: "claude", hiredAt: 1, round: 0 };

describe("crew", () => {
  test("keeps the hired team in order and stands in one person per role for tasks made before teams", () => {
    const people = crew({
      team: [nadia],
      createdAt: 1,
      nodes: [task("a", "nadia"), task("b", undefined, { role: "Backend engineer" }), task("c", undefined, { role: "Backend engineer" })],
    });
    expect(people.map((m) => m.id)).toEqual(["nadia", "role-backend-engineer"]);
    expect(people[1]?.name).toBe("Backend engineer");
  });
});

describe("cleanHires", () => {
  test("drops clashes and broken entries, derives a missing id, and only hands work to agents that are on", () => {
    const hires = cleanHires(
      [
        { id: "nadia", name: "Nadia", role: "Designer", brief: "", agent: "claude" },
        { id: "BAD ID", name: "Raka Putra", role: "Frontend", brief: "Builds pages", agent: "codex" },
        { id: "x", name: "", role: "QA", brief: "", agent: "claude" },
        "nonsense",
      ],
      [nadia],
      ["claude"],
    );
    expect(hires).toEqual([{ id: "raka-putra", name: "Raka Putra", role: "Frontend", brief: "Builds pages", agent: "claude" }]);
  });

  test("never grows the team past its limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, role: "Dev", brief: "", agent: "claude" }));
    expect(cleanHires(many, [nadia], ["claude"])).toHaveLength(11);
  });
});

describe("what a person is doing", () => {
  const nodes = [
    task("old", "nadia", { round: 0 }),
    task("draw", "nadia", { round: 1, status: "running" }),
    task("build", "raka", { round: 1, status: "pending", dependsOn: ["draw"] }),
  ];

  test("shows the latest round's task, the running one first", () => {
    expect(currentTask("nadia", nodes)?.id).toBe("draw");
    expect(personState(currentTask("nadia", nodes))).toBe("working");
    expect(personState(currentTask("raka", nodes))).toBe("waiting");
  });

  test("someone without work this round is idle, but still opens their last task", () => {
    const later = [...nodes, task("next", "raka", { round: 2 })];
    expect(personState(currentTask("nadia", later))).toBe("idle");
    expect(taskToOpen("nadia", later)?.id).toBe("draw");
  });
});

describe("layout", () => {
  test("centres the lead over one row of members above the old board area, and a hire joins on the right", () => {
    const two = teamLayout([{ id: "a" }, { id: "b" }]);
    const three = teamLayout([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(three.members.get("a")).toEqual(two.members.get("a"));
    expect((three.members.get("c")?.x ?? 0) > (three.members.get("b")?.x ?? 0)).toBe(true);
    expect(teamBounds([{ id: "a" }]).bottom).toBeLessThan(0);
  });

  test("the lead stays right above the row, however many people there are", () => {
    const one = teamLayout([{ id: "a" }]);
    const a = one.members.get("a") ?? { x: 0, y: 0 };
    expect(a.y - (one.lead.y + LEAD_H)).toBe(64);
    expect(one.lead.x + LEAD_W / 2).toBe(a.x + PERSON_W / 2);
  });
});
