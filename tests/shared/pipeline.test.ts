import { expect, test } from "bun:test";
import { columnOf, isActive, laneOf, shownIn, since } from "../../src/shared/pipeline";
import type { NodeState, Run } from "../../src/shared/types";

const node = (id: string, extra: Partial<NodeState> = {}): NodeState => ({
  id,
  title: `Task ${id}`,
  role: "Engineer",
  agent: "claude",
  task: "",
  dependsOn: [],
  status: "pending",
  x: 0,
  y: 0,
  ...extra,
});

const run = (nodes: NodeState[], extra: Partial<Run> = {}): Run => ({
  id: "r1",
  prompt: "Build a CRM",
  cwd: "/w",
  status: "running",
  createdAt: 1,
  nodes,
  team: [{ id: "raka", name: "Raka", role: "Developer", brief: "", agent: "claude", hiredAt: 1, round: 0 }],
  ...extra,
});

test("tasks land in the column their state says, and only while it still means something", () => {
  const lane = { status: "running" as const, round: 1 };
  const t = (status: NodeState["status"], round = 1) => ({ id: "x", title: "", member: "m", status, round });
  expect(columnOf(lane, t("running"))).toBe("work");
  expect(columnOf(lane, t("pending"))).toBe("next");
  expect(columnOf({ ...lane, status: "cancelled" }, t("pending"))).toBeNull();
  expect(columnOf(lane, t("failed"))).toBe("failed");
  // A failure a later round already moved past stays out of the way.
  expect(columnOf(lane, t("failed", 0))).toBeNull();
  expect(columnOf(lane, t("done"))).toBe("done");
  expect(columnOf(lane, t("skipped"))).toBeNull();
});

test("a lane names who a task waits on and what a running task is doing", () => {
  const lane = laneOf(
    run([node("a", { status: "running", member: "raka", startedAt: 5 }), node("b", { dependsOn: ["a"], member: "raka" })]),
    {
      a: [
        { seq: 1, t: 1, kind: "tool", text: "Bash: ls" },
        { seq: 2, t: 2, kind: "info", text: "ignored" },
        { seq: 3, t: 3, kind: "tool", text: "Write: src/app.ts" },
      ],
    },
  );
  expect(lane.prompt).toBe("Build a CRM");
  expect(lane.team).toEqual([{ id: "raka", name: "Raka", role: "Developer" }]);
  expect(lane.tasks[0]).toMatchObject({ steps: 2, last: { seq: 3, text: "Write: src/app.ts" } });
  expect(lane.tasks[1]?.waitFor).toBe("Raka");
});

test("done work counts from midnight for today, and a quiet board drops off the page", () => {
  const now = new Date(2026, 10, 3, 15, 0).getTime();
  const midnight = new Date(2026, 10, 3, 0, 0).getTime();
  expect(since("today", now)).toBe(midnight);
  const lane = laneOf(run([node("a", { status: "done", endedAt: midnight - 1000 })], { status: "done" }));
  expect(shownIn(lane, lane.tasks[0] as never, since("today", now))).toBeNull();
  expect(isActive(lane, since("today", now))).toBe(false);
  expect(isActive(lane, since("week", now))).toBe(true);
  expect(isActive(laneOf(run([], { status: "asking" })), since("today", now))).toBe(true);
});
