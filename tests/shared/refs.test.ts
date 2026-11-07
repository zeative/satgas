import { expect, test } from "bun:test";
import type { Card } from "../../src/shared/board";
import { atToken, cardContent, cardLabel, cardMentions, parseTokens, splitTokens } from "../../src/shared/refs";

test("finds / and @ tokens only where a word starts", () => {
  const { slash, at } = parseTokens('/ask buat @codex rapikan @src/app.ts dan @"Tujuan & KPI", lihat src/a /tmp/x mail a@b.com /pdf.');
  expect(slash).toEqual(["ask", "pdf"]);
  expect(at).toEqual(["codex", "src/app.ts", "Tujuan & KPI"]);
});

test("writes mentions bare or quoted", () => {
  expect(atToken("README.md")).toBe("@README.md");
  expect(atToken("Tujuan & KPI")).toBe('@"Tujuan & KPI"');
});

test("labels and reads cards for prompts", () => {
  const table: Card = {
    id: "t",
    kind: "table",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    createdAt: 1,
    title: "KPI",
    rows: [
      ["Area", "Goal"],
      ["Reach", "10k | views"],
    ],
  };
  expect(cardLabel(table)).toBe("KPI");
  expect(cardContent(table)).toBe("| Area | Goal |\n| --- | --- |\n| Reach | 10k \\| views |");
  const note: Card = { id: "n", kind: "note", x: 0, y: 0, w: 1, h: 1, createdAt: 1, text: "Use amber\nnot purple" };
  expect(cardLabel(note)).toBe("Use amber");
  expect(cardContent(note, 5)).toBe("Use a…");
});

test("every picture and page can be named, even untitled ones or several called image.png", () => {
  const at = { x: 0, y: 0, w: 1, h: 1, createdAt: 1 };
  const cards: Card[] = [
    { ...at, id: "a", kind: "image", title: "image.png", src: "/api/runs/r/assets/a.png" },
    { ...at, id: "b", kind: "image", title: "Image.PNG", src: "/api/runs/r/assets/b.png" },
    { ...at, id: "c", kind: "image", src: "/api/runs/r/files/shots/hero%20shot.png?v=2" },
    { ...at, id: "d", kind: "preview", src: "/api/runs/r/files/report.pdf" },
    { ...at, id: "e", kind: "drawing", title: "ink" },
    { ...at, id: "f", kind: "note" },
  ];
  expect(cardLabel(cards[2] as Card)).toBe("hero shot.png");
  expect([...cardMentions(cards)]).toEqual([
    ["a", "image.png"],
    ["b", "Image.PNG 2"],
    ["c", "hero shot.png"],
    ["d", "report.pdf"],
  ]);
});

test("cuts prompt text into words and tokens without losing a character", () => {
  const text = 'Pakai /pdf untuk @"Tujuan & KPI", lalu @src/app.ts.';
  const pieces = splitTokens(text);
  expect(pieces.map((p) => p.text).join("")).toBe(text);
  expect(pieces.filter((p) => p.kind)).toEqual([
    { text: "/pdf", kind: "/", name: "pdf" },
    { text: '@"Tujuan & KPI"', kind: "@", name: "Tujuan & KPI" },
    { text: "@src/app.ts", kind: "@", name: "src/app.ts" },
  ]);
});
