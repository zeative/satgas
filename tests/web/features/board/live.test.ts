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

test("two running tasks from the same card get slots side by side, never on top of each other", () => {
  const { slots } = liveWork(run([task("brief", "done"), task("a", "running", ["brief"]), task("b2", "running", ["brief"])]), {});
  expect(slots.map((s) => [s.x, s.y])).toEqual([
    [420, 400],
    [420 + SLOT_W + 40, 400],
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

// A board that builds an app shows its pages as frames; the pointer works on the page itself, on the section it edits.
const frame = (id: string, x: number, route?: string): Card =>
  ({ id, kind: "preview", app: "web", x, y: 0, w: 960, h: 1032, createdAt: 1, ...(route ? { route } : {}) }) as Card;
const layout = (files: Record<string, { x: number; y: number; w: number; h: number }>, scrollY = 0) => ({
  files,
  scrollY,
  vh: 800,
  scale: 0.75,
  left: 0,
});

test("on an app board the pointer goes to the section the task is editing, and no slot is drawn", () => {
  const r = run([task("home", "running")], [frame("f1", 0)]);
  const { slots, cursors } = liveWork(
    r,
    { home: [tool(1, "Edit /work/src/components/home/Hero.tsx")] },
    { f1: layout({ "src/components/home/Hero.tsx": { x: 0, y: 400, w: 1280, h: 600 } }) },
  );
  expect(slots).toEqual([]);
  const c = cursors[0];
  // The hero sits 400 to 1000 px down the page, drawn at 0.75 under the 32 px bar: 332 to 782 on the board.
  expect(c && c.y >= 332 && c.y <= 782).toBe(true);
  expect(c?.area).toEqual(expect.objectContaining({ w: 960, h: 450 }));
});

test("a section scrolled out of the frame keeps the pointer at the frame's edge", () => {
  const r = run([task("home", "running")], [frame("f1", 0)]);
  const { cursors } = liveWork(
    r,
    { home: [tool(1, "Edit /work/src/components/home/Footer.tsx")] },
    { f1: layout({ "src/components/home/Footer.tsx": { x: 0, y: 4000, w: 1280, h: 300 } }) },
  );
  const c = cursors[0];
  expect(c && c.y >= 32 && c.y <= 1032).toBe(true);
});

test("a file that draws nothing yet puts the pointer on the page named like it", () => {
  const r = run([task("book", "running")], [frame("f1", 0), frame("f2", 1040, "/booking")]);
  const { cursors } = liveWork(r, { book: [tool(1, "Write /work/src/pages/Booking.tsx")] }, {});
  const c = cursors[0];
  expect(c && c.x >= 1040 && c.x <= 2000).toBe(true);
});

test("an edit's lines put the selection on the element those lines draw, and it stays there through commands", () => {
  const r = run([task("home", "running")], [frame("f1", 0)]);
  const files = {
    "src/pages/Home.tsx": {
      x: 0,
      y: 0,
      w: 1280,
      h: 2000,
      els: [
        [3, 0, 0, 1280, 2000],
        [10, 80, 200, 400, 120],
        [24, 80, 900, 600, 300],
      ] as [number, number, number, number, number][],
    },
  };
  const edit: LogLine = { ...tool(1, "Edit /work/src/pages/Home.tsx"), lines: [24, 30] };
  const at = (lines: LogLine[]) => liveWork(r, { home: lines }, { f1: layout(files) }).cursors[0];
  const one = at([edit]);
  // The element opened on line 24 sits 80 px in and 900 px down the page, at 0.75 under the 32 px bar.
  expect([one?.x, one?.y, one?.area?.w]).toEqual([60, 707, 450]);
  const two = at([edit, tool(2, "Bash bunx tsc --noEmit")]);
  expect([two?.x, two?.y]).toEqual([one?.x, one?.y]);
});

test("a source file written or read through the shell counts as the part in work", async () => {
  const { shellFile } = await import("../../../../src/web/features/board/live");
  expect(shellFile("mkdir -p src/components/booking && cat > src/components/booking/SlotPicker.tsx <<'EOF'")).toEqual({
    file: "src/components/booking/SlotPicker.tsx",
    typing: true,
  });
  expect(shellFile("sed -i '' 's|Harga|Tarif|' src/pages/Layanan.tsx")).toEqual({ file: "src/pages/Layanan.tsx", typing: true });
  expect(shellFile("cat src/components/home/Hero.tsx")).toEqual({ file: "src/components/home/Hero.tsx", typing: false });
  expect(shellFile("bunx tsc --noEmit")).toBeNull();
});
