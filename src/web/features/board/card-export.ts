import { toast } from "sonner";
import { t } from "@/i18n";
import { type Block, type Inline, parseBlocks, parseInline } from "@/markdown";
import type { Card } from "../../../shared/board";
import { xlsxBytes } from "../../../shared/xlsx";
import { requestBoardExport } from "./export";

// Export from the right-click menu, in the forms each kind of card holds: a table as a spreadsheet, a document as a
// page, code as its own file. Everything is made in the browser from what the card already has.

export type CardFormat = "source" | "xlsx" | "csv" | "md" | "json" | "pdf" | "doc" | "html" | "txt" | "file" | "original" | "png";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "card";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const inside = (c: Card, f: Card) => c.id !== f.id && c.x >= f.x && c.y >= f.y && c.x + c.w <= f.x + f.w && c.y + c.h <= f.y + f.h;

// The cards an export covers: the picked ones, and what a picked frame holds.
export function expand(cards: Card[], all: Card[]): Card[] {
  const out = new Map(cards.map((c) => [c.id, c]));
  for (const f of cards.filter((c) => c.kind === "frame")) for (const c of all) if (inside(c, f)) out.set(c.id, c);
  return [...out.values()];
}

const tables = (cards: Card[]) => cards.filter((c) => c.kind === "table" && c.rows?.length);

// What the menu offers for a selection, best first.
export function exportFormats(picked: Card[], all: Card[]): CardFormat[] {
  const c = picked.length === 1 ? picked[0] : undefined;
  if (c && c.kind !== "frame") {
    switch (c.kind) {
      case "table":
        return [...(c.src ? (["source"] as const) : []), ...(c.rows?.length ? (["xlsx", "csv", "pdf", "md", "json"] as const) : []), "png"];
      case "doc":
        return [...(c.src ? (["source"] as const) : []), "pdf", "doc", "md", "html", "txt", "png"];
      case "note":
      case "text":
        return ["txt", "md", "pdf", "png"];
      case "code":
        return ["file", "txt", "png"];
      case "image":
        return c.src ? ["original", "png"] : ["png"];
      case "preview":
        return c.src ? ["html", "png"] : ["png"];
      case "files":
        return ["csv", "md"];
      default:
        return ["png"];
    }
  }
  // Several cards or a frame: a picture of them, a document of what they say, and their tables as one workbook.
  const covered = expand(picked, all);
  const hasText = covered.some((c) => (c.kind === "doc" || c.kind === "note" || c.kind === "text") && c.text);
  return [
    ...(tables(covered).length ? (["xlsx"] as const) : []),
    "png",
    "pdf",
    ...(hasText || tables(covered).length ? (["md"] as const) : []),
  ];
}

