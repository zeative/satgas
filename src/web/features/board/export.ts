import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import type { Run } from "../../../shared/types";

// Ask the open canvas for a picture of the board, or of a few cards; it answers through the same event.
export type ExportFormat = "png" | "pdf" | "clipboard";
export interface ExportRequest {
  format: ExportFormat;
  ids?: string[];
  // The file name without extension, when it should not be the board's.
  name?: string;
}
export const requestBoardExport = (format: ExportFormat, ids?: string[], name?: string) =>
  window.dispatchEvent(new CustomEvent<ExportRequest>("satgas:export", { detail: { format, ids, name } }));

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "board";

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

// The React Flow recipe: frame the nodes, then render the viewport at that framing, twice the pixels for sharpness.
// `keep` limits the picture to some nodes and edges; everything else is left out of the render.
export async function boardPng(nodes: Node[], background: string, keep?: ReadonlySet<string>): Promise<string> {
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport || !nodes.length) throw new Error("empty");
  // Loaded on first export, so the board itself does not carry the renderer.
  const { toPng } = await import("html-to-image");
  const bounds = getNodesBounds(nodes);
  const width = Math.min(4096, Math.round(bounds.width + 160));
  const height = Math.min(4096, Math.round(bounds.height + 160));
  const view = getViewportForBounds(bounds, width, height, 0.1, 2, 0.05);
  return toPng(viewport, {
    backgroundColor: background,
    width,
    height,
    pixelRatio: 2,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` },
    filter: keep
      ? (el) => {
          const item = el instanceof Element ? el.closest(".react-flow__node, .react-flow__edge") : null;
          return !item || item !== el || keep.has((el as HTMLElement).dataset.id ?? "");
        }
      : undefined,
  });
}

export const pngBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

// The clipboard only takes a write while the click that asked for it is still the current gesture, and rendering the
// board takes longer than that. So the write starts at once with the picture still on its way, which browsers allow.
export function copyPngLater(render: Promise<string>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ "image/png": render.then(pngBlob) })]);
}

export function savePng(dataUrl: string, run: Run, name?: string) {
  download(dataUrl, `${name ?? slug(run.title ?? run.prompt)}.png`);
}

// Printing a page that holds only the board image lets the browser's own dialog save it as a PDF, no popup needed.
export function printPdf(dataUrl: string, run: Run) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(frame);
  const doc = frame.contentDocument;
  if (!doc) return frame.remove();
  doc.title = run.title ?? run.prompt;
  const style = doc.createElement("style");
  style.textContent = "@page{margin:12mm}html,body{margin:0}img{width:100%;height:auto;display:block}";
  const img = doc.createElement("img");
  img.src = dataUrl;
  doc.head.append(style);
  doc.body.append(img);
  img.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// One CSV per table card, named after the card.
export function exportTables(run: Run) {
  const tables = (run.board?.cards ?? []).filter((c) => c.kind === "table" && c.rows?.length);
  tables.forEach((c, i) => {
    const csv = (c.rows ?? []).map((r) => r.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    setTimeout(() => {
      download(url, `${slug(c.title ?? `table-${i + 1}`)}.csv`);
      URL.revokeObjectURL(url);
    }, i * 200);
  });
}

// Everything on the board in one file: prompts, plan, results and cards.
export function exportBackup(run: Run) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }));
  download(url, `${slug(run.title ?? run.prompt)}-backup.json`);
  URL.revokeObjectURL(url);
}

// A picture of a few cards for the chat to attach (the ink a person drew, with what it marks); null when the board
// cannot draw it. The open canvas answers through the resolve it is handed.
export interface SnapshotRequest {
  ids: string[];
  resolve: (dataUrl: string | null) => void;
}
export const requestSnapshot = (ids: string[]) =>
  new Promise<string | null>((resolve) => {
    let answered = false;
    const done = (v: string | null) => {
      if (answered) return;
      answered = true;
      resolve(v);
    };
    window.dispatchEvent(new CustomEvent<SnapshotRequest>("satgas:snapshot", { detail: { ids, resolve: done } }));
    // No canvas on screen to answer: send without the picture rather than wait.
    setTimeout(() => done(null), 4000);
  });
