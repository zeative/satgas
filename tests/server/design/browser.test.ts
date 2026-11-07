import { expect, test } from "bun:test";
import { BrowserError, dataOf, targetUrl } from "../../../src/server/design/browser";
import { compareHtml, runDesign } from "../../../src/server/design/cli";
import { probe, probeScript } from "../../../src/server/design/probe";

test("a file path becomes a file URL; a web or file URL stays as it is", () => {
  expect(targetUrl("web/index.html", "/work")).toBe("file:///work/web/index.html");
  expect(targetUrl("/abs/a b.html")).toBe("file:///abs/a%20b.html");
  expect(targetUrl("https://stripe.com/")).toBe("https://stripe.com/");
});

test("agent-browser's JSON reply gives its data, and its error as a thrown message", () => {
  expect(dataOf('{"success":true,"data":{"result":3}}')).toEqual({ result: 3 });
  expect(dataOf('noise\n{"success":true,"data":1}\n')).toBe(1);
  expect(() => dataOf('{"success":false,"error":"no page"}')).toThrow("no page");
  expect(() => dataOf("Chrome not found")).toThrow(BrowserError);
});

test("the probe goes to the page as one self-contained call with the width it must fit", () => {
  const script = probeScript(390);
  expect(script.endsWith("(390)")).toBe(true);
  // Anything it used from outside itself would be undefined inside the page.
  expect(() => new Function(`return ${script.slice(0, -"(390)".length)}`)).not.toThrow();
  expect(probe.length).toBe(1);
});

test("the comparison page puts each picture under its name and escapes names", () => {
  const html = compareHtml([
    { label: "Build: home.png", src: "file:///w/home.png" },
    { label: 'ref "a"', src: "file:///w/a.png" },
  ]);
  expect(html).toContain("repeat(2,");
  expect(html).toContain("ref &quot;a&quot;");
  expect(html.match(/<img /g)).toHaveLength(2);
});

test("design with no command prints how to use it; an unknown one fails", async () => {
  const log = console.log;
  const lines: string[] = [];
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    expect(await runDesign([])).toBe(0);
    expect(await runDesign(["paint"])).toBe(2);
  } finally {
    console.log = log;
  }
  expect(lines.join("\n")).toContain("satgas design refs");
});
