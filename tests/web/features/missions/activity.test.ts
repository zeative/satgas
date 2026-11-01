import { describe, expect, test } from "bun:test";
import type { LogLine } from "../../../../src/shared/types";
import { classify, summarize, timeline, type Words } from "../../../../src/web/features/missions/activity";

const words: Words = {
  changed: (n) => `changed ${n} ${n === 1 ? "file" : "files"}`,
  ran: (n) => `ran ${n} ${n === 1 ? "command" : "commands"}`,
  read: (n) => `read ${n} ${n === 1 ? "file" : "files"}`,
  searched: (n) => `searched ${n} ${n === 1 ? "time" : "times"}`,
  web: (n) => `looked up ${n} ${n === 1 ? "page" : "pages"}`,
  used: (names) => `used ${names}`,
  other: (n) => `performed ${n} other ${n === 1 ? "action" : "actions"}`,
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
    expect(summarize(acts, words, "en")).toBe("Used playwright, changed 2 files, ran 2 commands, and read 1 file");
    expect(summarize([classify("Bash ls")], words, "en")).toBe("Ran 1 command");
  });
});
