import "../../../helpers/browser";
import { expect, test } from "bun:test";
import { withTemplate } from "../../../../src/web/features/missions/composer-seed";

const { en, id } = await import("../../../../src/web/i18n");

test("drops the marks so the brief can be sent as it is, and selects the sample value", () => {
  const { text, start, end } = withTemplate("", "A site for {Kopi Senja, a roastery}, with prices");
  expect(text).toBe("A site for Kopi Senja, a roastery, with prices");
  expect(text.slice(start, end)).toBe("Kopi Senja, a roastery");
});

test("keeps what the person already typed, and selects the value in the template", () => {
  const { text, start, end } = withTemplate("keep {this}\n", "A site for {Kopi Senja}");
  expect(text).toBe("keep {this}\n\nA site for Kopi Senja");
  expect(text.slice(start, end)).toBe("Kopi Senja");
});

test("a template with no value leaves the cursor at its end", () => {
  const { text, start, end } = withTemplate("", "Make a game");
  expect(start).toBe(text.length);
  expect(end).toBe(text.length);
});

test.each([
  ["en", en],
  ["id", id],
])("every %s template is a finished brief with one value to replace and nothing left blank", (_, lang) => {
  for (const { prompt } of Object.values(lang.templates.items)) {
    expect(prompt.match(/\{[^}]+\}/g)).toHaveLength(1);
    expect(prompt).not.toMatch(/\[[^\]]*\]/);
  }
});
