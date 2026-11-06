import { describe, expect, test } from "bun:test";
import type { Card } from "../../src/shared/board";
import {
  blockUnit,
  insideOwnFrame,
  isRunLog,
  noteSize,
  plainNote,
  splitBlocks,
  stripBlocks,
  tableParts,
  tableRows,
  tableSize,
} from "../../src/shared/board-blocks";

const reply = [
  "Here is the comparison.",
  "",
  "```satgas:table Monthly sales",
  "| Month | Sales |",
  "|---|---:|",
  "| Jan | 120 |",
  "| Feb | 98 |",
  "```",
  "",
  "````satgas:doc Setup guide",
  "Install it:",
  "```sh",
  "bun install",
  "```",
  "````",
  "",
  "```satgas:note",
  "Remember the Q3 review",
  "```",
  "Done.",
].join("\n");

describe("board blocks", () => {
  test("splits native cards out of a reply and keeps the words around them", () => {
    const { reply: rest, blocks } = splitBlocks(reply);
    expect(rest).toBe("Here is the comparison.\n\nDone.");
    expect(blocks.map((b) => [b.kind, b.title])).toEqual([
      ["table", "Monthly sales"],
      ["doc", "Setup guide"],
      ["note", ""],
    ]);
    expect(blocks[1]?.body).toBe("Install it:\n```sh\nbun install\n```");
  });

  test("reads markdown tables and CSV", () => {
    expect(tableRows("| Month | Sales |\n|---|---:|\n| Jan | 120 |")).toEqual([
      ["Month", "Sales"],
      ["Jan", "120"],
    ]);
    expect(tableRows('name,city\nAyu,"Jakarta, ID"')).toEqual([
      ["name", "city"],
      ["Ayu", "Jakarta, ID"],
    ]);
  });

  test("turns blocks into card fields sized for their content", () => {
    let n = 0;
    const [table, doc, note] = splitBlocks(reply).blocks.map((block) => blockUnit(block, () => `id${++n}`).anchor);
    expect(table).toMatchObject({
      kind: "table",
      title: "Monthly sales",
      rows: [
        ["Month", "Sales"],
        ["Jan", "120"],
        ["Feb", "98"],
      ],
    });
    expect(doc).toMatchObject({ kind: "doc", title: "Setup guide" });
    expect(note).toMatchObject({ kind: "note", text: "Remember the Q3 review" });
    expect(blockUnit({ kind: "code", title: "src/sum.ts", body: "export const sum = 1;" }, () => "c").anchor).toMatchObject({
      kind: "code",
      lang: "ts",
    });
  });

  test("leaves ordinary code fences and plain replies alone", () => {
    const plain = "Hi there!\n\n```ts\nconst a = 1;\n```";
    expect(stripBlocks(plain)).toBe(plain);
    expect(splitBlocks("```satgas:table Empty\n```").blocks).toEqual([]);
  });
});

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const board = (spec: unknown) => blockUnit({ kind: "board", title: "Plan", body: JSON.stringify(spec) }, ids());

