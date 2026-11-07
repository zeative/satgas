import { extname, join, normalize, resolve } from "node:path";
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

export async function serveWeb(pathname: string): Promise<Response> {
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
  if (file && CACHEABLE.test(decoded)) headers["cache-control"] = "public, max-age=31536000, immutable";
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
