import { expect, test } from "bun:test";
import { buildNodePrompt, contextLines, workingRules } from "../../src/server/prompt";
import type { NodeState, Run } from "../../src/shared/types";

const node = (id: string, dependsOn: string[] = [], output?: string): NodeState => ({
  id,
  title: `Task ${id}`,
  role: "Engineer",
  agent: "claude",
  task: `Do ${id}`,
  dependsOn,
  status: output ? "done" : "pending",
  output,
  x: 0,
  y: 0,
});

const run = (nodes: NodeState[]): Run => ({ id: "r1", prompt: "Ship it", cwd: "/work", status: "running", createdAt: 0, nodes });

test("includes the mission, the task and only direct upstream reports", () => {
  const nodes = [node("a", [], "report A"), node("b", ["a"], "report B"), node("c", ["b"])];
  const prompt = buildNodePrompt(run(nodes), nodes[2] as NodeState, 1000);
  expect(prompt).toContain("<mission>\nShip it\n</mission>");
  expect(prompt).toContain("<task>\nTask c\nDo c\n</task>");
  expect(prompt).toContain("report B");
  expect(prompt).not.toContain("report A");
});

test("only the final task is asked for the user-facing report", () => {
  const nodes = [node("a"), node("b", ["a"])];
  expect(buildNodePrompt(run(nodes), nodes[0] as NodeState, 1000)).toContain("handed to the next tasks");
  expect(buildNodePrompt(run(nodes), nodes[1] as NodeState, 1000)).toContain("final report for the person");
  expect(buildNodePrompt(run(nodes), nodes[1] as NodeState, 1000)).toContain("next steps you recommend");
});

test("the shared working rules carry the system overview, and point at the satgas skill only when it is installed", () => {
  expect(workingRules(true, "<satgas_system>\nConnectors: none installed.\n</satgas_system>")).toContain(
    "</satgas_skill>\n\n<satgas_system>",
  );
  expect(workingRules(false)).not.toContain("satgas-skills:satgas");
  expect(workingRules(false)).toContain("use the connector first");
  expect(workingRules(false)).toContain("```satgas:table <title>```");
});

test("long upstream reports keep their ending", () => {
  const nodes = [node("a", [], `${"x".repeat(50)}CONCLUSION`), node("b", ["a"])];
  const prompt = buildNodePrompt(run(nodes), nodes[1] as NodeState, 20);
  expect(prompt).toContain("CONCLUSION");
  expect(prompt).not.toContain("x".repeat(50));
});

test("tasks see the answers the user gave before their round was planned", () => {
  const nodes = [node("a")];
  const asks = {
    0: {
      questions: [
        {
          header: "Platform",
          question: "Which platform first?",
          multiSelect: true,
          options: [
            { label: "TikTok", description: "" },
            { label: "Reels", description: "" },
          ],
        },
      ],
      answers: [{ picked: ["TikTok", "Reels"] }],
    },
  };
  const prompt = buildNodePrompt({ ...run(nodes), asks }, nodes[0] as NodeState, 1000);
  expect(prompt).toContain("Before planning, the user answered these questions:\n- Which platform first?\n  TikTok, Reels");
  expect(buildNodePrompt(run(nodes), nodes[0] as NodeState, 1000)).not.toContain("answered these questions");
});

test("tasks see what the / and @ words pointed at, and Codex gets the skills index", () => {
  const nodes = [node("a")];
  const prompt = buildNodePrompt(run(nodes), nodes[0] as NodeState, 1000, false, {
    pointed: "Files in the working directory the user pointed at:\n- src/app.ts",
    skills: [{ name: "pdf", description: "Fill PDF forms", file: "/data/skills/pdf/SKILL.md" }],
  });
  expect(prompt).toContain("What the request's / and @ words point at:\nFiles in the working directory the user pointed at:\n- src/app.ts");
  expect(prompt).toContain("read its SKILL.md and follow it.\n- pdf: Fill PDF forms (/data/skills/pdf/SKILL.md)");
  expect(buildNodePrompt(run(nodes), nodes[0] as NodeState, 1000)).not.toContain("Skills you can use");
});

test("a task sees the canvas by card id and knows how to change it", () => {
  const r = {
    ...run([node("a")]),
    board: { cards: [{ id: "n1", kind: "note" as const, x: 0, y: 0, w: 100, h: 80, text: "Idea", createdAt: 0 }], links: [], moved: {} },
  };
  expect(buildNodePrompt(r, r.nodes[0] as NodeState, 1000)).toContain('<board_now>\n- n1 note "Idea"');
  expect(workingRules(false)).toContain("satgas:edit");
});

test("the person's rules outrank the defaults, and what Satgas remembers shapes a task", async () => {
  const { workingRules: rules } = await import("../../src/server/prompt");
  const text = rules(false, "", "", "- Commits in English (why: public repo)");
  expect(text).toContain("<person_rules>");
  expect(text).toContain("the person's rule wins");
  expect(text).toContain("- Commits in English (why: public repo)");
  expect(rules(false)).not.toContain("<person_rules>");
});

test("every task hears to put interfaces through Hallmark only while it is on", () => {
  expect(workingRules(true, "", "", "", true)).toContain("loads the hallmark skill");
  expect(workingRules(true)).not.toContain("hallmark");
});

test("what a task is handed comes back as log lines, names only and never a secret's value", () => {
  const run = {
    board: {
      cards: [
        { id: "c1", kind: "note", text: "Login flow\nsecond line" },
        { id: "c2", kind: "table", title: "Prices" },
      ],
      links: [],
    },
    refs: { 1: { cards: ["c1", "gone"], files: ["src/a.ts"] } },
    files: { 0: ["brief.pdf"], 1: ["shot.png", "brief.pdf"] },
  } as unknown as Run;
  expect(contextLines(run, 1, { memory: true, upstream: ["Write the API"], saved: [{ label: "Stripe key" }] })).toEqual([
    "canvas 2",
    "card Login flow",
    "attached brief.pdf",
    "attached shot.png",
    "attached src/a.ts",
    "upstream Write the API",
    "memory",
    "secret Stripe key",
  ]);
  expect(contextLines({} as Run, 0)).toEqual([]);
});
