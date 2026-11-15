import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLoc, writeText } from "../../src/server/text-edit";

let dir = "";
const page = [
  "export function Home() {",
  "  return (",
  "    <main>",
  '      <h1 data-satgas-loc="src/home.tsx:4">Know who to call</h1>',
  "      <p>Pick a plan</p>",
  "      <p>Pick a plan</p>",
  "    </main>",
  "  );",
  "}",
].join("\n");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-text-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "home.tsx"), page);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

test("reads a source location with or without a column", () => {
  expect(parseLoc("src/home.tsx:4")).toEqual({ file: "src/home.tsx", line: 4 });
  expect(parseLoc("src/home.tsx:4:7")).toEqual({ file: "src/home.tsx", line: 4 });
  expect(parseLoc("nothing")).toBeNull();
});

test("words found once near their line are rewritten in place", async () => {
  const r = await writeText(dir, "src/home.tsx:4", "Know who to call", "Know who is ready");
  expect(r).toEqual({ ok: true, file: join("src", "home.tsx") });
  expect(await readFile(join(dir, "src", "home.tsx"), "utf8")).toBe(page.replace("Know who to call", "Know who is ready"));
});

test("words found twice, words with markup, and paths outside the app go to the team", async () => {
  expect(await writeText(dir, "src/home.tsx:5", "Pick a plan", "Choose a plan")).toEqual({ ok: false, reason: "found more than once" });
  expect((await writeText(dir, "src/home.tsx:4", "Know who is ready", "Hi {name}")).ok).toBe(false);
  expect((await writeText(dir, "../etc/passwd:1", "root", "x")).ok).toBe(false);
  expect((await writeText(dir, "src/home.tsx:4", "Not on the page", "x")).ok).toBe(false);
});
