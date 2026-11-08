import { expect, test } from "bun:test";
import { withTemplate } from "../../../../src/web/features/missions/composer-seed";

test("selects the first blank of a template in an empty composer", () => {
  const { text, start, end } = withTemplate("", "A site for [business], about [topic]");
  expect(text).toBe("A site for [business], about [topic]");
  expect(text.slice(start, end)).toBe("[business]");
});

test("keeps what the person already typed, and selects the blank in the template", () => {
  const { text, start, end } = withTemplate("keep [this]\n", "A site for [business]");
  expect(text).toBe("keep [this]\n\nA site for [business]");
  expect(text.slice(start, end)).toBe("[business]");
});

test("a template with no blank leaves the cursor at its end", () => {
  const { text, start, end } = withTemplate("", "Make a game");
  expect(start).toBe(text.length);
  expect(end).toBe(text.length);
});
