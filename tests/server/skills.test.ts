import { afterAll, beforeAll, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeArgs } from "../../src/server/agents/claude";
import { config } from "../../src/server/config";
import {
  deleteSkill,
  enabledSkills,
  findInArchive,
  findLocal,
  findOnGithub,
  installFound,
  listSkills,
  pickSkills,
  pluginRoot,
  prepareSkills,
  readSkill,
  safeRel,
  saveOwnSkill,
  setSkillEnabled,
  skillFile,
  skillFiles,
  skillZip,
} from "../../src/server/skills";
import { readZip } from "../../src/server/zip";
import { makeZip } from "../helpers/zip";

const original = { dataDir: config.dataDir, fetch: globalThis.fetch };
let dir = "";
const skill = (name: string, desc = `Use for ${name}`) => `---\nname: ${name}\ndescription: ${desc}\n---\nDo ${name}.`;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-skills-"));
  config.dataDir = join(dir, "data");
});

afterAll(async () => {
  // Other test files share this process; skills left enabled would change their Claude command lines.
  for (const s of await listSkills()) await deleteSkill(s.name);
  const g = globalThis as { __satgasSkills?: { index: unknown; enabled: unknown[] } };
  if (g.__satgasSkills) {
    g.__satgasSkills.index = null;
    g.__satgasSkills.enabled = [];
  }
  config.dataDir = original.dataDir;
  globalThis.fetch = original.fetch;
  await rm(dir, { recursive: true, force: true });
});

test("writes, edits, renames, toggles and removes a skill of one's own", async () => {
  expect(await saveOwnSkill({ name: "Brand Voice", description: "x", body: "y" })).toContain("lowercase");
  expect(await saveOwnSkill({ name: "brand-voice", description: "", body: "y" })).toContain("when the skill should be used");
  expect(await saveOwnSkill({ name: "brand-voice", description: "Use for copy", body: "Short and warm." })).toBeNull();
  expect(await saveOwnSkill({ name: "brand-voice", description: "Again", body: "x" })).toBe("A skill with this name already exists.");
  expect(await readSkill("brand-voice")).toEqual({
    name: "brand-voice",
    description: "Use for copy",
    body: "Short and warm.",
    source: { kind: "own" },
  });

  expect(await saveOwnSkill({ name: "voice", description: "Use for all copy", body: "Warm." }, "brand-voice")).toBeNull();
  expect((await listSkills()).map((s) => [s.name, s.description, s.enabled, s.files])).toEqual([["voice", "Use for all copy", true, 1]]);
  // Claude Code reads enabled skills through links in the plugin folder.
  const link = join(pluginRoot(), "skills", "voice");
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
  expect(await readlink(link)).toBe(join(config.dataDir, "skills", "voice"));
  expect(claudeArgs()).toContain("--plugin-dir");
  expect(claudeArgs().join(" ")).toContain("Skill");
  // The planner gets no skills: it has no tools to load them with.
  expect(claudeArgs({ tools: "" })).not.toContain("--plugin-dir");

  expect(await setSkillEnabled("voice", false)).toBe("ok");
  expect(enabledSkills()).toEqual([]);
  expect(await lstat(link).catch(() => null)).toBeNull();
  expect(claudeArgs()).not.toContain("--plugin-dir");
  expect(await deleteSkill("voice")).toBe("ok");
  expect((await listSkills()).filter((s) => s.source.kind !== "builtin")).toEqual([]);
  expect(await deleteSkill("voice")).toBe("missing");
});

test("keeps archive paths inside the skill folder", () => {
  expect(safeRel("scripts/run.sh")).toBe(true);
  for (const bad of ["../x", "/etc/passwd", "a/../../b", "a\\b", "", "a//b"]) expect(safeRel(bad)).toBe(false);
});

test("finds skill folders, nested ones belonging to their parent", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const found = pickSkills(
    new Map([
      ["skills/pdf/SKILL.md", enc(skill("pdf"))],
      ["skills/pdf/forms/SKILL.md", enc(skill("forms"))],
      ["skills/pdf/scripts/fill.py", enc("print(1)")],
      ["skills/Odd Name/SKILL.md", enc("---\ndescription: odd\n---\nx")],
      ["skills/pdf/../evil", enc("x")],
      ["README.md", enc("readme")],
    ]),
    "repo",
  );
  expect(found.map((f) => [f.name, f.path, [...f.files.keys()].sort()])).toEqual([
    ["pdf", "skills/pdf", ["SKILL.md", "forms/SKILL.md", "scripts/fill.py"]],
    ["odd-name", "skills/Odd Name", ["SKILL.md"]],
  ]);
});