// Markdown reads as plain words in a spreadsheet cell: **bold** and `code` lose their marks, a link keeps its address.
export function plainText(text: string): string {
  const walk = (parts: Inline[]): string =>
    parts
      .map((p) =>
        p.type === "strong" || p.type === "em"
          ? walk(p.children)
          : p.type === "link"
            ? p.text === p.href
              ? p.href
              : `${p.text} (${p.href})`
            : p.text,
      )
      .join("");
  return walk(parseInline(text));
}

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: string[][]) => rows.map((r) => r.map((v) => csvCell(plainText(v))).join(",")).join("\r\n");
export const toMarkdownTable = (rows: string[][]) => {
  const [head = [], ...body] = rows;
  const line = (r: string[]) => `| ${r.map((v) => v.replace(/\|/g, "\\|")).join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...body.map(line)].join("\n");
};
export const toJson = (rows: string[][]) => {
  const [head = [], ...body] = rows;
  return JSON.stringify(
    body.map((r) => Object.fromEntries(head.map((h, i) => [h || `column_${i + 1}`, plainText(r[i] ?? "")]))),
    null,
    2,
  );
};

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inlineHtml = (parts: Inline[]): string =>
  parts
    .map((p) =>
      p.type === "strong"
        ? `<strong>${inlineHtml(p.children)}</strong>`
        : p.type === "em"
          ? `<em>${inlineHtml(p.children)}</em>`
          : p.type === "code"
            ? `<code>${escHtml(p.text)}</code>`
            : p.type === "link"
              ? p.external
                ? `<a href="${escHtml(p.href)}">${escHtml(p.text)}</a>`
                : escHtml(p.text)
              : escHtml(p.text),
    )
    .join("");
const tableHtml = (rows: string[][]) => {
  const [head = [], ...body] = rows;
  return `<table><thead><tr>${head.map((h) => `<th>${inlineHtml(parseInline(h))}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${head.map((_, i) => `<td>${inlineHtml(parseInline(r[i] ?? ""))}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
};
const blockHtml = (b: Block): string =>
  b.type === "h"
    ? `<h2>${inlineHtml(parseInline(b.text.replace(/^#+\s*/, "")))}</h2>`
    : b.type === "p"
      ? `<p>${inlineHtml(parseInline(b.text))}</p>`
      : b.type === "code"
        ? `<pre><code>${escHtml(b.text)}</code></pre>`
        : b.type === "table"
          ? tableHtml(b.rows)
          : `<${b.type}>${b.items.map((i) => `<li>${inlineHtml(parseInline(i))}</li>`).join("")}</${b.type}>`;

const PAGE_STYLE = `body{font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;color:#18181b;max-width:820px;margin:32px auto;padding:0 24px}
h1{font-size:22px;margin:0 0 16px}h2{font-size:17px;margin:24px 0 8px}p,ul,ol{margin:0 0 12px}
table{border-collapse:collapse;width:100%;margin:0 0 16px;font-size:12px}th,td{border:1px solid #d4d4d8;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f4f5}
pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto;font-size:12px}code{font-family:ui-monospace,Menlo,monospace;font-size:.9em}a{color:#2563eb}
@page{margin:14mm}@media print{body{margin:0;max-width:none}}`;

// One card, or several, as a standalone page: headings from titles, documents and notes as text, tables as tables.
export function cardsHtml(cards: Card[], title: string): string {
  const body = cards
    .map((c) => {
      const heading = c.title && cards.length > 1 ? `<h2>${escHtml(c.title)}</h2>` : "";
      if (c.kind === "table" && c.rows?.length) return heading + tableHtml(c.rows);
      if (c.kind === "code") return `${heading}<pre><code>${escHtml(c.text ?? "")}</code></pre>`;
      if (c.text) return heading + parseBlocks(c.text).map(blockHtml).join("");
      return "";
    })
    .filter(Boolean)
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${PAGE_STYLE}</style></head><body><h1>${escHtml(title)}</h1>${body}</body></html>`;
}

// The browser's own print dialog saves the page as a PDF, with real, selectable text.
function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(frame);
  const doc = frame.contentDocument;
  if (!doc) return frame.remove();
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 50);
}

const EXT: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  tsx: "tsx",
  jsx: "jsx",
  json: "json",
  html: "html",
  css: "css",
  bash: "sh",
  shell: "sh",
  sql: "sql",
  go: "go",
  rust: "rs",
  java: "java",
  ruby: "rb",
  php: "php",
  yaml: "yml",
  markdown: "md",
};

// A code card's title is usually its file name; otherwise its language says the extension.
export function codeFileName(c: Card): string {
  const named = c.title?.split("/").pop()?.trim();
  if (named && /\.[a-z0-9]{1,8}$/i.test(named)) return named;
  return `${slug(named || "snippet")}.${EXT[(c.lang ?? "").toLowerCase()] ?? "txt"}`;
}

const nameOf = (cards: Card[], fallback: string) => slug((cards.length === 1 ? cards[0]?.title : undefined) || fallback);

// Does the export; resolve turns a card's own file link into one this page may fetch.
export async function exportCards(picked: Card[], all: Card[], format: CardFormat, boardTitle: string, resolve: (src: string) => string) {
  const cards = expand(picked, all);
  const name = nameOf(picked, boardTitle);
  const title = (picked.length === 1 ? picked[0]?.title : undefined) || boardTitle;
  const first = picked[0];
  const text = (type: string, body: string, ext: string) => download(new Blob([body], { type: `${type};charset=utf-8` }), `${name}.${ext}`);
  try {
    switch (format) {
      case "png":
        requestBoardExport(
          "png",
          picked.map((c) => c.id),
          name,
        );
        return;
      case "pdf":
        // Words print as a page with real text; a picture-only selection prints as its image.
        if (cards.some((c) => c.text || c.rows?.length))
          printHtml(
            cardsHtml(
              cards.filter((c) => c.kind !== "frame"),
              title,
            ),
          );
        else
          requestBoardExport(
            "pdf",
            picked.map((c) => c.id),
            name,
          );
        return;
      case "xlsx": {
        const sheets = tables(cards).map((c, i) => ({
          name: c.title || `Table ${i + 1}`,
          rows: (c.rows ?? []).map((r) => r.map(plainText)),
        }));
        download(
          new Blob([xlsxBytes(sheets) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          `${name}.xlsx`,
        );
        return;
      }
      case "csv":
        if (first?.kind === "files")
          text("text/csv", `﻿${toCsv([["Path", "Change"], ...(first.files ?? []).map((f) => [f.path, f.change])])}`, "csv");
        // A byte-order mark so Excel opens accented and non-Latin text correctly.
        else text("text/csv", `﻿${toCsv(first?.rows ?? [])}`, "csv");
        return;
      case "json":
        text("application/json", toJson(first?.rows ?? []), "json");
        return;
      case "md": {
        const parts = cards
          .filter((c) => c.kind !== "frame")
          .map((c) => {
            const head = c.title && cards.length > 1 ? `## ${c.title}\n\n` : "";
            if (c.kind === "table" && c.rows?.length) return head + toMarkdownTable(c.rows);
            if (c.kind === "files") return head + (c.files ?? []).map((f) => `- \`${f.path}\` (${f.change})`).join("\n");
            if (c.kind === "code") return `${head}\`\`\`${c.lang ?? ""}\n${c.text ?? ""}\n\`\`\``;
            return c.text ? head + c.text : "";
          })
          .filter(Boolean);
        text("text/markdown", `${parts.join("\n\n")}\n`, "md");
        return;
      }
      case "html":
        if (first?.kind === "preview" && first.src) {
          const res = await fetch(resolve(first.src));
          if (!res.ok) throw new Error(`${res.status}`);
          download(await res.blob(), `${name}.html`);
        } else text("text/html", cardsHtml(cards, title), "html");
        return;
      case "doc":
        // Word opens an HTML document saved as .doc, headings, lists and tables included.
        text("application/msword", cardsHtml(cards, title), "doc");
        return;
      case "txt":
        text("text/plain", first?.kind === "code" ? (first.text ?? "") : plainText(first?.text ?? ""), "txt");
        return;
      case "file":
        if (first) download(new Blob([first.text ?? ""], { type: "text/plain;charset=utf-8" }), codeFileName(first));
        return;
      case "source":
        // The file the card was made from (an agent's .xlsx, .docx or .pptx), exactly as it is on disk.
        if (first?.src) {
          const res = await fetch(resolve(first.src));
          if (!res.ok) throw new Error(`${res.status}`);
          download(await res.blob(), decodeURIComponent(first.src.split("/").pop() ?? name));
        }
        return;
      case "original":
        if (first?.src) {
          const res = await fetch(resolve(first.src));
          if (!res.ok) throw new Error(`${res.status}`);
          const blob = await res.blob();
          const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png";
          download(blob, `${name}.${ext}`);
        }
        return;
    }
  } catch {
    toast.error(t.exporter.failed);
  }
}

