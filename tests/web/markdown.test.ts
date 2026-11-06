import { expect, test } from "bun:test";
import { parseBlocks, parseInline, tableText } from "../../src/web/markdown";

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

test("a longer fence holds shorter fences as plain code", () => {
  const example = ["```satgas:note", "Prices exclude VAT.", "```"].join("\n");
  expect(parseBlocks(["````text", example, "````", "After"].join("\n"))).toEqual([
    { type: "code", text: example },
    { type: "p", text: "After" },
  ]);
  expect(parseBlocks(["~~~", "```", "~~~"].join("\n"))).toEqual([{ type: "code", text: "```" }]);
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

test("a code span with a longer delimiter can hold backticks", () => {
  expect(parseInline("Use ` ````satgas:doc ` or ``a`b`` here")).toEqual([
    { type: "text", text: "Use " },
    { type: "code", text: "````satgas:doc" },
    { type: "text", text: " or " },
    { type: "code", text: "a`b" },
    { type: "text", text: " here" },
  ]);
  expect(parseInline("a `` b")).toEqual([{ type: "text", text: "a `` b" }]);
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

test("a short bold-only line is a heading; a bold lead-in to a sentence is not", () => {
  expect(parseBlocks("**Ringkasan** (https://github.com/zeative/claude-code)")[0]?.type).toBe("h");
  expect(parseBlocks("**Note:** the build is slow on CI because caching is off.")[0]?.type).toBe("p");
});

test("bare URLs become links that read as host and path", () => {
  expect(parseInline("See (https://github.com/zeative/claude-code).")).toEqual([
    { type: "text", text: "See (" },
    { type: "link", text: "github.com/zeative/claude-code", href: "https://github.com/zeative/claude-code", external: true },
    { type: "text", text: ")." },
  ]);
});

test("numbered lists and sentence-like labels stay lists", () => {
  expect(parseBlocks("1. **Fix CI:** a\n2. **Close alerts:** b\n3. **Triage:** c")[0]?.type).toBe("ol");
  expect(parseBlocks("- **Legal risk (most serious).** a\n- **Stale.** b\n- **Noise.** c")[0]?.type).toBe("ul");
});

test("a table copies as spreadsheet cells and exports as CSV, markup gone", () => {
  const rows = [
    ["Aplikasi", "Inti"],
    ["**Monveo**", "Input suara, scan struk"],
    ["[Moni](https://moni.app)", 'Paling "mirip"'],
  ];
  expect(tableText(rows, "tsv")).toBe('Aplikasi\tInti\nMonveo\tInput suara, scan struk\nMoni\tPaling "mirip"');
  expect(tableText(rows, "csv")).toBe('Aplikasi,Inti\nMonveo,"Input suara, scan struk"\nMoni,"Paling ""mirip"""');
});
