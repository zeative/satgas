export type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; text: string };

export type Inline =
  | { type: "text" | "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "link"; text: string; href: string; external: boolean };

// Parses the small markdown subset agents use in reports: headings, lists, fenced code, paragraphs.
export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let code: string[] | null = null;

  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    if (list) blocks.push(list);
    para = [];
    list = null;
  };

  for (const line of lines) {
    if (code) {
      if (line.trimStart().startsWith("```")) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else code.push(line);
      continue;
    }
    if (line.trimStart().startsWith("```")) {
      flush();
      code = [];
      continue;
    }
    const heading = /^#{1,6}\s+(.*)/.exec(line);
    const item = /^\s*(?:([-*+])|\d+[.)])\s+(.*)/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "h", text: heading[1] ?? "" });
    } else if (item) {
      const type = item[1] ? "ul" : "ol";
      if (para.length || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push(item[2] ?? "");
    } else if (!line.trim()) {
      flush();
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  // An unclosed fence still shows its content rather than dropping it.
  if (code) blocks.push({ type: "code", text: code.join("\n") });
  flush();
  return blocks;
}

// Bold is matched first so it can wrap inline code, e.g. **`file.ts`**.
export function parseInline(text: string): Inline[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g)
    .filter(Boolean)
    .map((part): Inline => {
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
        return { type: "strong", children: parseInline(part.slice(2, -2)) };
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return { type: "code", text: part.slice(1, -1) };
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
      // Only http(s) becomes a real link; anything else (local paths, javascript:) stays inert text.
      if (link) return { type: "link", text: link[1] ?? "", href: link[2] ?? "", external: /^https?:\/\//i.test(link[2] ?? "") };
      return { type: "text", text: part };
    });
}
