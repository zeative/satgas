import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cardsForTask, cardsFromReply, placeInFlow, placeOnShelf, relativeInside, reuseFileCards } from "../../src/server/artifacts";
import { type FileChange, LIMITS, sanitizeOps } from "../../src/shared/board";
import { crew, teamBounds } from "../../src/shared/team";
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
  test("gives pages, sheets, docs and images their own card and leaves the rest off the canvas", async () => {
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
    expect(byKind.files).toBeUndefined();
    expect(cards.every((c) => c.from === "t1")).toBe(true);
  });
});

test("one file reported under two spellings gets one card", async () => {
  const link = `${dir}-link`;
  await symlink(dir, link);
  const written = new Map<string, FileChange["change"]>([
    [join(dir, "NOTES.md"), "modified"],
    [join(link, "NOTES.md"), "added"],
  ]);
  const cards = await cardsForTask(run([node("t1", 0, 0)]), node("t1", 0, 0), written);
  expect(cards.filter((c) => c.kind === "doc")).toHaveLength(1);
  await rm(link);
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
  // Where the shelf starts: the team's left edge, a gap below its lowest face.
  const shelf = (r: Run) => {
    const b = teamBounds(crew(r));
    return { x: b.left, y: b.bottom + 96 };
  };

  test("shelves agent cards under the team, left to right, and wraps long rows", () => {
    const r = run([node("a", 0, 0), node("b", 328, 0)]);
    const at = shelf(r);
    const card = (id: string) => ({ id, kind: "note" as const, w: 1000, h: 100, createdAt: 1 });
    const placed = placeOnShelf(r, [card("1"), card("2"), card("3")]);
    expect(placed[0]).toMatchObject({ x: at.x, y: at.y });
    expect(placed[1]).toMatchObject({ x: at.x + 1040, y: at.y });
    expect(placed[2]?.x).toBe(at.x);
    expect(placed[2]?.y).toBeGreaterThan(at.y + 100);
  });

  test("never lands inside a frame or on what it holds, even when a sticky inside was the last card added", () => {
    const frame = { id: "f", kind: "frame" as const, x: 0, y: 200, w: 1200, h: 1700, from: "a", createdAt: 1 };
    const sticky = { id: "s", kind: "note" as const, x: 900, y: 1500, w: 200, h: 120, from: "a", createdAt: 1 };
    const r = { ...run([node("a", 0, 0)]), board: { cards: [frame, sticky], links: [], moved: {} } };
    const [doc] = placeOnShelf(r, [{ id: "d", kind: "doc", w: 400, h: 460, createdAt: 1 }]);
    const overlaps =
      (doc?.x ?? 0) < frame.x + frame.w &&
      (doc?.y ?? 0) < frame.y + frame.h &&
      (doc?.x ?? 0) + 400 > frame.x &&
      (doc?.y ?? 0) + 460 > frame.y;
    expect(overlaps).toBe(false);
    expect(doc?.x).toBe(1240);
  });

  test("tucks short cards under each other beside a tall one, instead of a long single column", () => {
    const r = run([node("a", 0, 0)]);
    const at = shelf(r);
    const [tall, first, second] = placeOnShelf(r, [
      { id: "t", kind: "frame", w: 1000, h: 800, createdAt: 1 },
      { id: "1", kind: "note", w: 1000, h: 100, createdAt: 1 },
      { id: "2", kind: "note", w: 1000, h: 100, createdAt: 1 },
    ]);
    expect(tall).toMatchObject({ x: at.x, y: at.y });
    expect(first).toMatchObject({ x: at.x + 1040, y: at.y });
    expect(second).toMatchObject({ x: at.x + 1040, y: at.y + 140 });
  });

  test("starts below the team, so a card never covers a face", () => {
    const r = run([node("a", 0, 0), { ...node("later", 0, 200), round: 1, role: "Writer" }]);
    const [card] = placeOnShelf(r, [{ id: "1", kind: "note", w: 200, h: 100, createdAt: 1 }]);
    expect(card?.y).toBeGreaterThan(teamBounds(crew(r)).bottom);
  });

  test("ignores old drags of the team, which now always keeps its place", () => {
    const r = { ...run([node("a", 0, 0)]), board: { cards: [], links: [], moved: { lead: { x: 500, y: 300 } } } };
    const [card] = placeOnShelf(r, [{ id: "1", kind: "note", w: 100, h: 100, createdAt: 1 }]);
    expect(card).toMatchObject(shelf({ ...r, board: undefined }));
  });

  describe("in the flow", () => {
    const brief = { id: "b", kind: "doc" as const, x: 0, y: 400, w: 300, h: 200, from: "brief", createdAt: 1 };
    const note = (id: string) => ({ id, kind: "note" as const, w: 200, h: 100, createdAt: 2 });

    test("a task's cards go just right of the card its work came from, level with it, side by side in rows", () => {
      const r = {
        ...run([node("brief", 0, 0), node("code", 0, 0, { dependsOn: ["brief"] })]),
        board: { cards: [brief], links: [], moved: {} },
      };
      const [a, b] = placeInFlow(r, { id: "code" }, [note("1"), note("2")]);
      expect(a).toMatchObject({ x: 420, y: 400 });
      expect(b).toMatchObject({ x: 660, y: 400 });
    });

    test("many cards wrap into rows of a compact block, never one long column, and none of them touch", () => {
      const r = {
        ...run([node("brief", 0, 0), node("code", 0, 0, { dependsOn: ["brief"] })]),
        board: { cards: [brief], links: [], moved: {} },
      };
      const placed = placeInFlow(
        r,
        { id: "code" },
        Array.from({ length: 12 }, (_, i) => note(String(i))),
      );
      expect(new Set(placed.map((c) => c.y)).size).toBeLessThanOrEqual(3);
      for (const a of placed)
        for (const b of placed)
          if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    });

    test("a follow-up round continues to the right of the round it builds on", () => {
      const r = {
        ...run([node("brief", 0, 0), node("shorter", 0, 0, { round: 1, after: ["brief"] })]),
        board: { cards: [brief], links: [], moved: {} },
      };
      expect(placeInFlow(r, { id: "shorter" }, [note("1")])[0]).toMatchObject({ x: 420, y: 400 });
    });

    test("steps past a card already there instead of covering it", () => {
      const there = { id: "t", kind: "note" as const, x: 420, y: 380, w: 200, h: 200, createdAt: 1 };
      const r = {
        ...run([node("brief", 0, 0), node("code", 0, 0, { dependsOn: ["brief"] })]),
        board: { cards: [brief, there], links: [], moved: {} },
      };
      expect(placeInFlow(r, { id: "code" }, [note("1")])[0]).toMatchObject({ x: 660, y: 400 });
    });

    test("a task with nothing upstream fills the shelf as before", () => {
      const r = run([node("a", 0, 0)]);
      expect(placeInFlow(r, { id: "a" }, [note("1")])).toEqual(placeOnShelf(r, [note("1")]));
    });
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
  expect(table?.rows?.[1]?.[1]?.length).toBe(LIMITS.cell);
  expect(table?.id.length).toBeLessThanOrEqual(LIMITS.id);
  expect(sanitizeOps(cards.map((card) => ({ op: "put", card })))).not.toBeNull();
});

test("a task that only touched source files puts nothing on the canvas", async () => {
  const written = new Map<string, FileChange["change"]>([
    [join(dir, "src/app.ts"), "modified"],
    [join(dir, "bun.lock"), "modified"],
  ]);
  expect(await cardsForTask(run([]), node("t1", 0, 0), written)).toEqual([]);
});

describe("cardsFromReply", () => {
  test("turns the native blocks in a reply into cards from that task, and a plain reply into none", () => {
    const output =
      "Here you go.\n\n```satgas:table Rivers\n| River | km |\n|---|---|\n| Nile | 6650 |\n```\n\n```satgas:note\nCheck the units\n```";
    const units = cardsFromReply(run([]), node("t1", 0, 0), output);
    expect(units.map((u) => [u.anchor.kind, u.anchor.title, u.anchor.from])).toEqual([
      ["table", "Rivers", "t1"],
      ["note", undefined, "t1"],
    ]);
    expect(units[0]?.anchor.rows).toEqual([
      ["River", "km"],
      ["Nile", "6650"],
    ]);
    expect(new Set(units.map((u) => u.anchor.id)).size).toBe(2);
    expect(cardsFromReply(run([]), node("t1", 0, 0), "Halo! Ada yang bisa dibantu?")).toEqual([]);
  });

  test("a board block becomes a frame holding its items, with connectors and workspace images as file links", () => {
    const spec = {
      layout: "flow",
      items: [
        { id: "a", kind: "shape", shape: "ellipse", text: "Start" },
        { id: "b", kind: "note", text: "Sign up", color: "green" },
        { id: "c", kind: "image", src: "shots/home.png" },
      ],
      links: [
        ["a", "b"],
        ["b", "c"],
      ],
    };
    const [unit] = cardsFromReply(run([]), node("t1", 0, 0), `\`\`\`satgas:board Signup\n${JSON.stringify(spec)}\n\`\`\``);
    expect(unit?.anchor).toMatchObject({ kind: "frame", text: "Signup", from: "t1" });
    expect(unit?.children.map((c) => c.kind)).toEqual(["shape", "note", "image"]);
    expect(unit?.children[2]?.src).toBe("/api/runs/r1/files/shots/home.png");
    expect(unit?.links).toHaveLength(2);
    const ids = new Set(unit?.children.map((c) => c.id));
    expect(unit?.links.every((l) => ids.has(l.source) && ids.has(l.target))).toBe(true);
  });

  test("a block longer than a card holds is clipped to the limits the board API accepts", () => {
    const [unit] = cardsFromReply(
      run([]),
      node(`t-${"a".repeat(70)}`, 0, 0),
      `\`\`\`satgas:doc Big\n${"y".repeat(LIMITS.text + 50)}\n\`\`\``,
    );
    expect(unit?.anchor.text?.length).toBe(LIMITS.text);
    expect(sanitizeOps([{ op: "put", card: unit?.anchor }])).not.toBeNull();
  });
});

test("a page a second task rewrites keeps its one card and reloads; a new file still gets its own", () => {
  const shown = {
    id: "a:page",
    kind: "preview" as const,
    title: "index.html",
    src: "/api/runs/r1/files/index.html",
    x: 0,
    y: 300,
    w: 480,
    h: 340,
    from: "a",
    createdAt: 1,
  };
  const doc = {
    id: "a:readme",
    kind: "doc" as const,
    title: "README.md",
    text: "old",
    x: 600,
    y: 300,
    w: 380,
    h: 300,
    from: "a",
    createdAt: 1,
  };
  const r = { ...run([node("a", 0, 0), node("b", 328, 0)]), board: { cards: [shown, doc], links: [], moved: {} } };
  const { fresh, ops } = reuseFileCards(
    r,
    [
      { id: "b:page", kind: "preview", title: "index.html", src: "/api/runs/r1/files/index.html", w: 480, h: 340, from: "b", createdAt: 2 },
      { id: "b:readme", kind: "doc", title: "README.md", text: "new", w: 380, h: 300, from: "b", createdAt: 2 },
      { id: "b:css", kind: "doc", title: "style.css", text: "body{}", w: 380, h: 300, from: "b", createdAt: 2 },
    ],
    42,
  );
  expect(fresh.map((c) => c.id)).toEqual(["b:css"]);
  expect(ops).toEqual([
    { op: "patch", id: "a:page", patch: { src: "/api/runs/r1/files/index.html?v=42" } },
    { op: "patch", id: "a:readme", patch: { text: "new" } },
  ]);
});

test("a bundler's entry page gets no blank preview, while a plain page with module scripts still does", async () => {
  const { bundlerEntry } = await import("../../src/server/artifacts");
  expect(bundlerEntry('<div id="root"></div><script type="module" src="/src/main.jsx"></script>')).toBe(true);
  expect(bundlerEntry('<script type="module" src="/src/main.tsx?t=1"></script>')).toBe(true);
  expect(bundlerEntry('<script type="module" src="./app.js"></script>')).toBe(false);
  expect(bundlerEntry("<h1>Kopi Senja</h1>")).toBe(false);
});

test("what a page is made of stays off the canvas; the page, the direction and the poster get cards", async () => {
  const { isMaterial } = await import("../../src/server/artifacts");
  for (const m of [
    "assets/icons/flame.svg",
    "public/sound.svg",
    "src/assets/hero.png",
    "design/refs/x-desktop.jpg",
    "design/review/compare.jpg",
    "design/sources.md",
    "screenshots/win.png",
    "vendor/gsap.min.js",
  ])
    expect({ m, material: isMaterial(m) }).toEqual({ m, material: true });
  for (const r of ["index.html", "design/direction.md", "poster.png", "out/kopi-senja-story.png"])
    expect({ r, material: isMaterial(r) }).toEqual({ r, material: false });
});
