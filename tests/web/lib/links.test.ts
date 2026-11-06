import { expect, test } from "bun:test";
import { REF, splitLinks, withRef } from "../../../src/web/lib/links";

test("an outgoing link carries the ref", () => {
  const ref = encodeURIComponent(REF);
  expect(withRef("https://github.com/Nutlope/hallmark", "satgas.test")).toBe(`https://github.com/Nutlope/hallmark?ref=${ref}`);
  expect(withRef("https://example.com/a?b=1#top", "satgas.test")).toBe(`https://example.com/a?b=1&ref=${ref}#top`);
});

test("links that would break or point home stay as they are", () => {
  const signed = "https://bucket.s3.amazonaws.com/f.png?X-Amz-Signature=abc&X-Amz-Expires=60";
  expect(withRef(signed, "satgas.test")).toBe(signed);
  expect(withRef("https://site.com/?ref=friend", "satgas.test")).toBe("https://site.com/?ref=friend");
  expect(withRef("http://localhost:5317/boards/x", "satgas.test")).toBe("http://localhost:5317/boards/x");
  expect(withRef("https://satgas.test/boards/x", "satgas.test")).toBe("https://satgas.test/boards/x");
  expect(withRef("mailto:a@b.c", "satgas.test")).toBe("mailto:a@b.c");
});

test("URLs in text become link parts, without the sentence's last dot", () => {
  expect(splitLinks("https://github.com/Nutlope/hallmark install skill ini.")).toEqual([
    { text: "https://github.com/Nutlope/hallmark", href: "https://github.com/Nutlope/hallmark" },
    { text: " install skill ini." },
  ]);
  expect(splitLinks("lihat https://a.com/x.")).toEqual([
    { text: "lihat " },
    { text: "https://a.com/x", href: "https://a.com/x" },
    { text: "." },
  ]);
  expect(splitLinks("tanpa link")).toEqual([{ text: "tanpa link" }]);
});
