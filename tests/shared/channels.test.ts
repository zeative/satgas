import { describe, expect, test } from "bun:test";
import { splitMessage, toTelegramHtml, toWhatsApp } from "../../src/shared/channels";

describe("splitMessage", () => {
  test("cuts on a line where it can, and never loses text", () => {
    const parts = splitMessage(`${"a".repeat(60)}\n${"b".repeat(60)}`, 80);
    expect(parts).toEqual(["a".repeat(60), "b".repeat(60)]);
    expect(splitMessage("x".repeat(25), 10).join("")).toBe("x".repeat(25));
    expect(splitMessage("   ", 10)).toEqual([]);
  });
});

describe("formatting", () => {
  test("Telegram gets its HTML, with what the agent wrote escaped so it cannot break the message", () => {
    expect(toTelegramHtml("# Title\n**bold** a < b & c")).toBe("<b>Title</b>\n<b>bold</b> a &lt; b &amp; c");
    expect(toTelegramHtml("see [docs](https://x.dev/a)")).toBe('see <a href="https://x.dev/a">docs</a>');
  });

  test("code keeps its characters untouched", () => {
    expect(toTelegramHtml("`a**b**<c`")).toBe("<code>a**b**&lt;c</code>");
    expect(toTelegramHtml("```ts\nconst a = 1 < 2;\n```")).toBe("<pre>const a = 1 &lt; 2;</pre>");
  });

  test("WhatsApp gets its own bold and plain links", () => {
    expect(toWhatsApp("# Title\n**bold** [docs](https://x.dev)")).toBe("*Title*\n*bold* docs (https://x.dev)");
  });
});
