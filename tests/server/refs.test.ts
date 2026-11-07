import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { describeRefs, mediaFiles, resolveRefs, workspaceTree } from "../../src/server/refs";
import { assetsDir } from "../../src/server/store";
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

test("pictures and pages on the board become files agents can open", async () => {
  const data = config.dataDir;
  config.dataDir = await mkdtemp(join(tmpdir(), "satgas-refs-data-"));
  const asset = "11111111-2222-4333-8444-555555555555.png";
  await mkdir(assetsDir("r"), { recursive: true });
  await writeFile(join(assetsDir("r"), asset), "bytes");
  const at = { x: 0, y: 0, w: 1, h: 1, createdAt: 1 };
  const media = {
    ...run(),
    board: {
      cards: [
        { ...at, id: "up", kind: "image", title: "my shot!.png", src: `/api/runs/r/assets/${asset}` },
        { ...at, id: "work", kind: "preview", src: "/api/runs/r/files/src%2Fapp.ts" },
        { ...at, id: "web", kind: "image", src: "https://example.com/a.png" },
        { ...at, id: "out", kind: "image", src: "/api/runs/r/files/..%2F..%2Fetc%2Fpasswd" },
        { ...at, id: "bad", kind: "image", src: "/api/runs/r/files/%E0%A4%A" },
        { ...at, id: "fake", kind: "image", src: "/api/runs/r/assets/..%2Fsecret.png" },
        { ...at, id: "note", kind: "note", text: "hi" },
      ],
      links: [],
    },
  } as unknown as Run;
  try {
    const files = await mediaFiles(media, ["up", "work", "web", "out", "bad", "fake", "note", "gone"]);
    expect(files).toEqual({ up: "attachments/my-shot--11111111.png", work: "src/app.ts" });
    expect(await readFile(join(cwd, files.up as string), "utf8")).toBe("bytes");
    expect(await mediaFiles(media, ["up"])).toEqual({ up: files.up as string });

    const text = describeRefs(media, { cards: ["up", "web"], media: { up: files.up as string } });
    expect(text).toContain(`In the working directory at ${files.up}`);
    expect(text).not.toContain("/api/runs/");
    expect(text).toContain("https://example.com/a.png");
  } finally {
    await rm(config.dataDir, { recursive: true, force: true });
    await rm(join(cwd, "attachments"), { recursive: true, force: true });
    config.dataDir = data;
  }
});

test("a second picture with the same name is reached by its number", async () => {
  const at = { x: 0, y: 0, w: 1, h: 1, createdAt: 1 };
  const twins = {
    ...run(),
    board: {
      cards: [
        { ...at, id: "one", kind: "image", title: "image.png" },
        { ...at, id: "two", kind: "image", title: "image.png" },
      ],
      links: [],
    },
  } as unknown as Run;
  expect((await resolveRefs(twins, '@image.png dan @"image.png 2"')).cards).toEqual(["one", "two"]);
});

test("lists the workspace without hidden files or dependency folders", async () => {
  expect(await workspaceTree(cwd)).toEqual(["src/", "src/lib/", "src/lib/a.ts", "src/app.ts", "README.md"]);
  expect(await workspaceTree(cwd, 2)).toHaveLength(2);
});
