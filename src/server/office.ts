import { readZip } from "./zip";

// Office files an agent made (Excel, Word, PowerPoint) read back into what a board card can show: the first sheet as
// rows, a document or deck as markdown. The file itself stays in the folder to download; this is only its preview.

const decode = new TextDecoder();
const MAX_ROWS = 200;
const MAX_COLS = 30;
const MAX_TEXT = 60_000;

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

const texts = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => unxml(m[1] ?? ""));

function zipOf(bytes: Uint8Array): Map<string, Uint8Array> | null {
  try {
    return readZip(bytes, { files: 2000, bytes: 40 * 1024 * 1024 });
  } catch {
    return null;
  }
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
};

// The first worksheet as rows of text: shared strings, inline strings and numbers.
export function xlsxRows(bytes: Uint8Array): string[][] | null {
  const zip = zipOf(bytes);
  if (!zip) return null;
  const shared = zip.get("xl/sharedStrings.xml");
  const strings = shared ? [...decode.decode(shared).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1] ?? "", "t").join("")) : [];
  const sheetName = [...zip.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]))[0];
  const sheet = sheetName ? zip.get(sheetName) : undefined;
  if (!sheet) return null;
  const rows: string[][] = [];
  for (const r of decode.decode(sheet).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_ROWS) break;
    const row: string[] = [];
    for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? "";
      const body = c[2] ?? "";
      const at = colIndex(/\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? String.fromCharCode(65 + row.length));
      if (at >= MAX_COLS) continue;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = texts(body, "v")[0] ?? "";
      const value = type === "s" ? (strings[Number(v)] ?? "") : type === "inlineStr" ? texts(body, "t").join("") : v;
      while (row.length < at) row.push("");
      row[at] = value;
    }
    rows.push(row);
  }
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.length ? rows.map((r) => [...r, ...Array(width - r.length).fill("")]) : null;
}

// A Word document as markdown: headings from their styles, list paragraphs as bullets, the rest as paragraphs.
export function docxMarkdown(bytes: Uint8Array): string | null {
  const doc = zipOf(bytes)?.get("word/document.xml");
  if (!doc) return null;
  const out: string[] = [];
  for (const p of decode.decode(doc).matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const body = p[1] ?? "";
    const line = texts(body, "w:t").join("").trim();
    if (!line) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(body)?.[1] ?? "";
    const level = /^(?:Heading|heading)(\d)$/.exec(style)?.[1];
    if (style === "Title") out.push(`# ${line}`);
    else if (level) out.push(`${"#".repeat(Math.min(4, Number(level) + 1))} ${line}`);
    else if (/<w:numPr\b/.test(body) || /List/i.test(style)) out.push(`- ${line}`);
    else out.push(line);
  }
  const md = out.join("\n\n");
  return md ? md.slice(0, MAX_TEXT) : null;
}

// A deck as markdown: one section per slide, its title then its other text as bullets.
export function pptxMarkdown(bytes: Uint8Array): string | null {
  const zip = zipOf(bytes);
  if (!zip) return null;
  const slides = [...zip.keys()]
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]));
  if (!slides.length) return null;
  const parts = slides.map((name, i) => {
    const xml = decode.decode(zip.get(name) ?? new Uint8Array());
    const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)]
      .map((m) =>
        texts(m[1] ?? "", "a:t")
          .join("")
          .trim(),
      )
      .filter(Boolean);
    const [title = `Slide ${i + 1}`, ...rest] = paras;
    return [`## ${i + 1}. ${title}`, ...rest.map((l) => `- ${l}`)].join("\n");
  });
  return parts.join("\n\n").slice(0, MAX_TEXT);
}