describe("tables written loosely", () => {
  test("words around the table inside its block go back to the chat, and the table stays whole", () => {
    const body =
      "\n| Istilah | Merujuk ke |\n|---|---|\n| **Tiongkok** | Negara |\n| **Tionghoa** | Orang, budaya |\n\nKetiganya tidak sepenuhnya sinonim.\n";
    expect(tableParts(body)).toMatchObject({
      rows: [
        ["Istilah", "Merujuk ke"],
        ["**Tiongkok**", "Negara"],
        ["**Tionghoa**", "Orang, budaya"],
      ],
      prose: "Ketiganya tidak sepenuhnya sinonim.",
    });
    const { reply: rest, blocks } = splitBlocks(`Ini tabelnya.\n\n\`\`\`satgas:table Istilah${body}\`\`\``);
    expect(rest).toBe("Ini tabelnya.\n\nKetiganya tidak sepenuhnya sinonim.");
    expect(tableRows(blocks[0]?.body ?? "")).toHaveLength(3);
  });

  test("centred columns (`:--:`) mark the rule too, so a comma inside a cell never splits it", () => {
    const rows = tableRows("| Tool | Total |\n|---|:--:|\n| Claude Code | **4,15** |\n| Aider | **3,55** |");
    expect(rows).toEqual([
      ["Tool", "Total"],
      ["Claude Code", "**4,15**"],
      ["Aider", "**3,55**"],
    ]);
  });

  test("pipe rows without a rule still make a table, not CSV", () => {
    expect(tableRows("| a | b, c |\n| 1 | 2 |")).toEqual([
      ["a", "b, c"],
      ["1", "2"],
    ]);
  });

  test("tables without outer pipes read too", () => {
    expect(tableRows("a | b\n--- | ---\n1 | 2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("board blocks", () => {
  test("a flow lays items out in columns by their links, inside a titled frame", () => {
    const unit = board({
      layout: "flow",
      items: [
        { id: "a", text: "Idea" },
        { id: "b", text: "Build" },
        { id: "c", text: "Ship" },
      ],
      links: [
        ["a", "b"],
        ["b", "c"],
      ],
    });
    expect(unit.anchor).toMatchObject({ kind: "frame", text: "Plan" });
    const [a, b, c] = unit.children;
    expect((a?.x ?? 0) < (b?.x ?? 0) && (b?.x ?? 0) < (c?.x ?? 0)).toBe(true);
    expect(unit.links).toEqual([
      { source: a?.id ?? "", target: b?.id ?? "" },
      { source: b?.id ?? "", target: c?.id ?? "" },
    ]);
    for (const child of unit.children) expect(child.x + child.w <= unit.anchor.w && child.y + child.h <= unit.anchor.h).toBe(true);
  });

  test("a mind map grows both ways from its centre, splitting the branches in order", () => {
    const branches = ["b1", "b2", "b3", "b4"];
    const unit = board({
      layout: "mindmap",
      items: [{ id: "root", kind: "shape", shape: "ellipse", text: "Q3" }, ...branches.map((id) => ({ id, text: id }))],
      links: branches.map((id) => ["root", id]),
    });
    const [root, b1, b2, b3, b4] = unit.children;
    const rx = root?.x ?? 0;
    expect([b1, b2].every((c) => (c?.x ?? 0) > rx)).toBe(true);
    expect([b3, b4].every((c) => (c?.x ?? 0) < rx)).toBe(true);
    expect((b1?.y ?? 0) < (b2?.y ?? 0)).toBe(true);
    for (const child of unit.children) expect(child.x >= 40 && child.x + child.w <= unit.anchor.w).toBe(true);
  });

  test("a loose note beside the map does not stop it growing both ways; it sits underneath", () => {
    const branches = ["b1", "b2", "b3", "b4"];
    const unit = board({
      layout: "mindmap",
      items: [{ id: "root", text: "React" }, ...branches.map((id) => ({ id, text: id })), { id: "tip", text: "Tip: practise daily" }],
      links: branches.map((id) => ["root", id]),
    });
    const at = Object.fromEntries(unit.children.map((c) => [c.text, c]));
    const rootX = at.React?.x ?? 0;
    expect([at.b1, at.b2].every((c) => (c?.x ?? 0) > rootX)).toBe(true);
    expect([at.b3, at.b4].every((c) => (c?.x ?? 0) < rootX)).toBe(true);
    const lowest = Math.max(...branches.map((b) => (at[b]?.y ?? 0) + (at[b]?.h ?? 0)));
    expect(at["Tip: practise daily"]?.y ?? 0).toBeGreaterThan(lowest);
  });

  test("a tree flow centres every parent on its own children, so threads never cross", () => {
    const unit = board({
      layout: "flow",
      items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "b1" }, { id: "b2" }, { id: "c1" }, { id: "c2" }].map((i) => ({
        ...i,
        text: i.id,
      })),
      links: [
        ["a", "b"],
        ["a", "c"],
        ["b", "b1"],
        ["b", "b2"],
        ["c", "c1"],
        ["c", "c2"],
      ],
    });
    const at = Object.fromEntries(unit.children.map((c) => [c.text, c.y + c.h / 2]));
    expect(at.b).toBeCloseTo(((at.b1 ?? 0) + (at.b2 ?? 0)) / 2);
    expect(at.c).toBeCloseTo(((at.c1 ?? 0) + (at.c2 ?? 0)) / 2);
    expect(Math.max(at.b1 ?? 0, at.b2 ?? 0) < Math.min(at.c1 ?? 0, at.c2 ?? 0)).toBe(true);
  });

  test("free positions drawn for smaller cards are spread out evenly until nothing overlaps, keeping the shape", () => {
    const unit = board({
      layout: "free",
      items: [
        { id: "a", kind: "shape", text: "Cart", x: 40, y: 0 },
        { id: "b", kind: "shape", text: "Pay", x: 40, y: 64 },
        { id: "c", kind: "shape", text: "Done", x: 40, y: 128 },
        { id: "d", kind: "note", text: "Same spot", x: 40, y: 128 },
      ],
    });
    const cards = unit.children;
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i];
        const b = cards[j];
        if (!a || !b) continue;
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
    const [cart, pay, done] = cards;
    expect((cart?.y ?? 0) < (pay?.y ?? 0) && (pay?.y ?? 0) < (done?.y ?? 0)).toBe(true);
    expect(new Set(cards.slice(0, 3).map((c) => c.x)).size).toBe(1);
  });

  test("a branch label drawn on top of its diamond moves off it instead of blowing the whole flow up", () => {
    const unit = board({
      layout: "free",
      items: [
        { id: "q", kind: "shape", shape: "diamond", text: "Paid?", x: 520, y: 700 },
        { id: "no", kind: "text", text: "TIDAK", x: 575, y: 730 },
        { id: "next", kind: "shape", text: "Refund", x: 520, y: 900 },
      ],
    });
    const [q, no, next] = unit.children;
    expect(unit.anchor.w).toBeLessThan(600);
    expect((next?.y ?? 0) - (q?.y ?? 0)).toBe(200);
    const onTop = (a: typeof q, b: typeof q) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(onTop(q, no) || onTop(next, no)).toBe(false);
  });

  test("a long chain wraps into rows of six steps instead of running off the screen", () => {
    const steps = Array.from({ length: 14 }, (_, i) => `s${i}`);
    const unit = board({
      layout: "flow",
      items: steps.map((id) => ({ id, kind: "shape", text: id })),
      links: steps.slice(1).map((id, i) => [steps[i], id]),
    });
    const at = Object.fromEntries(unit.children.map((c) => [c.text, c]));
    expect(unit.anchor.w).toBeLessThan(1800);
    expect(at.s0?.y).toBe(at.s5?.y);
    expect((at.s6?.y ?? 0) > (at.s5?.y ?? 0)).toBe(true);
    expect(at.s6?.x).toBe(at.s0?.x);
    expect((at.s12?.y ?? 0) > (at.s6?.y ?? 0)).toBe(true);
  });

  test("a flow that merges keeps columns by depth", () => {
    const unit = board({
      layout: "flow",
      items: ["start", "left", "right", "end"].map((id) => ({ id, text: id })),
      links: [
        ["start", "left"],
        ["start", "right"],
        ["left", "end"],
        ["right", "end"],
      ],
    });
    const x = Object.fromEntries(unit.children.map((c) => [c.text, c.x]));
    expect(x.left).toBe(x.right);
    expect((x.end ?? 0) > (x.left ?? 0)).toBe(true);
  });

  test("a kanban gets a header and a stack of stickies per column, in the order columns appear", () => {
    const unit = board({
      layout: "kanban",
      items: [
        { text: "Login", column: "To do" },
        { text: "API", column: "Doing" },
        { text: "DB", column: "To do" },
      ],
    });
    const headers = unit.children.filter((c) => c.kind === "text").map((c) => c.text);
    expect(headers).toEqual(["To do", "Doing"]);
    const todo = unit.children.filter((c) => c.kind === "note" && (c.text === "Login" || c.text === "DB"));
    expect(new Set(todo.map((c) => c.x)).size).toBe(1);
  });

  test("items keep their kinds, colors and shapes; unknown values fall back, links to unknown items are dropped", () => {
    const unit = board({
      items: [
        { id: "s", kind: "shape", shape: "diamond", color: "pink", text: "Paid?" },
        {
          id: "t",
          kind: "table",
          rows: [
            ["a", "b"],
            ["1", "2"],
          ],
        },
        { id: "x", kind: "hologram", color: "neon", text: "?" },
      ],
      links: [
        ["s", "t"],
        ["s", "nope"],
        ["s", "s"],
      ],
    });
    expect(unit.children.map((c) => [c.kind, c.shape ?? c.color ?? null])).toEqual([
      ["shape", "diamond"],
      ["table", null],
      ["note", "yellow"],
    ]);
    expect(unit.children[0]?.color).toBe("pink");
    expect(unit.links).toHaveLength(1);
  });

  test("unreadable JSON still lands on the board as a doc", () => {
    const unit = blockUnit({ kind: "board", title: "Oops", body: "{ not json" }, ids());
    expect(unit.anchor).toMatchObject({ kind: "doc", title: "Oops" });
  });

  test("cards inside their own task's frame are recognised, so the frame stands for them", () => {
    const frame = { id: "f", kind: "frame", from: "t1", x: 0, y: 0, w: 500, h: 300, createdAt: 1 } as Card;
    const inside = { id: "n", kind: "note", from: "t1", x: 40, y: 60, w: 200, h: 140, createdAt: 1 } as Card;
    const other = { ...inside, id: "m", from: "t2" };
    expect(insideOwnFrame(inside, [frame, inside])).toBe(true);
    expect(insideOwnFrame(other, [frame, other])).toBe(false);
    expect(insideOwnFrame(frame, [frame])).toBe(false);
  });
});

describe("card sizes", () => {
  test("a sticky grows with its text instead of cutting it, and widens before it gets tall", () => {
    const short = noteSize("Ship it");
    const long = noteSize(
      "Claude Code (Anthropic) Kuat: agentic, paham repo dan terminal. Khawatir: berbayar, butuh langganan atau API. Biaya: langganan (perkiraan) ".repeat(
        2,
      ),
    );
    expect(short).toEqual({ w: 200, h: 120 });
    expect(long.h).toBeGreaterThan(short.h);
    expect(long.w).toBe(280);
  });

  test("a sticky that would be cut even when wide becomes a doc card instead", () => {
    const essay = "Tidak ada indikasi test yang salah; semua kegagalan berasal dari src/cart.ts. ".repeat(30);
    expect(blockUnit({ kind: "note", title: "", body: essay }, ids()).anchor.kind).toBe("doc");
    expect(blockUnit({ kind: "note", title: "", body: "Ship it" }, ids()).anchor.kind).toBe("note");
    const unit = board({
      items: [
        { id: "a", text: essay },
        { id: "b", text: "short" },
      ],
    });
    expect(unit.children.map((c) => c.kind)).toEqual(["doc", "note"]);
  });

  test("a table is as wide as its columns need and as tall as its wrapped rows", () => {
    const narrow = tableSize([
      ["a", "b"],
      ["1", "2"],
    ]);
    const wide = tableSize([
      ["Tool", "Pembuat", "Model yang dipakai", "Kelebihan utama", "Keterbatasan", "Harga model"],
      [
        "Claude Code",
        "Anthropic",
        "Claude (Opus, Sonnet, Haiku)",
        "Agentic kuat, paham repo & terminal",
        "Berbayar, butuh langganan atau API",
        "~$20–200/bulan (perkiraan)",
      ],
    ]);
    const long = tableSize([["Month", "Sales"], ...Array.from({ length: 12 }, (_, i) => [`M${i}`, String(i * 10)])]);
    expect(narrow.w).toBe(240);
    expect(wide.w).toBeGreaterThan(800);
    expect(long.h).toBeGreaterThan(narrow.h);
  });
});

describe("logs stay out of the board", () => {
  const log = "bun test v1.4.2 (744846f84)\n\n 5 pass\n 0 fail\n 7 expect() calls\nRan 5 tests across 1 file. [6.00ms]";

  test("a pasted test run is a log; a written document or real code is not", () => {
    expect(isRunLog(log)).toBe(true);
    expect(isRunLog("## Test plan\n\n- 5 pass criteria\n- Ran 5 tests nightly")).toBe(false);
    expect(isRunLog("export const sum = (a: number, b: number) => a + b;")).toBe(false);
  });

  test("a log block becomes plain code in the chat instead of a card", () => {
    const { reply, blocks } = splitBlocks(
      `All green.\n\n\`\`\`satgas:doc Hasil bun test\n${log}\n\`\`\`\n\n\`\`\`satgas:note\nCoupons ship today\n\`\`\``,
    );
    expect(blocks.map((b) => b.kind)).toEqual(["note"]);
    expect(reply).toContain("Ran 5 tests across 1 file");
    expect(reply).not.toContain("satgas:doc");
  });
});

test("a fence opens a block only at the start of a line, so mentioning the syntax stays prose", () => {
  const text = "Use four backticks (````satgas:doc) when a doc has fences.\n\n```satgas:note\nReal note\n```";
  const { reply, blocks } = splitBlocks(text);
  expect(blocks).toEqual([{ kind: "note", title: "", body: "Real note" }]);
  expect(reply).toBe("Use four backticks (````satgas:doc) when a doc has fences.");
  expect(splitBlocks("  ```satgas:note\nIndented\n  ```").blocks).toEqual([{ kind: "note", title: "", body: "Indented" }]);
});

test("stickies drop markdown emphasis they cannot show", () => {
  expect(plainNote("**Akun:** zeative\n## Repos\n__105__ repo")).toBe("Akun: zeative\nRepos\n105 repo");
});
