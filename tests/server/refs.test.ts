import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeRefs, resolveRefs, workspaceTree } from "../../src/server/refs";
import type { Run } from "../../src/shared/types";

let cwd = "";
beforeAll(async () => {
  cwd = await mkdtemp(join(tmpdir(), "satgas-refs-"));
  await mkdir(join(cwd, "src", "lib"), { recursive: true });
  await mkdir(join(cwd, "node_modules", "x"), { recursive: true });
  await writeFile(join(cwd, "src", "app.ts"), "app");
  await writeFile(join(cwd, "src", "lib", "a.ts"), "a");
  await writeFile(join(cwd, ".env"), "secret");
  await writeFile(join(cwd, "README.md"), "readme");
});
afterAll(() => rm(cwd, { recursive: true, force: true }));

const run = (): Run => ({
  id: "r",
  prompt: "p",
  cwd,
  status: "done",
  createdAt: 1,
  nodes: [],
  board: {
    cards: [
      {
        id: "k1",
        kind: "table",
        title: "Tujuan & KPI",
        rows: [
          ["Area", "Goal"],
          ["Reach", "10k"],
        ],
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        createdAt: 1,
      },
    ],
    links: [],
  } as unknown as Run["board"],
});

test("looks up what each token names and leaves the rest as words", async () => {
  const refs = await resolveRefs(
    run(),
    '/ask /claude /nope tolong @claude rapikan @src/app.ts lihat @"tujuan & kpi" @../etc/passwd @ghost',
  );
  expect(refs).toEqual({ ask: true, only: "claude", agents: ["claude"], files: ["src/app.ts"], cards: ["k1"] });
});

test("describes the lookup in words for the planner and the agents", async () => {
  const text = describeRefs(run(), { only: "codex", files: ["src/app.ts"], cards: ["k1"], connectors: ["github"] });
  expect(text).toContain("every task goes to Codex");
  expect(text).toContain("- src/app.ts");
  expect(text).toContain("### Tujuan & KPI (table)\n| Area | Goal |");
  expect(text).toContain("Connectors (MCP servers) the user wants used: github");
  expect(describeRefs(run(), undefined)).toBe("");
});

test("lists the workspace without hidden files or dependency folders", async () => {
  expect(await workspaceTree(cwd)).toEqual(["src/", "src/lib/", "src/lib/a.ts", "src/app.ts", "README.md"]);
  expect(await workspaceTree(cwd, 2)).toHaveLength(2);
});
