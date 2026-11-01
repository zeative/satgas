import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardsForTask, finalReportCard, placeOnShelf, relativeInside } from "../../src/server/artifacts";
import { type FileChange, LIMITS, sanitizeOps } from "../../src/shared/board";
import type { NodeState, Run } from "../../src/shared/types";

let dir: string;
const node = (id: string, x: number, y: number, extra: Partial<NodeState> = {}): NodeState => ({
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
const run = (nodes: NodeState[]): Run => ({ id: "r1", prompt: "p", cwd: dir, status: "running", createdAt: 1, nodes });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-artifacts-"));
  await Bun.write(join(dir, "site/index.html"), "<h1>hi</h1>");
  await Bun.write(join(dir, "data/rivers.csv"), "name,km\nNile,6650\n");
  await Bun.write(join(dir, "NOTES.md"), "# Notes");
  await Bun.write(join(dir, "shot.png"), "png");
  await Bun.write(join(dir, "src/app.ts"), "export {}");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

test("keeps only paths inside the working folder", () => {
  expect(relativeInside("/w", "/w/a/b.txt")).toBe("a/b.txt");
  expect(relativeInside("/w", "a/b.txt")).toBe("a/b.txt");
  expect(relativeInside("/w", "/etc/passwd")).toBeNull();
  expect(relativeInside("/w", "/w")).toBeNull();
});

test("matches real paths an agent reports for a folder reached through a symlink", async () => {
  const link = `${dir}-link`;
  await symlink(dir, link);
  try {
    const realFile = `${await Bun.$`realpath ${dir}`.text().then((s) => s.trim())}/NOTES.md`;
    expect(relativeInside(link, realFile)).toBe("NOTES.md");
  } finally {
    await rm(link, { force: true });
  }
});

describe("cardsForTask", () => {
  test("gives pages, sheets, docs and images their own card and lists the rest", async () => {
    const written = new Map<string, FileChange["change"]>([
      [join(dir, "site/index.html"), "added"],
      [join(dir, "data/rivers.csv"), "added"],
      [join(dir, "NOTES.md"), "modified"],
      [join(dir, "shot.png"), "added"],
      [join(dir, "src/app.ts"), "modified"],
      ["/elsewhere/secret.txt", "added"],
    ]);
    const cards = await cardsForTask(run([node("t1", 0, 0)]), node("t1", 0, 0), written);
    const byKind = Object.fromEntries(cards.map((c) => [c.kind, c]));
    expect(byKind.preview?.src).toBe("/api/runs/r1/files/site/index.html");
    expect(byKind.table?.rows).toEqual([
      ["name", "km"],
      ["Nile", "6650"],
    ]);
    expect(byKind.doc?.text).toBe("# Notes");
    expect(byKind.image?.src).toBe("/api/runs/r1/files/shot.png");
    expect(byKind.files?.files).toEqual([{ path: "src/app.ts", change: "modified" }]);
    expect(cards.every((c) => c.from === "t1")).toBe(true);
  });
});

test("gives files with a long shared prefix distinct card ids", async () => {
  const deep = `${"nested/".repeat(10)}`;
  await Bun.write(join(dir, `${deep}a.md`), "a");
  await Bun.write(join(dir, `${deep}b.md`), "b");
  const written = new Map<string, FileChange["change"]>([
    [join(dir, `${deep}a.md`), "added"],
    [join(dir, `${deep}b.md`), "added"],
  ]);
  const cards = await cardsForTask(run([node("t1", 0, 0)]), node("t1", 0, 0), written);
  const ids = cards.map((c) => c.id);
  expect(new Set(ids).size).toBe(2);
  expect(ids.every((id) => id.length <= 64)).toBe(true);
});

describe("placement", () => {
  test("shelves agent cards under the graph, left to right, and wraps long rows", () => {
    const r = run([node("a", 0, 0), node("b", 328, 0)]);
    const card = (id: string) => ({ id, kind: "note" as const, w: 600, h: 100, createdAt: 1 });
    const placed = placeOnShelf(r, [card("1"), card("2"), card("3")]);
    expect(placed[0]).toMatchObject({ x: 0, y: 104 + 96 });
    expect(placed[1]).toMatchObject({ x: 640, y: 200 });
    expect(placed[2]?.x).toBe(0);
    expect(placed[2]?.y).toBeGreaterThan(300);
  });

  test("shelves under tasks where people dragged them, not where the planner put them", () => {
    const r = { ...run([node("a", 0, 0)]), board: { cards: [], links: [], moved: { a: { x: 500, y: 300 } } } };
    const [card] = placeOnShelf(r, [{ id: "1", kind: "note", w: 100, h: 100, createdAt: 1 }]);
    expect(card).toMatchObject({ x: 500, y: 300 + 104 + 96 });
  });

  test("puts the final report to the right of the graph, from the last task", () => {
    const r = run([node("a", 0, 0, { output: "first" }), node("b", 328, 0, { dependsOn: ["a"], output: "Shipped it" })]);
    const card = finalReportCard(r.nodes, "Launch");
    expect(card).toMatchObject({ id: "final-report", kind: "doc", from: "b", text: "Shipped it", title: "Launch" });
    expect(card?.x).toBeGreaterThan(328 + 240);
  });
});

test("cards made from agent output stay within the limits the board API accepts, so undoing a delete works", async () => {
  await Bun.write(join(dir, "wide.csv"), `name,notes\nNile,${"x".repeat(3000)}\n`);
  const longId = `t-${"a".repeat(70)}`;
  const written = new Map<string, FileChange["change"]>([
    [join(dir, "wide.csv"), "added"],
    [join(dir, "src/app.ts"), "modified"],
  ]);
  const cards = placeOnShelf(run([node(longId, 0, 0)]), await cardsForTask(run([node(longId, 0, 0)]), node(longId, 0, 0), written));
  const table = cards.find((c) => c.kind === "table");
  const files = cards.find((c) => c.kind === "files");
  expect(table?.rows?.[1]?.[1]?.length).toBe(LIMITS.cell);
  expect(files?.id.length).toBeLessThanOrEqual(LIMITS.id);
  expect(sanitizeOps(cards.map((card) => ({ op: "put", card })))).not.toBeNull();
});

test("a long task id still gets a distinct files card id", async () => {
  const written = new Map<string, FileChange["change"]>([[join(dir, "src/app.ts"), "modified"]]);
  const ids = await Promise.all(
    [`${"b".repeat(60)}-one`, `${"b".repeat(60)}-two`].map(async (id) => (await cardsForTask(run([]), node(id, 0, 0), written))[0]?.id),
  );
  expect(new Set(ids).size).toBe(2);
});

test("a final report longer than a card holds is clipped to fit", () => {
  const card = finalReportCard([node("end", 0, 0, { output: "y".repeat(LIMITS.text + 50) })], "Report");
  expect(card?.text?.length).toBe(LIMITS.text);
  expect(sanitizeOps([{ op: "put", card }])).not.toBeNull();
});
