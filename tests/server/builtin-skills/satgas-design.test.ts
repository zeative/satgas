import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN } from "../../../src/server/builtin-skills";

const files = BUILTIN["satgas-design"] ?? {};

test("ships Satgas's design method with its reference, photo and compare scripts", () => {
  expect(Object.keys(files).sort()).toEqual([
    "SKILL.md",
    "fonts.md",
    "scripts/compare.mjs",
    "scripts/cutout.mjs",
    "scripts/fonts.mjs",
    "scripts/measure.mjs",
    "scripts/photos.mjs",
    "scripts/refs.mjs",
  ]);
  const skill = files["SKILL.md"] ?? "";
  expect(skill).toContain("name: satgas-design");
  // Every kind of page gets its own target, one system holds them together, and each page is compared section by section.
  for (const step of [
    "refs.mjs search",
    "refs.mjs shot",
    "FULL PAGE",
    "design/directions.md",
    "DESIGN.md",
    "design/hubs/",
    "design/review.md",
    "compare.mjs",
    "measure.mjs",
    "fonts.md",
    "fonts.mjs",
    "cutout.mjs",
    "--font-display",
    "part-<id>.jpg",
    "--at",
    "photos.mjs",
    "Add nothing the target does not",
    "Reveal",
  ])
    expect(skill).toContain(step);
});

test("every script is valid Node and explains itself when called wrong", async () => {
  const dir = await mkdtemp(join(tmpdir(), "satgas-design-"));
  for (const name of ["refs.mjs", "photos.mjs", "compare.mjs", "measure.mjs", "fonts.mjs", "cutout.mjs"]) {
    const path = join(dir, name);
    await writeFile(path, files[`scripts/${name}`] ?? "");
    expect(Bun.spawnSync(["node", "--check", path]).exitCode).toBe(0);
    const bare = Bun.spawnSync(["node", path], { cwd: dir });
    expect(bare.exitCode).toBe(1);
    expect(bare.stderr.toString()).toContain("Usage");
  }
  await rm(dir, { recursive: true, force: true });
});
