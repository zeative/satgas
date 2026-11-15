import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanTokens, writeTokens } from "../../src/server/tokens";

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-tokens-"));
  await mkdir(join(dir, "src"), { recursive: true });
  await mkdir(join(dir, "node_modules", "lib"), { recursive: true });
  await writeFile(join(dir, "src", "index.css"), ":root {\n  --paper: #edebe6;\n  --ink: #141414;\n  --radius: 12px !important;\n}\n");
  await writeFile(join(dir, "src", "theme.css"), ":root { --accent: #2f9a5c; }\n.dark { --accent: #3fbf74; }\n");
  await writeFile(join(dir, "node_modules", "lib", "x.css"), ":root { --ink: red; }\n");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

test("a token defined once is written in place, keeping the rest of the file", async () => {
  const r = await writeTokens(dir, { "--paper": "#ffd9a8", "--radius": "8px" });
  expect(r.written.map((w) => w.name).sort()).toEqual(["--paper", "--radius"]);
  expect(r.written[0]?.file).toBe(join("src", "index.css"));
  const css = await readFile(join(dir, "src", "index.css"), "utf8");
  expect(css).toBe(":root {\n  --paper: #ffd9a8;\n  --ink: #141414;\n  --radius: 8px !important;\n}\n");
});

test("a token defined twice, or nowhere, is left for the team", async () => {
  const r = await writeTokens(dir, { "--accent": "#000000", "--nope": "1px" });
  expect(r.written).toEqual([]);
  expect(r.missed.sort()).toEqual(["--accent", "--nope"]);
  expect(await readFile(join(dir, "src", "theme.css"), "utf8")).toContain("--accent: #2f9a5c");
});

test("dependencies are never edited", async () => {
  const r = await writeTokens(dir, { "--ink": "#000" });
  expect(r.written).toEqual([{ name: "--ink", file: join("src", "index.css") }]);
  expect(await readFile(join(dir, "node_modules", "lib", "x.css"), "utf8")).toContain("--ink: red");
});

test("values that could close the rule or open another are refused", () => {
  expect(cleanTokens({ "--a": "red; } body { display: none" })).toBeNull();
  expect(cleanTokens({ "--a": "red /* x */" })).toBeNull();
  expect(cleanTokens({ color: "red" })).toBeNull();
  expect(cleanTokens({ "--a": " oklch(0.6 0.2 257) " })).toEqual({ "--a": "oklch(0.6 0.2 257)" });
});
