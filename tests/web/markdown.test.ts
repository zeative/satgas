import { expect, test } from "bun:test";
import { parseBlocks, parseInline } from "../../src/web/markdown";

test("parses headings, paragraphs, lists and code fences", () => {
  const blocks = parseBlocks(
    ["# Done", "Built the API", "and tests.", "", "- one", "- two", "1. first", "```ts", "const x = 1;", "```"].join("\n"),
  );
  expect(blocks).toEqual([
    { type: "h", text: "Done" },
    { type: "p", text: "Built the API and tests." },
    { type: "ul", items: ["one", "two"] },
    { type: "ol", items: ["first"] },
    { type: "code", text: "const x = 1;" },
  ]);
});

test("keeps the content of an unclosed code fence", () => {
  expect(parseBlocks("```\nrm -rf build")).toEqual([{ type: "code", text: "rm -rf build" }]);
});

test("treats markup as text, never as HTML", () => {
  expect(parseBlocks("<img src=x onerror=alert(1)>")).toEqual([{ type: "p", text: "<img src=x onerror=alert(1)>" }]);
});

test("parses inline code and bold", () => {
  expect(parseInline("Run `bun test` **now**")).toEqual([
    { type: "text", text: "Run " },
    { type: "code", text: "bun test" },
    { type: "text", text: " " },
    { type: "strong", children: [{ type: "text", text: "now" }] },
  ]);
});

test("only http(s) links become external links", () => {
  expect(parseInline("[docs](https://bun.sh) [file](/tmp/a.js) [x](javascript:void)")).toEqual([
    { type: "link", text: "docs", href: "https://bun.sh", external: true },
    { type: "text", text: " " },
    { type: "link", text: "file", href: "/tmp/a.js", external: false },
    { type: "text", text: " " },
    { type: "link", text: "x", href: "javascript:void", external: false },
  ]);
});

test("bold can wrap inline code", () => {
  expect(parseInline("**`index.html`**: page")).toEqual([
    { type: "strong", children: [{ type: "code", text: "index.html" }] },
    { type: "text", text: ": page" },
  ]);
});

test("parses tables, skipping the alignment row and keeping escaped pipes", () => {
  expect(parseBlocks("Intro\n\n| Endpoint | Method |\n| --- | :---: |\n| /signup | POST |\n| a \\| b | GET |\n\nAfter")).toEqual([
    { type: "p", text: "Intro" },
    {
      type: "table",
      rows: [
        ["Endpoint", "Method"],
        ["/signup", "POST"],
        ["a | b", "GET"],
      ],
    },
    { type: "p", text: "After" },
  ]);
});
