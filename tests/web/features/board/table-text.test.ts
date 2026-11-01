import { describe, expect, test } from "bun:test";
import { parseTable, tableText } from "../../../../src/web/features/board/table-text";

describe("table text", () => {
  test("splits rows by line and cells by comma, trimming plain cells", () => {
    expect(parseTable("City, Pop\nJakarta ,  10\n\n")).toEqual([
      ["City", "Pop"],
      ["Jakarta", "10"],
    ]);
  });

  test("keeps commas, quotes and line breaks inside quoted cells", () => {
    expect(parseTable('Place, Note\n"Jakarta, ID", "say ""hi"""\n"two\nlines", x')).toEqual([
      ["Place", "Note"],
      ["Jakarta, ID", 'say "hi"'],
      ["two\nlines", "x"],
    ]);
  });

  test("keeps the edge spaces of a quoted cell and drops spaces around it", () => {
    expect(parseTable('a,  " b "  ,c')).toEqual([["a", " b ", "c"]]);
  });

  test("keeps empty cells but drops empty rows", () => {
    expect(parseTable("a,,c\n , \n,b")).toEqual([
      ["a", "", "c"],
      ["", "b"],
    ]);
  });

  test("reads CRLF line endings and an unclosed quote", () => {
    expect(parseTable('a,b\r\nc,"d')).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  test("round-trips through its own text", () => {
    const rows = [
      ["Name", "Where"],
      ["Ana", "Jakarta, ID"],
      ['The "best"', " padded "],
      ["multi\nline", ""],
    ];
    expect(parseTable(tableText(rows))).toEqual(rows);
    expect(tableText([["a", "b, c"]])).toBe('a, "b, c"');
  });
});
