import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BUILTIN, OPTIONAL } from "../../../src/server/builtin-skills";
import { readSkillFile, readSources, SOURCE_CATEGORIES, validSkillName } from "../../../src/shared/skills";

const files = BUILTIN["satgas-design"] ?? {};
const catalog = JSON.parse(files["sources.json"] ?? "{}") as {
  sources: { id: string; name: string; url: string; category: string; gives: string; license: string; use: string; command?: string }[];
};
const CATEGORIES: readonly string[] = SOURCE_CATEGORIES;

let dir = "";
let work = "";
// The skill as agents get it: its files written out, the script run with node from a project folder.
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-design-"));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  work = join(dir, "project");
  await mkdir(work);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function run(...args: string[]) {
  const proc = Bun.spawn(["node", join(dir, "scripts/source.mjs"), ...args], { cwd: work, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, out, err };
}

describe("the satgas-design skill", () => {
  test("ships as a built-in the person can switch off, with a name and description agents match on", () => {
    expect(OPTIONAL["satgas-design"]).toBeDefined();
    const meta = readSkillFile(files["SKILL.md"] ?? "");
    expect(meta.name).toBe("satgas-design");
    expect(validSkillName(meta.name ?? "")).toBe(true);
    expect(meta.description?.length).toBeLessThanOrEqual(1024);
  });

  test("lists every source with what it gives, a license, a known category and an honest use", () => {
    expect(catalog.sources.length).toBeGreaterThan(30);
    expect(new Set(catalog.sources.map((s) => s.id)).size).toBe(catalog.sources.length);
    for (const s of catalog.sources) {
      expect(s.url).toStartWith("https://");
      expect(s.gives.length).toBeGreaterThan(0);
      expect(s.license.length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(s.category);
      expect(["generate", "download", "reference"]).toContain(s.use);
    }
    // Every category the UI groups by has something in it.
    for (const c of CATEGORIES) expect(catalog.sources.some((s) => s.category === c)).toBe(true);
  });

  // The skill's page reads the same file; nothing it ships may be dropped by the page's own checks.
  test("the page shows every source it ships, each with its own bundled icon", async () => {
    const shown = readSources(files["sources.json"] ?? "");
    expect(shown?.sources.length).toBe(catalog.sources.length);
    for (const s of shown?.sources ?? []) {
      expect(s.icon).toMatch(/^\/sources\//);
      expect(await Bun.file(join(import.meta.dir, "../../../src/web/public", s.icon ?? "")).exists()).toBe(true);
    }
    expect(readSources('{"sources":[{"id":"x","name":"X","url":"http://x","category":"icons","use":"download"}]}')?.sources).toEqual([]);
    expect(
      readSources('{"sources":[{"id":"x","name":"X","url":"https://x","category":"icons","use":"download","icon":"https://evil/x.png"}]}')
        ?.sources[0]?.icon,
    ).toBeUndefined();
  });

  test("defaults to a modern, elegant look and picks only hallmark themes that exist", async () => {
    const skill = files["SKILL.md"] ?? "";
    expect(skill).toContain("modern, current, elegant");
    expect(skill).toContain("Never, unless asked");
    const list = /Pick from (.+?), whichever/.exec(skill)?.[1] ?? "";
    const themes = [...list.matchAll(/`([a-z]+)`/g)].map((m) => m[1]);
    expect(themes.length).toBeGreaterThan(8);
    for (const t of themes) expect(BUILTIN.hallmark?.[`references/themes/${t}.md`]).toBeDefined();
  });

  test("asks the person to approve wireframes before anything is built", () => {
    const skill = files["SKILL.md"] ?? "";
    expect(skill).toContain("Round one: wireframes, then stop");
    expect(skill).toContain("asks the person to pick one");
  });

  // Agents only reach for what the skill points them at, so each kind of work names its references, moment and material.
  test("tells agents explicitly which sources to use for each kind of work, and to review the result", () => {
    const skill = files["SKILL.md"] ?? "";
    for (const kind of ["software", "café", "event", "game", "poster", "portfolio", "kids", "dashboard", "deck"])
      expect(skill.toLowerCase()).toContain(kind);
    for (const command of [
      "ref ",
      "bg mesh",
      "bg fffuel",
      "pattern hero",
      "avatar open-peeps",
      "lottie",
      "lib gsap",
      "photo openverse",
      "wireframe a b",
      "review ",
    ])
      expect(skill).toContain(command);
    expect(skill).toContain("design/direction.md");
  });

  test("its script lists every source it can draw from", async () => {
    const { code, out } = await run("list");
    expect(code).toBe(0);
    for (const s of catalog.sources) expect(out).toContain(s.name);
  });

  // Checked against the script's own usage, so the test never reaches the network.
  test("every command a source names is one the script offers", async () => {
    const { out } = await run("help");
    const offered = out.split("\n").map((l) => l.trim().split(/\s+/).slice(0, 2).join(" "));
    for (const s of catalog.sources) {
      if (!s.command) continue;
      const [first = "", second] = s.command.split(" ");
      const shown = offered.some(
        (o) => o === `${first} ${second}` || o.startsWith(`${first} <`) || o.startsWith(`${first} [`) || (o.startsWith(first) && !second),
      );
      expect({ source: s.id, shown }).toEqual({ source: s.id, shown: true });
    }
  });

  test("asks for what it needs in plain words instead of guessing", async () => {
    expect((await run("bg", "mesh")).err).toContain("--colors");
    expect((await run("bg", "mesh", "--colors", "#fff,nothex")).err).toContain("hex colours");
    expect((await run("bg", "mesh", "--colors", "#000,#fff", "--size", "9000x10")).err).toContain("--size");
    expect((await run("bg", "mesh", "--colors", "#000,#fff", "--distortion", "abc")).err).toContain("--distortion must be a number");
    expect((await run("icon", "lucide")).err).toContain("Name the icons");
    expect((await run("icon", "dribbble", "x")).err).toContain("Pick an icon set");
    expect((await run("bg", "fffuel", "llline")).err).toContain("Pick one of fffuel's generators");
    const photo = await run("photo", "unsplash", "coffee");
    expect(photo.code).toBe(1);
    expect(photo.err).toContain("request_secret");
    expect((await run("note", "nothing.svg")).err).toContain("--from");
    expect((await run("note", "nothing.svg", "--from", "https://x", "--license", "CC0")).err).toContain("No such file");
    expect((await run("wireframe")).err).toContain("Name the options");
    expect((await run("review")).err).toContain("Give the page");
    expect((await run("review", "nothing.html")).err).toContain("No such file");
    expect((await run("nonsense")).err).toContain("Unknown command");
  });
});
