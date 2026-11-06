import { describe, expect, test } from "bun:test";
import { parseGithubSource, readSkillFile, slugSkill, validSkillName, writeSkillFile } from "../../src/shared/skills";

describe("readSkillFile", () => {
  test("reads plain, quoted and block values from the front matter", () => {
    const md = `---\nname: pdf\ndescription: >\n  Fill and merge PDFs.\n  Use for forms.\nlicense: "MIT: see file"\n---\n# PDF\nSteps`;
    expect(readSkillFile(md)).toEqual({ name: "pdf", description: "Fill and merge PDFs. Use for forms.", body: "# PDF\nSteps" });
    expect(readSkillFile(`---\nname: a\ndescription: 'It''s quoted'\n---\n`).description).toBe("It's quoted");
  });

  test("a file without front matter is all body", () => {
    expect(readSkillFile("# Just text")).toEqual({ body: "# Just text" });
  });

  test("round-trips what the form writes, even with colons and quotes", () => {
    const md = writeSkillFile("brand-voice", 'Use for copy: "short" and warm', "Write like this.");
    expect(readSkillFile(md)).toEqual({ name: "brand-voice", description: 'Use for copy: "short" and warm', body: "\nWrite like this.\n" });
  });
});

test("names follow the Agent Skills rule", () => {
  expect(validSkillName("frontend-design")).toBe(true);
  expect(validSkillName("Frontend Design")).toBe(false);
  expect(validSkillName("a--b")).toBe(false);
  expect(validSkillName("x".repeat(65))).toBe(false);
  expect(slugSkill("  PDF Tools!! ")).toBe("pdf-tools");
});

test("understands the ways people paste a GitHub source", () => {
  expect(parseGithubSource("anthropics/skills")).toEqual({ owner: "anthropics", repo: "skills" });
  expect(parseGithubSource("https://github.com/anthropics/skills.git")).toEqual({ owner: "anthropics", repo: "skills" });
  expect(parseGithubSource("https://github.com/anthropics/skills/tree/main/skills/pdf")).toEqual({
    owner: "anthropics",
    repo: "skills",
    ref: "main",
    path: "skills/pdf",
  });
  expect(parseGithubSource("github.com/a/b/blob/dev/x/SKILL.md")).toEqual({ owner: "a", repo: "b", ref: "dev", path: "x" });
  expect(parseGithubSource("https://gitlab.com/a/b")).toBeNull();
  expect(parseGithubSource("not a repo")).toBeNull();
});
