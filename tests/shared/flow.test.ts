import { expect, test } from "bun:test";
import type { Card } from "../../src/shared/board";
import { flowLinks } from "../../src/shared/flow";
import type { NodeState } from "../../src/shared/types";

const task = (id: string, dependsOn: string[] = [], after?: string[]): NodeState =>
  ({ id, title: id, task: id, dependsOn, after, status: "done", x: 0, y: 0 }) as NodeState;
const card = (id: string, from: string | undefined, createdAt = 0, kind: Card["kind"] = "doc"): Card =>
  ({ id, kind, from, x: 0, y: 0, w: 100, h: 100, createdAt }) as Card;
const pairs = (nodes: NodeState[], cards: Card[]) => flowLinks(nodes, cards).map((l) => `${l.source}>${l.target}`);

test("a task's card comes from the cards of the tasks it waited on", () => {
  const nodes = [task("brief"), task("code", ["brief"]), task("review", ["code"])];
  const cards = [card("b", "brief"), card("c", "code"), card("r", "review")];
  expect(pairs(nodes, cards)).toEqual(["b>c", "c>r"]);
});

test("a follow-up round continues from the card of the task it builds on", () => {
  const nodes = [task("email"), task("shorter", [], ["email"])];
  expect(pairs(nodes, [card("e", "email"), card("s", "shorter")])).toEqual(["e>s"]);
});

test("a step that made no card passes its inputs on, so the chain does not break", () => {
  const nodes = [task("m1"), task("m3", ["m1"]), task("m4", ["m3"])];
  expect(pairs(nodes, [card("one", "m1"), card("four", "m4")])).toEqual(["one>four"]);
});

test("each task is drawn from its first card, and inputs it shares are drawn once", () => {
  const nodes = [task("a"), task("b"), task("c", ["a", "b"])];
  const cards = [card("a2", "a", 5), card("a1", "a", 1), card("b1", "b"), card("c1", "c")];
  expect(pairs(nodes, cards)).toEqual(["a1>c1", "b1>c1"]);
});

test("cards people made and ink take no part, and a loop in the tasks does not hang", () => {
  const nodes = [task("x", ["y"]), task("y", ["x"])];
  const cards = [card("mine", undefined), card("ink", "x", 0, "drawing"), card("y1", "y")];
  expect(pairs(nodes, cards)).toEqual([]);
});
