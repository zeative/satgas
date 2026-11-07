import "../../../helpers/browser";
import { expect, test } from "bun:test";
import type { Card } from "../../../../src/shared/board";
import type { LogLine, NodeState, Run } from "../../../../src/shared/types";
import { liveWork, SLOT_H, SLOT_W, STEPS_SHOWN } from "../../../../src/web/features/board/live";

const task = (id: string, status: NodeState["status"], dependsOn: string[] = []): NodeState =>
  ({ id, title: id, task: id, member: id, dependsOn, status, x: 0, y: 0 }) as NodeState;
const brief: Card = { id: "b", kind: "doc", title: "brief.md", x: 0, y: 400, w: 300, h: 200, from: "brief", createdAt: 1 };
const run = (nodes: NodeState[], cards: Card[] = [brief]): Run => ({
  id: "r",
  prompt: "p",
  cwd: "/",
  status: "running",
  createdAt: 0,
  nodes,
  board: { cards, links: [], moved: {} },
});
const tool = (seq: number, text: string): LogLine => ({ seq, t: seq, kind: "tool", text });

test("a running task gets a slot right of the card its work comes from, wired from it", () => {
  const { slots } = liveWork(run([task("brief", "done"), task("code", "running", ["brief"])]), {});
  expect(slots).toEqual([expect.objectContaining({ x: 420, y: 400, from: ["b"] })]);
});

test("the cursor sits on the card the task is reading, and says so", () => {
  const { cursors } = liveWork(run([task("brief", "done"), task("code", "running", ["brief"])]), {
    code: [tool(1, "Read /work/brief.md")],
  });
  const c = cursors[0];
  expect(c?.typing).toBe(false);
  expect(c && c.x >= 0 && c.x <= 300 && c.y >= 400 && c.y <= 600).toBe(true);
  expect(c?.now?.text).toContain("brief.md");
});

test("while writing a file that has no card yet, the cursor types on the slot", () => {
  const { cursors } = liveWork(run([task("brief", "done"), task("code", "running", ["brief"])]), {
    code: [tool(1, "Write /work/index.html")],
  });
  const c = cursors[0];
  expect(c?.typing).toBe(true);
  expect(c && c.x >= 420 && c.x <= 420 + SLOT_W && c.y >= 400 && c.y <= 400 + SLOT_H).toBe(true);
});

test("each new step moves the pointer, and the same step always lands in the same place", () => {
  const r = run([task("brief", "done"), task("code", "running", ["brief"])]);
  const at = (lines: LogLine[]) => liveWork(r, { code: lines }).cursors[0];
  const one = at([tool(1, "Bash npm test")]);
  const two = at([tool(1, "Bash npm test"), tool(2, "Bash npm run build")]);
  expect([one?.x, one?.y]).not.toEqual([two?.x, two?.y]);
  expect(at([tool(1, "Bash npm test")])).toEqual(one);
});

test("two running tasks from the same card get slots one under the other", () => {
  const { slots } = liveWork(run([task("brief", "done"), task("a", "running", ["brief"]), task("b2", "running", ["brief"])]), {});
  expect(slots.map((s) => [s.x, s.y])).toEqual([
    [420, 400],
    [420, 400 + SLOT_H + 40],
  ]);
});

test("nothing is drawn once no task runs", () => {
  expect(liveWork(run([task("brief", "done")]), {})).toEqual({ slots: [], cursors: [] });
});

test("a slot shows the task's latest steps, oldest first, a few at most", () => {
  const lines = Array.from({ length: 8 }, (_, i) => tool(i + 1, `Bash step-${i + 1}`));
  const [slot] = liveWork(run([task("brief", "done"), task("code", "running", ["brief"])]), { code: lines }).slots;
  expect(slot?.steps.map((s) => s.text)).toEqual(["$ step-4", "$ step-5", "$ step-6", "$ step-7", "$ step-8"]);
  expect(slot?.steps).toHaveLength(STEPS_SHOWN);
  expect(slot?.steps.every((s) => s.kind === "command")).toBe(true);
});