export type CopyFormat = "png" | "tsv" | "csv" | "md" | "json" | "txt" | "html" | "code" | "image" | "link";

// What Copy as offers for a selection, the most useful paste first.
export function copyFormats(picked: Card[], all: Card[]): CopyFormat[] {
  const c = picked.length === 1 ? picked[0] : undefined;
  if (c && c.kind !== "frame") {
    switch (c.kind) {
      case "table":
        return c.rows?.length ? ["tsv", "md", "csv", "json", "html", "png"] : ["png"];
      case "doc":
      case "note":
      case "text":
        return c.text ? ["md", "txt", "html", "png"] : ["png"];
      case "code":
        return ["code", "md", "png"];
      case "image":
        return c.src ? ["image", "link", "png"] : ["png"];
      case "preview":
        return c.src ? ["link", "png"] : ["png"];
      case "files":
        return ["txt", "md"];
      default:
        return c.text ? ["txt", "png"] : ["png"];
    }
  }
  const covered = expand(picked, all);
  const words = covered.some((x) => x.text || x.rows?.length);
  return ["png", ...(words ? (["md", "txt", "html"] as const) : [])];
}

const tsv = (rows: string[][]) => rows.map((r) => r.map((v) => plainText(v).replace(/[\t\n]+/g, " ")).join("\t")).join("\n");