test("installs picked skills from an uploaded zip and replaces one of the same name", async () => {
  const zip = makeZip({ "kit/a/SKILL.md": skill("alpha"), "kit/a/ref.md": "ref", "kit/b/SKILL.md": skill("beta") });
  const found = await findInArchive(zip, "kit.zip");
  if (typeof found === "string") throw new Error(found);
  expect(found.found.map((f) => [f.name, f.files, f.installed])).toEqual([
    ["alpha", 2, false],
    ["beta", 1, false],
  ]);
  expect(await installFound(found.stage, [])).toBe("Pick at least one skill to install.");
  expect(await installFound(found.stage, ["alpha"])).toBeNull();
  expect(await installFound(found.stage, ["beta"])).toBe("That search has expired. Look the skills up again.");
  const [alpha] = await listSkills();
  expect(alpha).toMatchObject({ name: "alpha", files: 2, source: { kind: "zip", file: "kit.zip" } });
  // Skills from elsewhere are not edited here.
  expect(await saveOwnSkill({ name: "alpha", description: "d", body: "b" }, "alpha")).toBe("Only skills written here can be edited.");

  const again = await findInArchive(makeZip({ "SKILL.md": skill("alpha", "Newer") }), "alpha.zip");
  if (typeof again === "string") throw new Error(again);
  expect(again.found[0]).toMatchObject({ name: "alpha", installed: true });
  expect(await installFound(again.stage, ["alpha"])).toBeNull();
  expect((await listSkills()).find((s) => s.name === "alpha")).toMatchObject({ description: "Newer", files: 1 });
  expect(await findInArchive(makeZip({ "readme.txt": "no skill" }), "x.zip")).toBe("No SKILL.md was found in that file.");
  expect(await findInArchive(new TextEncoder().encode("garbage"), "x.zip")).toBe("This is not a zip file.");
});

test("installs from a GitHub folder, keeping where each skill came from", async () => {
  const tarball = await new Bun.Archive(
    {
      "skills-abc123/skills/pdf/SKILL.md": skill("pdf"),
      "skills-abc123/skills/pdf/a.py": "1",
      "skills-abc123/other/SKILL.md": skill("other"),
    },
    { compress: "gzip" },
  ).bytes();
  const asked: string[] = [];
  // The file list is rate limited here, so the whole tarball is the way in.
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url));
    if (String(url).includes("missing")) return new Response("", { status: 404 });
    return String(url).startsWith("https://api.github.com/") ? new Response("", { status: 403 }) : new Response(tarball);
  }) as typeof fetch;

  const found = await findOnGithub("https://github.com/acme/skills/tree/main/skills");
  if (typeof found === "string") throw new Error(found);
  expect(asked).toContain("https://codeload.github.com/acme/skills/tar.gz/main");
  expect(found.found.map((f) => [f.name, f.path, f.files])).toEqual([["pdf", "skills/pdf", 2]]);
  expect(await installFound(found.stage, ["pdf"])).toBeNull();
  expect((await listSkills()).find((s) => s.name === "pdf")?.source).toEqual({
    kind: "github",
    repo: "acme/skills",
    ref: "main",
    path: "skills/pdf",
  });

  expect(await findOnGithub("acme/missing")).toContain("not found");
  expect(await findOnGithub("nope")).toContain("Paste a GitHub repo");
  expect(await findOnGithub("acme/skills/tree/main/docs")).toContain("Paste a GitHub repo");
});

test("a big repo downloads only its skill folders, never the rest", async () => {
  const files: Record<string, string> = { "skills/deck/SKILL.md": skill("deck"), "skills/deck/ref/a.md": "notes" };
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url));
    if (String(url).startsWith("https://api.github.com/repos/acme/site/git/trees/HEAD"))
      return Response.json({
        truncated: false,
        tree: [
          { path: "site/photos/huge.jpg", type: "blob", size: 300 * 1024 * 1024 },
          { path: "skills", type: "tree" },
          ...Object.entries(files).map(([path, text]) => ({ path, type: "blob", size: text.length })),
        ],
      });
    const path = String(url).split("/HEAD/")[1] ?? "";
    return path in files ? new Response(files[path]) : new Response("", { status: 404 });
  }) as typeof fetch;

  const found = await findOnGithub("https://github.com/acme/site");
  if (typeof found === "string") throw new Error(found);
  expect(found.found.map((f) => [f.name, f.path, f.files])).toEqual([["deck", "skills/deck", 2]]);
  expect(asked.some((u) => u.includes("huge.jpg") || u.includes("codeload"))).toBe(false);
});

test("imports skills already set up for Claude Code on this machine", async () => {
  await mkdir(join(dir, "home", ".claude", "skills", "review", "refs"), { recursive: true });
  await writeFile(join(dir, "home", ".claude", "skills", "review", "SKILL.md"), skill("review"));
  await writeFile(join(dir, "home", ".claude", "skills", "review", "refs", "list.md"), "checklist");
  const found = await findLocal(join(dir, "home"));
  if (typeof found === "string") throw new Error(found);
  expect(found.found.map((f) => [f.name, f.path, f.files])).toEqual([["review", "~/.claude/skills/review", 2]]);
  expect(await installFound(found.stage, ["review"])).toBeNull();
  expect((await listSkills()).find((s) => s.name === "review")?.source).toEqual({ kind: "import", from: "~/.claude/skills/review" });
});

