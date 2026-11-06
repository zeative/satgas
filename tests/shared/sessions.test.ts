import { expect, test } from "bun:test";
import { MAIN_SESSION, roundText, sessionOf, sessionRounds, sessionsOf } from "../../src/shared/sessions";

const run = {
  prompt: "first",
  rounds: ["a", "b", "c"],
  roundSessions: { 2: "s2", 3: "s2" },
  sessions: [{ id: "s2", createdAt: 5, title: "Bug" }],
  createdAt: 1,
};

test("rounds belong to the main session unless they say otherwise, and each session lists its own", () => {
  expect(sessionOf(run, 0)).toBe(MAIN_SESSION);
  expect(sessionOf(run, 2)).toBe("s2");
  expect(sessionRounds(run, MAIN_SESSION)).toEqual([0, 1]);
  expect(sessionRounds(run, "s2")).toEqual([2, 3]);
  expect(sessionRounds(run, "s2", 2)).toEqual([2]);
  expect(roundText(run, 0)).toBe("first");
  expect(roundText(run, 3)).toBe("c");
  expect(sessionsOf(run).map((s) => s.id)).toEqual([MAIN_SESSION, "s2"]);
});
