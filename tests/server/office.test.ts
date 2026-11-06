import { expect, test } from "bun:test";
import { docxMarkdown, pptxMarkdown, xlsxRows } from "../../src/server/office";
import { storeZip, xlsxBytes } from "../../src/shared/xlsx";

const enc = new TextEncoder();
const zip = (files: Record<string, string>) => storeZip(Object.entries(files).map(([name, xml]) => ({ name, data: enc.encode(xml) })));

test("a workbook Satgas writes reads back as the same rows, numbers and markup-like text included", () => {
  const rows = [
    ["App", "Rating", "Note"],
    ["Monveo", "4.4", "Fast <input> & Siri"],
    ["Sepran", "4.9", ""],
  ];
  expect(xlsxRows(xlsxBytes([{ name: "Competitors", rows }]))).toEqual(rows);
});

test("shared strings and gaps between cells are read the way Excel writes them", () => {
  const bytes = zip({
    "xl/sharedStrings.xml": "<sst><si><t>Name</t></si><si><r><t>Bu</t></r><r><t>di</t></r></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>7</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>',
  });
  expect(xlsxRows(bytes)).toEqual([
    ["Name", "", "7"],
    ["Budi", "", ""],
  ]);
  expect(xlsxRows(new Uint8Array([1, 2, 3]))).toBeNull();
});

test("a Word document becomes markdown with its headings and lists", () => {
  const bytes = zip({
    "word/document.xml":
      '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Q3 review</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Sales</w:t></w:r></w:p><w:p><w:r><w:t>Up 12% &amp; steady.</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Hire two</w:t></w:r></w:p></w:body></w:document>',
  });
  expect(docxMarkdown(bytes)).toBe("# Q3 review\n\n## Sales\n\nUp 12% & steady.\n\n- Hire two");
});

test("a deck becomes one section per slide, in slide order", () => {
  const slide = (title: string, ...lines: string[]) =>
    `<p:sld>${[title, ...lines].map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:sld>`;
  const bytes = zip({
    "ppt/slides/slide10.xml": slide("Thanks"),
    "ppt/slides/slide1.xml": slide("Launch plan", "Goal: 1k users", "By March"),
    "ppt/slides/slide2.xml": slide("Budget"),
  });
  expect(pptxMarkdown(bytes)).toBe("## 1. Launch plan\n- Goal: 1k users\n- By March\n\n## 2. Budget\n\n## 3. Thanks");
});
