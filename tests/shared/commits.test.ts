import { expect, test } from "bun:test";
import { commitMessage, commitRule, DEFAULT_COMMIT_STYLE, looksConventional, sanitizeCommitStyle } from "../../src/shared/commits";

test("the rule follows the chosen style and always credits Satgas Agent, never an AI tool", () => {
  expect(commitRule(DEFAULT_COMMIT_STYLE)).toContain("recent commits");
  expect(commitRule(DEFAULT_COMMIT_STYLE)).toContain("Co-Authored-By: Satgas Agent <noreply@satgas.id>");
  expect(commitRule(DEFAULT_COMMIT_STYLE)).toContain("Never credit Claude, Codex");
  expect(commitRule(DEFAULT_COMMIT_STYLE)).toContain("Made with Satgas");
  expect(commitRule({ mode: "conventional", instructions: "" })).toContain(
    "When you commit, use Conventional Commits: `type(scope): subject`, imperative, under 72 characters.",
  );
  expect(commitRule({ mode: "custom", instructions: "Prefix with the ticket id" })).toContain("Prefix with the ticket id");
});

test("Satgas's own messages read like the repository's", () => {
  expect(looksConventional(["feat: a", "fix(ui): b", "Merge branch x"])).toBe(true);
  expect(looksConventional(["Add a", "Fix b"])).toBe(false);
  expect(commitMessage(DEFAULT_COMMIT_STYLE, "Fix the login crash", ["fix: x", "feat: y"])).toBe("fix: fix the login crash");
  expect(commitMessage(DEFAULT_COMMIT_STYLE, "Add billing page", ["Add x", "Update y"])).toBe("Add billing page");
  expect(commitMessage({ ...DEFAULT_COMMIT_STYLE, mode: "conventional" }, "Write the README guide")).toBe("docs: write the README guide");
});

test("stored styles are checked", () => {
  expect(sanitizeCommitStyle({ mode: "weird", instructions: 3 })).toEqual(DEFAULT_COMMIT_STYLE);
  expect(sanitizeCommitStyle({ mode: "custom", instructions: "  Use emoji  " })).toEqual({
    mode: "custom",
    instructions: "Use emoji",
  });
});