function asMarkdown(cards: Card[]): string {
  return cards
    .filter((c) => c.kind !== "frame")
    .map((c) => {
      const head = c.title && cards.length > 1 ? `## ${c.title}\n\n` : "";
      if (c.kind === "table" && c.rows?.length) return head + toMarkdownTable(c.rows);
      if (c.kind === "files") return head + (c.files ?? []).map((f) => `- \`${f.path}\` (${f.change})`).join("\n");
      if (c.kind === "code") return `${head}\`\`\`${c.lang ?? ""}\n${c.text ?? ""}\n\`\`\``;
      return c.text ? head + c.text : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function asPlain(cards: Card[]): string {
  return cards
    .filter((c) => c.kind !== "frame")
    .map((c) => {
      if (c.kind === "table" && c.rows?.length) return tsv(c.rows);
      if (c.kind === "files") return (c.files ?? []).map((f) => f.path).join("\n");
      if (c.kind === "code") return c.text ?? "";
      return c.text
        ? c.text
            .split("\n")
            .map((l) => plainText(l.replace(/^#+\s*/, "").replace(/^\s*[-*]\s+/, "• ")))
            .join("\n")
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

// Any picture as a PNG blob, since the clipboard only takes PNG images.
async function pngOf(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  const blob = await res.blob();
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

// Copies in the chosen form. Writes start inside the click (browsers allow a write whose content is still on its way),
// so even an image that has to be fetched first reaches the clipboard.
export async function copyCards(picked: Card[], all: Card[], format: CopyFormat, resolve: (src: string) => string) {
  const cards = expand(picked, all);
  const first = picked[0];
  const plain = (text: string) => navigator.clipboard.writeText(text);
  try {
    switch (format) {
      case "png":
        requestBoardExport(
          "clipboard",
          picked.map((c) => c.id),
        );
        return;
      case "tsv":
        await plain(tsv(first?.rows ?? []));
        break;
      case "csv":
        await plain(toCsv(first?.rows ?? []));
        break;
      case "json":
        await plain(toJson(first?.rows ?? []));
        break;
      case "md":
        await plain(asMarkdown(cards));
        break;
      case "txt":
        await plain(asPlain(cards));
        break;
      case "code":
        await plain(first?.text ?? "");
        break;
      case "html": {
        // Rich text keeps headings, lists and tables when pasted into a document or an email; plain text rides along.
        const html = cardsHtml(
          cards.filter((c) => c.kind !== "frame"),
          first?.title ?? "",
        )
          .replace(/^[\s\S]*<body><h1>[\s\S]*?<\/h1>/, "")
          .replace(/<\/body><\/html>$/, "");
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([asPlain(cards)], { type: "text/plain" }),
          }),
        ]);
        break;
      }
      case "image":
        if (first?.src) await navigator.clipboard.write([new ClipboardItem({ "image/png": pngOf(resolve(first.src)) })]);
        break;
      case "link":
        if (first?.src) await plain(new URL(resolve(first.src), location.href).href);
        break;
    }
    toast.success(t.boardMenu.copied);
  } catch {
    toast.error(t.boardMenu.copyFailed);
  }
}
