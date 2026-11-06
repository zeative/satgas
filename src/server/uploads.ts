import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

// Files people attach to a prompt wait here until the prompt is sent, then move into the board's workspace, where the
// planner and every agent can read them.
export const MAX_ATTACHMENT = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
const STALE_MS = 24 * 60 * 60 * 1000;
const ID = /^[a-f0-9]{24}$/;

const root = () => join(config.dataDir, "uploads");

// Keeps letters, digits, dots, dashes and underscores; never a path, never hidden, never empty.
export function safeName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFKC");
  const clean = base
    .replace(/[^\p{L}\p{N}._ -]+/gu, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+/, "")
    .trim()
    .slice(0, 120);
  return clean || "file";
}

export async function stageUpload(req: Request): Promise<{ id: string; name: string; size: number } | { error: string; status: number }> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT) return { error: "Attachments are limited to 25 MB each.", status: 413 };
  const name = safeName(decodeURIComponent(req.headers.get("x-file-name") ?? "file"));
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > MAX_ATTACHMENT) return { error: "Attachments are limited to 25 MB each.", status: 413 };
  if (!body.byteLength) return { error: "The file is empty.", status: 400 };
  const id = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("hex");
  const dir = join(root(), id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await Bun.write(join(dir, name), body);
  return { id, name, size: body.byteLength };
}

// Moves staged files into `<cwd>/attachments/`, renaming on clashes, and answers with workspace-relative paths.
export async function claimUploads(ids: unknown, cwd: string): Promise<string[]> {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const dest = join(cwd, "attachments");
  for (const id of ids.slice(0, MAX_ATTACHMENTS)) {
    if (typeof id !== "string" || !ID.test(id)) continue;
    const dir = join(root(), id);
    const [name] = await readdir(dir).catch(() => [] as string[]);
    if (!name) continue;
    await mkdir(dest, { recursive: true });
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let target = name;
    for (let n = 2; await Bun.file(join(dest, target)).exists(); n++) target = `${stem}-${n}${ext}`;
    await rename(join(dir, name), join(dest, target));
    await rm(dir, { recursive: true, force: true });
    out.push(`attachments/${target}`);
  }
  return out;
}

// Attachments of prompts that were never sent are cleared after a day.
export async function pruneUploads(now = Date.now()) {
  const ids = await readdir(root()).catch(() => [] as string[]);
  for (const id of ids) {
    const info = await stat(join(root(), id)).catch(() => null);
    if (info && now - info.mtimeMs > STALE_MS) await rm(join(root(), id), { recursive: true, force: true });
  }
}
