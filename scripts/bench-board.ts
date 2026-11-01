// Writes a heavy, deterministic board for performance checks, into its own data dir so real boards are never touched.
// Usage: bun scripts/bench-board.ts [dataDir]   (default /tmp/satgas-bench), then run Satgas with SATGAS_DATA_DIR=<dataDir>.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Card } from "../src/shared/board";
import type { NodeState, Run } from "../src/shared/types";

const dataDir = process.argv[2] ?? "/tmp/satgas-bench";
const id = "bench0001";
const cwd = join(dataDir, "workspaces", id);

// Seeded so every run of the bench draws the same board.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 2 ** 32;
  return seed / 2 ** 32;
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
const at = () => ({ x: Math.round(rand() * 9000) - 1000, y: Math.round(rand() * 6000) + 600 });

const markdown = (n: number) =>
  `## Section ${n}\n\nSome **bold** words, \`inline code\` and a [link](https://example.com).\n\n${Array.from(
    { length: 6 },
    (_, i) => `- Point ${i + 1}: ${"lorem ipsum dolor sit amet ".repeat(3)}`,
  ).join(
    "\n",
  )}\n\n\`\`\`ts\nconst value = ${n};\nexport default value;\n\`\`\`\n\n| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |`;

const nodes: NodeState[] = Array.from({ length: 36 }, (_, i) => ({
  id: `t${i}`,
  title: `Task ${i + 1}`,
  role: "Engineer",
  agent: i % 3 === 0 ? "codex" : "claude",
  task: "Do the thing",
  dependsOn: i % 6 === 0 ? [] : [`t${i - 1}`],
  status: "done",
  output: markdown(i),
  x: Math.floor(i / 6) * 320,
  y: (i % 6) * 120,
}));

const cards: Card[] = [];
const add = (kind: Card["kind"], count: number, make: (i: number) => Partial<Card>) => {
  for (let i = 0; i < count; i++) {
    const p = at();
    cards.push({ id: `${kind}-${i}`, kind, w: 220, h: 160, createdAt: 1, ...p, ...make(i) });
  }
};
add("note", 160, (i) => ({
  text: `Note ${i}: ${"remember this ".repeat(4)}`,
  color: pick(["yellow", "pink", "green", "blue", "purple"] as const),
}));
add("doc", 60, (i) => ({ title: `Doc ${i}`, text: markdown(i), w: 380, h: 300, from: `t${i % 36}` }));
add("table", 24, (i) => ({
  title: `Table ${i}`,
  w: 420,
  h: 260,
  rows: [
    ["Name", "Value", "Note", "Owner", "When", "State"],
    ...Array.from({ length: 12 }, (_, r) => [`row ${r}`, `${r * i}`, "ok", "team", "today", "done"]),
  ],
}));
add("code", 24, (i) => ({
  title: `code-${i}.ts`,
  w: 420,
  h: 260,
  from: `t${i % 36}`,
  text: Array.from({ length: 80 }, (_, l) => `const line${l} = compute(${l}, "${i}");`).join("\n"),
}));
add("preview", 8, (i) => ({ title: "index.html", w: 480, h: 340, src: `/api/runs/${id}/files/index.html?v=${i}`, from: `t${i}` }));
add("drawing", 140, () => {
  const points: number[] = [];
  let x = 10;
  let y = 60;
  for (let k = 0; k < 160; k++) {
    x += 2 + rand() * 3;
    y += (rand() - 0.5) * 8;
    points.push(Math.round(x), Math.round(Math.max(5, Math.min(115, y))));
  }
  return { w: Math.round(x) + 20, h: 120, points, color: pick(["ink", "blue", "pink", "green"] as const) };
});
add("shape", 24, (i) => ({
  text: `Shape ${i}`,
  shape: pick(["rect", "ellipse", "diamond", "triangle"] as const),
  color: "blue",
  w: 180,
  h: 120,
}));
add("text", 24, (i) => ({ text: `Heading ${i}`, w: 260, h: 56 }));
add("frame", 6, (i) => ({ text: `Frame ${i}`, w: 1400, h: 900 }));

const run: Run = {
  id,
  prompt: "Bench board: a heavy board for performance checks",
  title: "Bench board",
  cwd,
  status: "done",
  createdAt: Date.now(),
  endedAt: Date.now(),
  nodes,
  board: { cards, links: [], moved: {} },
};

await mkdir(join(dataDir, "runs"), { recursive: true });
await mkdir(cwd, { recursive: true });
await Bun.write(
  join(cwd, "index.html"),
  `<!doctype html><html><head><style>body{font:16px system-ui;margin:0;padding:24px;background:#f6f1e7}h1{font-size:32px}.c{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.c div{background:#fff;padding:16px;border-radius:12px}</style></head><body><h1>Preview</h1><div class="c">${"<div>Card</div>".repeat(12)}</div></body></html>`,
);
await Bun.write(join(dataDir, "runs", `${id}.json`), JSON.stringify({ run, logs: {} }));
console.log(`Bench board: ${nodes.length} tasks, ${cards.length} cards → ${join(dataDir, "runs", `${id}.json`)}`);
