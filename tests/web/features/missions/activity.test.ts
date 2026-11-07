import { describe, expect, test } from "bun:test";
import type { LogLine } from "../../../../src/shared/types";
import { classify, isHanded, summarize, timeline, type Words } from "../../../../src/web/features/missions/activity";

const words: Words = {
  changed: (n) => `${n} ${n === 1 ? "file" : "files"} changed`,
  ran: (n) => `${n} ${n === 1 ? "command" : "commands"}`,
  read: (n) => `${n} ${n === 1 ? "file" : "files"} read`,
  searched: (n) => `${n} ${n === 1 ? "search" : "searches"}`,
  web: (n) => `${n} ${n === 1 ? "page" : "pages"}`,
  used: (names) => names,
  skills: (names) => `skill: ${names}`,
  other: (n) => `${n} other`,
};
let seq = 0;
const line = (kind: LogLine["kind"], text: string): LogLine => ({ seq: ++seq, t: seq, kind, text });

describe("classify", () => {
  test("reads Claude Code and Codex tool lines", () => {
    expect(classify("Bash npm test")).toEqual({ kind: "command", tool: "Bash", detail: "npm test" });
    expect(classify("Write src/a.ts").kind).toBe("edit");
    expect(classify("update src/a.ts").kind).toBe("edit");
    expect(classify("Grep TODO").kind).toBe("search");
    expect(classify("mcp__playwright__browser_click #login")).toMatchObject({ kind: "mcp", server: "playwright", tool: "browser_click" });
    expect(classify("TodoWrite").kind).toBe("other");
  });
});

describe("what agents read stays visible", () => {
  test("an image read through the Read tool is told apart from a file", () => {
    expect(classify("Read /work/shots/home.PNG").kind).toBe("image");
    expect(classify("Read /work/src/a.ts").kind).toBe("read");
  });

  test("what the lead or a task was handed reads as its own kind", () => {
    expect(classify("canvas 12")).toEqual({ kind: "canvas", tool: "canvas", detail: "12" });
    expect(classify("card Login flow")).toMatchObject({ kind: "card", detail: "Login flow" });
    expect(classify("attached brief.pdf").kind).toBe("attached");
    expect(classify("upstream Write the API").kind).toBe("upstream");
    expect(classify("memory").kind).toBe("memory");
    expect(classify("secret Stripe key").kind).toBe("secret");
    expect(isHanded("canvas")).toBe(true);
    expect(isHanded("read")).toBe(false);
  });

  test("Codex's connector prefix never reaches the person", () => {
    expect(classify("mcp__satgas_github__create_issue Fix login").server).toBe("github");
  });

  test("thoughts and notes join the timeline, in order", () => {
    const items = timeline([line("think", "Checking the header"), line("info", "Merged branch x"), line("tool", "Read a.ts")]);
    expect(items.map((i) => i.type)).toEqual(["think", "note", "group"]);
  });

  test("images count as files read, and what was handed adds nothing to the count", () => {
    const acts = [classify("Read a.png"), classify("Read b.ts"), classify("canvas 3")];
    expect(summarize(acts, words)).toBe("2 files read");
  });
});

describe("timeline", () => {
  test("folds runs of tool calls between the agent's own words", () => {
    const items = timeline([
      line("text", "Looking around first."),
      line("tool", "Read src/a.ts"),
      line("tool", "Bash ls"),
      line("text", "Now the fix."),
      line("tool", "Edit src/a.ts"),
      line("error", "Command failed (exit 1)"),
    ]);
    expect(items.map((i) => i.type)).toEqual(["text", "group", "text", "group", "error"]);
    expect(items[1]?.type === "group" && items[1].acts.length).toBe(2);
  });
  test("puts what a call gave back on its own step, even when other calls came in between, and adds no row", () => {
    const items = timeline([
      { ...line("tool", "Bash npm test"), call: "a" },
      { ...line("tool", "Read shot.png"), call: "b" },
      { ...line("out", "picture"), call: "b", image: "x.png" },
      { ...line("out", "1 failed"), call: "a", failed: true },
      { ...line("out", "nobody's"), call: "zz" },
    ]);
    expect(items).toHaveLength(1);
    const [test1, shot] = items[0]?.type === "group" ? items[0].acts : [];
    expect(test1).toMatchObject({ detail: "npm test", out: "1 failed", failed: true });
    expect(shot).toMatchObject({ kind: "image", image: "x.png" });
  });
});

describe("summarize", () => {
  test("counts files once and commands every time, connectors by name", () => {
    const acts = [
      classify("Edit a.ts"),
      classify("Edit a.ts"),
      classify("Write b.ts"),
      classify("Bash npm test"),
      classify("Bash npm test"),
      classify("mcp__playwright__browser_navigate http://x"),
      classify("Read c.ts"),
    ];
    expect(summarize(acts, words)).toBe("playwright · 2 files changed · 2 commands · 1 file read");
    expect(summarize([classify("Bash ls")], words)).toBe("1 command");
  });
});

test("a loaded skill shows by name, next to the connectors and the work", () => {
  expect(classify("Skill satgas-skills:spec-driven-development")).toEqual({
    kind: "skill",
    tool: "Skill",
    detail: "spec-driven-development",
  });
  const acts = ["Skill satgas-skills:spec-driven-development", "mcp__github__list_repos owner", "Bash bun test"].map(classify);
  expect(summarize(acts, words)).toBe("skill: spec-driven-development · github · 1 command");
});
