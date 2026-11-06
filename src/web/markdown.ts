export type Block =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; text: string }
  // The first row is the header.
  | { type: "table"; rows: string[][] };

export type Inline =
  | { type: "text" | "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; text: string; href: string; external: boolean };

// Parses the small markdown subset agents use in reports: headings, lists, fenced code, paragraphs.
export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let code: string[] | null = null;
  let fence = "";
  let table: string[][] | null = null;

  const flush = () => {
    if (para.length) {
      const text = para.join(" ");
      blocks.push(asHeading(text) ? { type: "h", text } : { type: "p", text });
    }
    if (list) blocks.push(list);
    if (table) blocks.push({ type: "table", rows: table });
    para = [];
    list = null;
    table = null;
  };

  for (const line of lines) {
    if (code) {
      // Only a bare fence of the same kind and at least the same length closes, so ```` can hold ``` examples.
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else code.push(line);
      continue;
    }
    const open = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (open) {
      flush();
      fence = open;
      code = [];
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = splitRow(line);
      // The |---|:---:| row only marks the header; it carries no content.
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!table) flush();
      table ??= [];
      table.push(cells);
      continue;
    }
    if (table) flush();
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

// A short line that is only bold, maybe with a parenthesis after it ("**Summary** (link)"), is a heading in disguise.
function asHeading(text: string): boolean {
  return text.length <= 90 && /^\*\*[^*]+\*\*(\s*\([^)]*\))?:?$/.test(text);
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

// Bold is matched first so it can wrap inline code, e.g. **`file.ts`**. A code span closes on a backtick run
// as long as its opener, so `` ` ```` ` `` can show backticks.
// Single * and _ only open against a word and close against one, so 2 * 3, *.ts and snake_case stay as they are.
const INLINE =
  /\*\*\*[^*\n]+\*\*\*|\*\*(?:[^*]|\*(?!\*))+?\*\*|(?<![\w*])\*(?![\s*])[^*\n]+?(?<![\s*])\*(?![\w*])|(?<![\w_])_(?![\s_])[^_\n]+?(?<![\s_])_(?![\w_])|(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    out.push(inlinePart(m[0], m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

function inlinePart(part: string, code: string | undefined): Inline {
  // One space is trimmed from each side, so a span can start or end with a backtick.
  if (code !== undefined) return { type: "code", text: /^ .*[^ ].* $/.test(code) ? code.slice(1, -1) : code };
  if (part.startsWith("***")) return { type: "strong", children: [{ type: "em", children: parseInline(part.slice(3, -3)) }] };
  if (part.startsWith("**")) return { type: "strong", children: parseInline(part.slice(2, -2)) };
  if (part.length > 2 && (part.startsWith("*") || part.startsWith("_"))) return { type: "em", children: parseInline(part.slice(1, -1)) };
  // A bare URL reads as its host and path, without the scheme.
  if (/^https?:\/\//.test(part)) return { type: "link", text: shortUrl(part), href: part, external: true };
  const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
  // Only http(s) becomes a real link; anything else (local paths, javascript:) stays inert text.
  if (link) return { type: "link", text: link[1] ?? "", href: link[2] ?? "", external: /^https?:\/\//i.test(link[2] ?? "") };
  return { type: "text", text: part };
}

function shortUrl(url: string): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return bare.length > 48 ? `${bare.slice(0, 47)}…` : bare;
}

const flat = (p: Inline): string => (p.type === "strong" || p.type === "em" ? p.children.map(flat).join("") : p.text);

// A cell as the reader sees it: markup gone, link text kept.
export const plainCell = (text: string) => parseInline(text).map(flat).join("").trim();

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// Tab-separated pastes into Sheets, Excel or Numbers as cells; CSV is the file for anything else.
export function tableText(rows: string[][], format: "tsv" | "csv"): string {
  const cells = rows.map((r) => r.map(plainCell));
  if (format === "csv") return cells.map((r) => r.map(csvCell).join(",")).join("\n");
  return cells.map((r) => r.map((c) => c.replace(/[\t\n]+/g, " ")).join("\t")).join("\n");
}
