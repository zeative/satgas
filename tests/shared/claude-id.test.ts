import { expect, test } from "bun:test";
import { shortModel } from "../../src/shared/claude-id";

test("a Claude id reads as its family and version on a cursor label", () => {
  expect(shortModel("claude-haiku-5-5")).toBe("Haiku 5.5");
  expect(shortModel("claude-opus-5")).toBe("Opus 5");
});

test("any other model keeps its own id", () => {
  expect(shortModel("gpt-5.5-codex")).toBe("gpt-5.5-codex");
});
