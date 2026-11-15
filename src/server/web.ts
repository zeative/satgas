import { extname, join, normalize, resolve } from "node:path";
import { brotliCompress, constants, gzip } from "node:zlib";
import { config } from "./config";

// The UI is built by Vite into dist/web. A compiled binary carries those files in a generated
// manifest (scripts/build.ts); otherwise they are read from disk. In dev, Vite serves the UI itself.
const distDir = resolve(import.meta.dir, "../../dist/web");
let embedded: Record<string, string> | null = null;
try {
  // @ts-expect-error assets.gen.ts only exists while scripts/build.ts compiles the binary.
  embedded = (await import("./assets.gen.ts")).assets;
} catch {
  embedded = null;
}

const CACHEABLE = /^\/assets\//;
// The app must never be framed by another page (clickjacking); agent previews are served by their own route.
const NO_FRAMING = { "content-security-policy": "frame-ancestors 'none'", "x-frame-options": "DENY" };

// null for a malformed escape, which decodeURIComponent throws on.
export function decodePath(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

// Text assets go out compressed: the UI's scripts and styles are several megabytes raw and a fifth of that in Brotli.
// Built assets never change under their hashed names, so each is compressed once and kept.
const COMPRESSIBLE = new Set([".js", ".mjs", ".css", ".html", ".svg", ".json", ".txt", ".map", ".wasm"]);
const MIN_COMPRESS = 1024;
const packed = new Map<string, Promise<Uint8Array<ArrayBuffer> | null>>();

type Encoding = "br" | "gzip";

export function pickEncoding(accept: string | null | undefined): Encoding | null {
  const a = (accept ?? "").toLowerCase();
  if (/\bbr\b/.test(a)) return "br";
  if (/\bgzip\b/.test(a)) return "gzip";
  return null;
}

function compress(data: Uint8Array, encoding: Encoding): Promise<Uint8Array<ArrayBuffer> | null> {
  return new Promise((done) => {
    const cb = (err: Error | null, out: Buffer) => done(err ? null : new Uint8Array(out));
    if (encoding === "br")
      brotliCompress(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }, cb);
    else gzip(data, { level: 9 }, cb);
  });
}

async function compressed(key: string, file: ReturnType<typeof Bun.file>, encoding: Encoding, keep: boolean) {
  const id = `${encoding}:${key}`;
  let job = packed.get(id);
  if (!job) {
    job = file.bytes().then((b) => (b.length < MIN_COMPRESS ? null : compress(b, encoding)));
    // Only hashed assets are kept; the shell can change with every build, so it is compressed per request.
    if (keep) packed.set(id, job);
  }
  return job;
}

export async function serveWeb(pathname: string, acceptEncoding?: string | null): Promise<Response> {
  const decoded = decodePath(pathname);
  if (decoded === null) return new Response("Not found.", { status: 404, headers: NO_FRAMING });
  const file = await lookup(decoded);
  // A file that is not there, like a chunk of an older build, is a 404: answering it with the app shell makes the
  // browser read HTML as a script. Paths without an extension are client-side routes and get the shell.
  if (!file && extname(decoded)) return new Response("Not found.", { status: 404, headers: NO_FRAMING });
  const target = file ?? (await lookup("/index.html"));
  if (!target) {
    const devUrl = `http://localhost:${config.webPort}`;
    return new Response(`Satgas UI is not built. Run "bun run build:web", or use "bun run dev" and open ${devUrl}.`, {
      status: 404,
      headers: NO_FRAMING,
    });
  }
  const headers: Record<string, string> = { ...NO_FRAMING };
  const immutable = !!file && CACHEABLE.test(decoded);
  if (immutable) headers["cache-control"] = "public, max-age=31536000, immutable";
  const encoding = pickEncoding(acceptEncoding);
  const ext = extname(file ? decoded : "/index.html").toLowerCase();
  if (encoding && COMPRESSIBLE.has(ext)) {
    const body = await compressed(file ? decoded : "/index.html", target, encoding, immutable);
    if (body) {
      headers["content-encoding"] = encoding;
      headers.vary = "accept-encoding";
      headers["content-type"] = target.type;
      return new Response(body, { headers });
    }
  }
  return new Response(target, { headers });
}

async function lookup(pathname: string): Promise<ReturnType<typeof Bun.file> | null> {
  const clean = normalize(pathname);
  if (clean.includes("..") || !extname(clean)) return null;
  if (embedded) {
    const path = embedded[clean];
    return path ? Bun.file(path) : null;
  }
  const file = Bun.file(join(distDir, clean));
  return (await file.exists()) ? file : null;
}
