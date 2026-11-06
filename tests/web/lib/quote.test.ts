import { expect, test } from "bun:test";
import { QUOTE_MAX, splitQuotes, withQuotes } from "../../../src/web/lib/quote";

test("quotes go first as markdown, one block per passage", () => {
  const text = withQuotes("Kenapa begitu?", ["Error 500 dari token\n\n  yang kedaluwarsa ", "Harga naik"]);
  expect(text).toBe("> Error 500 dari token\n> yang kedaluwarsa\n>\n> Harga naik\n\nKenapa begitu?");
});

test("no quotes leaves the message as written", () => {
  expect(withQuotes("halo", [])).toBe("halo");
  expect(withQuotes("halo", ["   "])).toBe("halo");
});

test("a long passage is cut to the limit", () => {
  const text = withQuotes("ok", ["x".repeat(QUOTE_MAX + 50)]);
  expect(splitQuotes(text).quotes[0]).toHaveLength(QUOTE_MAX);
});

test("splitting gives back the passages and the message", () => {
  const sent = withQuotes("Kenapa begitu?", ["satu\ndua", "tiga"]);
  expect(splitQuotes(sent)).toEqual({ quotes: ["satu\ndua", "tiga"], rest: "Kenapa begitu?" });
});

test("a message without a leading quote is all message", () => {
  expect(splitQuotes("halo\n> bukan kutipan")).toEqual({ quotes: [], rest: "halo\n> bukan kutipan" });
});
