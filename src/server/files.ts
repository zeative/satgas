import { mkdir, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { assetsDir } from "./store";

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};
const MAX_UPLOAD = 20 * 1024 * 1024;
const ASSET_NAME = /^[a-f0-9-]{36}\.(png|jpg|gif|webp|svg|avif)$/;

// Agent-written pages and SVGs run in an opaque origin, even when opened directly, so their scripts can never call this API.
const SANDBOXED = { "content-security-policy": "sandbox allow-scripts allow-forms allow-popups allow-modals", "cache-control": "no-store" };

export async function saveImage(runId: string, req: Request): Promise<{ src: string } | { error: string; status: number }> {
  const ext = IMAGE_TYPES[(req.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? ""];
  if (!ext) return { error: "Only PNG, JPEG, GIF, WebP, SVG and AVIF images can be added.", status: 415 };
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD) return { error: "Images are limited to 20 MB.", status: 413 };
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD) return { error: "Images are limited to 20 MB.", status: 413 };
  const name = `${crypto.randomUUID()}.${ext}`;
  await mkdir(assetsDir(runId), { recursive: true });
  await Bun.write(join(assetsDir(runId), name), bytes);
  return { src: `/api/runs/${runId}/assets/${name}` };
}

// A picture a tool gave an agent (a screenshot it took, an image it read), kept with the board's assets so the chat can
// show it under the step. Base64 from the agent's stream; none above the size an upload may have.
const MAX_PICTURE = 8 * 1024 * 1024;
export async function savePicture(runId: string, mime: string, data: string): Promise<string | null> {
  const ext = IMAGE_TYPES[mime];
  if (!ext || data.length > (MAX_PICTURE * 4) / 3) return null;
  const name = `${crypto.randomUUID()}.${ext}`;
  await mkdir(assetsDir(runId), { recursive: true });
  await Bun.write(join(assetsDir(runId), name), Buffer.from(data, "base64"));
  return name;
}

export async function serveAsset(runId: string, name: string): Promise<Response> {
  if (!ASSET_NAME.test(name)) return new Response("Not found.", { status: 404 });
  const file = Bun.file(join(assetsDir(runId), name));
  if (!(await file.exists())) return new Response("Not found.", { status: 404 });
  return new Response(file, { headers: { ...SANDBOXED, "cache-control": "public, max-age=31536000, immutable" } });
}

// An upload lives outside the workspace, so agents get their own copy; the same upload always lands on the same file.
export async function copyAsset(runId: string, name: string, title: string, cwd: string): Promise<string | null> {
  if (!ASSET_NAME.test(name)) return null;
  const source = Bun.file(join(assetsDir(runId), name));
  if (!(await source.exists())) return null;
  const stem =
    title
      .replace(/\.[^.]+$/, "")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .slice(0, 40) || "image";
  const path = `attachments/${stem}-${name.slice(0, 8)}${name.slice(name.lastIndexOf("."))}`;
  if (!(await Bun.file(join(cwd, path)).exists())) {
    await mkdir(join(cwd, "attachments"), { recursive: true });
    await Bun.write(join(cwd, path), source);
  }
  return path;
}

// Serves a file from the mission's working folder, for previews and images agents wrote; never anything outside it.
// Both sides are resolved through symlinks, so a link inside the folder cannot point the browser at anything outside it.
export async function serveWorkFile(cwd: string, relPath: string): Promise<Response> {
  const notFound = () => new Response("Not found.", { status: 404 });
  const root = await realpath(resolve(cwd)).catch(() => null);
  const full = await realpath(resolve(cwd, relPath)).catch(() => null);
  if (!root || !full?.startsWith(root + sep)) return notFound();
  const file = Bun.file(full);
  if (!(await file.exists())) return notFound();
  // A sandboxed document cannot host the browser's PDF viewer; a PDF runs no page script, so it is served plain.
  if (/\.pdf$/i.test(full)) return new Response(file, { headers: { "content-type": "application/pdf", "cache-control": "no-store" } });
  return new Response(file, { headers: SANDBOXED });
}
