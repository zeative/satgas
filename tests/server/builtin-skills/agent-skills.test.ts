import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import { BUILTIN } from "../../../src/server/builtin-skills";
import { AGENT_SKILLS, AGENT_SKILLS_COMMIT } from "../../../src/server/builtin-skills/agent-skills.gen";
import { readSkillFile, validSkillName } from "../../../src/shared/skills";

const CORE = [
  "using-agent-skills",
  "interview-me",
  "spec-driven-development",
  "planning-and-task-breakdown",
  "incremental-implementation",
  "test-driven-development",
  "debugging-and-error-recovery",
  "code-review-and-quality",
  "shipping-and-launch",
];

describe("the vendored agent-skills", () => {
  test("ship as built-in skills, pinned to one upstream commit", () => {
    expect(AGENT_SKILLS_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(AGENT_SKILLS).length).toBeGreaterThanOrEqual(20);
    for (const name of CORE) expect(BUILTIN[name]).toBe(AGENT_SKILLS[name] as Record<string, string>);
  });

  test("every skill has a SKILL.md whose name matches its folder", () => {
    for (const [name, files] of Object.entries(AGENT_SKILLS)) {
      const meta = readSkillFile(files["SKILL.md"] ?? "");
      expect(meta.name).toBe(name);
      expect(validSkillName(name)).toBe(true);
      expect(meta.description?.length).toBeGreaterThan(40);
    }
  });

  // Installed skills sit apart from the upstream repo, so a link that climbs out of its skill would point nowhere.
  test("links between files stay inside each skill and point at files it carries", () => {
    const LINK = /(?:\.\.\/)*(?:shared|references|scripts)\/[a-z0-9.-]+\.(?:md|mjs|sh)/g;
    for (const [name, files] of Object.entries(AGENT_SKILLS)) {
      for (const [rel, text] of Object.entries(files)) {
        expect(text).not.toMatch(/\.\.\/\.\.\/references\//);
        for (const link of text.match(LINK) ?? []) {
          const target = posix.normalize(posix.join(posix.dirname(rel), link));
          expect({ skill: name, from: rel, link, found: target in files }).toEqual({ skill: name, from: rel, link, found: true });
        }
      }
    }
  });
});