test("the built-in satgas skill is always on and cannot be turned off, removed or replaced", async () => {
  await prepareSkills();
  const [first] = await listSkills();
  expect(first).toMatchObject({ name: "satgas", enabled: true, source: { kind: "builtin" }, files: 4 });
  expect(enabledSkills().find((s) => s.name === "satgas")).toMatchObject({ builtin: true });
  expect((await lstat(join(pluginRoot(), "skills", "satgas"))).isSymbolicLink()).toBe(true);

  expect(await deleteSkill("satgas")).toBe("builtin");
  expect(await saveOwnSkill({ name: "satgas", description: "mine", body: "x" })).toBe("A skill with this name already exists.");
  const clash = await findInArchive(makeZip({ "SKILL.md": skill("satgas") }), "satgas.zip");
  if (typeof clash === "string") throw new Error(clash);
  expect(await installFound(clash.stage, ["satgas"])).toBe("satgas is built into Satgas and cannot be replaced.");

  expect(await setSkillEnabled("satgas", false)).toBe("builtin");
  // An "off" saved by an older Satgas is ignored.
  await writeFile(
    join(config.dataDir, "skills.json"),
    JSON.stringify({ satgas: { enabled: false, source: { kind: "builtin" }, installedAt: 0 } }),
  );
  await prepareSkills();
  expect(enabledSkills().some((s) => s.name === "satgas")).toBe(true);
  expect((await listSkills())[0]).toMatchObject({ name: "satgas", enabled: true });
});

test("Cloudflare's security-audit ships on, can be switched off and back, and can never be removed", async () => {
  await prepareSkills();
  const audit = () => listSkills().then((all) => all.find((s) => s.name === "security-audit"));
  expect(await audit()).toMatchObject({ enabled: true, optional: true, repo: "cloudflare/security-audit-skill" });
  expect(enabledSkills().some((s) => s.name === "security-audit")).toBe(true);

  expect(await setSkillEnabled("security-audit", false)).toBe("ok");
  expect(enabledSkills().some((s) => s.name === "security-audit")).toBe(false);
  // The person's "off" survives a restart, unlike an always-on skill's.
  await prepareSkills();
  expect((await audit())?.enabled).toBe(false);

  expect(await deleteSkill("security-audit")).toBe("builtin");
  expect(await setSkillEnabled("security-audit", true)).toBe("ok");
  expect((await audit())?.enabled).toBe(true);
  // Its helper scripts land under their own names, ready to run.
  expect(await Bun.file(join(config.dataDir, "skills-builtin", "security-audit", "validate-findings.cjs")).exists()).toBe(true);
});

test("Hallmark ships on for every interface, can be switched off, and carries its scripts but not its pictures", async () => {
  await prepareSkills();
  const hallmark = () => listSkills().then((all) => all.find((s) => s.name === "hallmark"));
  expect(await hallmark()).toMatchObject({ enabled: true, optional: true, repo: "Nutlope/hallmark" });
  const dir = join(config.dataDir, "skills-builtin", "hallmark");
  expect(await Bun.file(join(dir, "scripts", "sloplint.mjs")).exists()).toBe(true);
  expect(await Bun.file(join(dir, "references", "themes", "almanac.jpg")).exists()).toBe(false);
  expect(await setSkillEnabled("hallmark", false)).toBe("ok");
  expect(enabledSkills().some((s) => s.name === "hallmark")).toBe(false);
  expect(await setSkillEnabled("hallmark", true)).toBe("ok");
});

test("shows a skill's files one by one and hands the folder over as a zip", async () => {
  await prepareSkills();
  expect((await skillFiles("satgas"))?.map((f) => f.path).sort()).toEqual([
    "SKILL.md",
    "reference/board.md",
    "reference/reports.md",
    "reference/verify.md",
  ]);
  expect((await skillFile("satgas", "reference/board.md"))?.text).toContain("# Satgas board reference");
  expect(await skillFile("satgas", "../skills.json")).toBeNull();
  expect(await skillFile("satgas", "missing.md")).toBeNull();
  const zip = await skillZip("satgas");
  expect([...readZip(zip ?? new Uint8Array()).keys()].sort()).toEqual([
    "satgas/SKILL.md",
    "satgas/reference/board.md",
    "satgas/reference/reports.md",
    "satgas/reference/verify.md",
  ]);
  expect(await skillFiles("nope")).toBeNull();
});

test("agent-skills come tagged as one pack, so the Skills page can show them as one entry", async () => {
  await prepareSkills();
  const all = await listSkills();
  expect(all.find((s) => s.name === "spec-driven-development")).toMatchObject({ pack: "agent-skills", source: { kind: "builtin" } });
  expect(all.find((s) => s.name === "satgas")?.pack).toBeUndefined();
  expect(all.filter((s) => s.pack === "agent-skills").length).toBeGreaterThanOrEqual(20);
});
