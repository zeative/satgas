import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import pkg from "../../package.json";
import { sanitizeOps } from "../shared/board";
import { maskSettings, restoreSecrets } from "../shared/settings";
import { type ClientMessage, cleanIcon, type Run, type ServerEvent } from "../shared/types";
import { detectAgents } from "./agents/detect";
import { authorized, fileKey, loadToken, signIn, signInCookie, signInLink, signOutCookie, validFileKey } from "./auth";
import { config } from "./config";
import { saveImage, serveAsset, serveWorkFile } from "./files";
import { repoStars } from "./github";
import { cancelRun, continueRun, isLive, shutdown, startRun } from "./orchestrator";
import { providerStatuses } from "./providers";
import { getSettings, loadSettings, saveSettings, taskAgents } from "./settings";
import {
  boardOps,
  deleteRun,
  flushAll,
  getLogs,
  getRun,
  listRuns,
  loadRuns,
  newRunId,
  ownWorkspace,
  patchRun,
  setPublisher,
  topicOf,
} from "./store";
import { decodePath, serveWeb } from "./web";

interface SocketData {
  watching: string | null;
}

await loadRuns();
await loadSettings();
const { fromEnv: tokenFromEnv } = await loadToken();
// Started now so the answer is ready by the time the UI asks for it.
void detectAgents();

const isProd = process.env.NODE_ENV === "production";
// The same cap for a new mission and a follow-up; the planner reads the whole prompt.
const MAX_PROMPT = 20_000;

const server: Server<SocketData> = Bun.serve({
  // Loopback unless SATGAS_HOST says otherwise; on a server it sits behind HTTPS and every call needs the sign-in token.
  hostname: config.host,
  port: config.port,
  development: !isProd,
  routes: {
    "/api/auth": {
      // One-click sign-in from the link Satgas prints when it starts.
      GET: open((req) => {
        const result = signIn(new URL(req.url).searchParams.get("token") ?? "");
        if (result === "ok")
          return new Response(null, { status: 303, headers: { location: "/", "set-cookie": signInCookie(), "cache-control": "no-store" } });
        const text =
          result === "limited"
            ? "Too many sign-in attempts, wait a minute and try again"
            : "This sign-in link is not valid. Use the link Satgas printed when it started, or paste the token on the sign-in page.";
        return new Response(text, { status: result === "limited" ? 429 : 401, headers: { "content-type": "text/plain; charset=utf-8" } });
      }),
      // The sign-in page posts the pasted token.
      POST: open(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
        const result = signIn(typeof body?.token === "string" ? body.token.trim() : "");
        if (result === "limited") return error(429, "Too many sign-in attempts, wait a minute and try again");
        if (result === "wrong") return error(401, "That token is not right");
        return new Response(null, { status: 204, headers: { "set-cookie": signInCookie() } });
      }),
      DELETE: api((req) =>
        isTrusted(req, false) ? new Response(null, { status: 204, headers: { "set-cookie": signOutCookie() } }) : forbidden(),
      ),
    },
    "/api/config": api(async () =>
      Response.json({
        defaultCwd: config.defaultCwd,
        concurrency: config.concurrency,
        version: pkg.version,
        // A hung CLI must not hold up the composer; the agent pill simply stays hidden.
        agents: await Promise.race([detectAgents(), Bun.sleep(1500).then(() => null)]),
      }),
    ),
    "/api/settings": {
      // Keys and env/header values never leave the server; the page gets masks and sends them back untouched.
      GET: api(() => Response.json(maskSettings(getSettings()))),
      PUT: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const restored = restoreSecrets(await req.json().catch(() => null), getSettings());
        if (typeof restored === "string") return error(400, restored);
        const saved = await saveSettings(restored.input);
        return typeof saved === "string" ? error(400, saved) : Response.json(maskSettings(saved));
      }),
    },
    // ?refresh=1 re-runs every check instead of answering from the minute-long cache; only Satgas's own pages may ask,
    // so another site (an <img> pointing here) cannot make it spawn CLIs and call APIs at will.
    "/api/providers": api(async (req) => {
      const site = req.headers.get("sec-fetch-site");
      const refresh = new URL(req.url).searchParams.has("refresh") && (!site || site === "same-origin" || site === "none");
      return Response.json(await providerStatuses(refresh));
    }),
    // The emoji picker's data, served from the local package instead of a CDN so Satgas works offline.
    "/api/emojibase/:locale/:file": api(async (req) => {
      const { locale, file } = req.params;
      if (locale !== "en" || (file !== "data.json" && file !== "messages.json")) return error(404, "Not found.");
      const data = Bun.file(new URL(import.meta.resolve(`emojibase-data/en/${file}`)));
      return new Response(data, { headers: { "content-type": "application/json", "cache-control": "public, max-age=604800" } });
    }),
    "/api/repo": api(async () => Response.json({ url: `https://github.com/${config.repo}`, stars: await repoStars() })),
    "/api/runs": {
      GET: api(() => Response.json(listRuns())),
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; cwd?: unknown };
        const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT) : "";
        if (!prompt) return error(400, "The mission cannot be empty.");
        if (!taskAgents().length) return error(400, "Turn on at least one agent in Integrations.");
        if (typeof body.cwd === "string" && body.cwd.trim()) {
          const cwd = resolve(body.cwd.trim());
          const isDir = await stat(cwd).then(
            (s) => s.isDirectory(),
            () => false,
          );
          if (!isDir) return error(400, `Working folder not found: \`${cwd}\``);
          return Response.json(startRun(prompt, cwd), { status: 201 });
        }
        // No folder given: the board works in a fresh workspace of its own, named after it.
        const id = newRunId();
        const cwd = join(config.dataDir, "workspaces", id);
        await mkdir(cwd, { recursive: true });
        return Response.json(startRun(prompt, cwd, id), { status: 201 });
      }),
    },
    "/api/runs/:id": {
      GET: api((req) => {
        const run = getRun(req.params.id);
        return run ? Response.json(forPage(run)) : error(404, "Mission not found.");
      }),
      // Board details people can change themselves; for now its icon.
      PATCH: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        if (!getRun(req.params.id)) return error(404, "Mission not found.");
        const body = (await req.json().catch(() => ({}))) as { icon?: unknown };
        const icon = cleanIcon(body.icon);
        if (icon === null) return error(400, "The icon must be a single emoji.");
        patchRun(req.params.id, { icon });
        return new Response(null, { status: 204 });
      }),
      DELETE: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        if (isLive(req.params.id)) return error(409, "Cancel the mission before deleting it.");
        return (await deleteRun(req.params.id)) ? new Response(null, { status: 204 }) : error(404, "Mission not found.");
      }),
    },
    "/api/runs/:id/prompt": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) return error(400, "The prompt cannot be empty.");
        if (!taskAgents().length) return error(400, "Turn on at least one agent in Integrations.");
        const result = continueRun(req.params.id, prompt.slice(0, MAX_PROMPT));
        if (result === "missing") return error(404, "Board not found.");
        if (result === "busy") return error(409, "Agents are still working on this board. Stop them or wait for them to finish.");
        return Response.json({ ok: true }, { status: 202 });
      }),
    },
    "/api/runs/:id/board": {
      POST: api(async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => null)) as { ops?: unknown; origin?: unknown } | null;
        const ops = sanitizeOps(body?.ops);
        if (!ops) return error(400, "The board change was malformed.");
        const origin = typeof body?.origin === "string" ? body.origin.slice(0, 64) : undefined;
        return boardOps(req.params.id, ops, origin) ? new Response(null, { status: 204 }) : error(404, "Board not found.");
      }),
    },
    "/api/runs/:id/assets": {
      POST: api(async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        if (!getRun(req.params.id)) return error(404, "Board not found.");
        const saved = await saveImage(req.params.id, req);
        return "src" in saved ? Response.json(saved, { status: 201 }) : error(saved.status, saved.error);
      }),
    },
    "/api/runs/:id/assets/:name": api((req) => serveAsset(req.params.id, req.params.name)),
    // Opened by the signed-in page, or through `~<key>/` for sandboxed previews, which can't send the cookie.
    "/api/runs/:id/files/*": open((req) => {
      const run = getRun(req.params.id);
      if (!run) return authorized(req) ? error(404, "Board not found.") : signInFirst();
      const prefix = `/api/runs/${req.params.id}/files/`;
      let path = new URL(req.url).pathname.slice(prefix.length);
      const keyed = /^~([A-Za-z0-9_-]+)\/(.*)$/.exec(path);
      if (keyed) {
        if (!validFileKey(run.id, keyed[1] ?? "")) return signInFirst();
        path = keyed[2] ?? "";
      } else if (!authorized(req)) return signInFirst();
      const rel = decodePath(path);
      return rel === null ? error(404, "Not found.") : serveWorkFile(run.cwd, rel);
    }),
    "/api/runs/:id/cancel": {
      POST: api((req) => {
        if (!isTrusted(req)) return forbidden();
        return cancelRun(req.params.id) ? Response.json({ ok: true }) : error(409, "This mission is not running.");
      }),
    },
  },
  fetch(req, srv) {
    if (!allowedHost(req)) return misdirected();
    const { pathname } = new URL(req.url);
    if (pathname !== "/ws") return serveWeb(pathname);
    if (!isTrusted(req, false)) return forbidden();
    if (!authorized(req)) return signInFirst();
    return srv.upgrade(req, { data: { watching: null } }) ? undefined : error(400, "WebSocket upgrade failed.");
  },
  websocket: {
    open(ws) {
      ws.subscribe("runs");
    },
    message(ws, raw) {
      const msg = parse(String(raw));
      if (msg?.type !== "watch") return;
      if (ws.data.watching) ws.unsubscribe(topicOf(ws.data.watching));
      ws.data.watching = msg.runId;
      const run = msg.runId ? getRun(msg.runId) : undefined;
      if (!run) return;
      ws.subscribe(topicOf(run.id));
      send(ws, { type: "snapshot", run: forPage(run), logs: getLogs(run.id) });
    },
  },
});

setPublisher((topic, event) => server.publish(topic, JSON.stringify(event)));

const publicHost = config.publicUrl ? new URL(config.publicUrl).host.toLowerCase() : null;

// DNS rebinding makes a hostile page same-origin with Satgas under its own name; only this machine's names and the
// configured public address are answered.
function allowedHost(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || host === publicHost;
}

const misdirected = () => new Response("Satgas only answers requests addressed to this machine or to SATGAS_PUBLIC_URL.", { status: 421 });

const signInFirst = () => Response.json({ error: "Sign in to Satgas first.", signIn: true }, { status: 401 });

// Every API route: addressed to this machine or its public name, from a signed-in browser or script.
function api<R extends Request, A extends unknown[]>(handler: (req: R, ...rest: A) => Response | Promise<Response>) {
  return (req: R, ...rest: A) => (!allowedHost(req) ? misdirected() : authorized(req) ? handler(req, ...rest) : signInFirst());
}

// Routes that work before signing in (the sign-in itself) or check access themselves.
function open<R extends Request, A extends unknown[]>(handler: (req: R, ...rest: A) => Response | Promise<Response>) {
  return (req: R, ...rest: A) => (allowedHost(req) ? handler(req, ...rest) : misdirected());
}

// What the page gets for a board: the run plus its preview key and whether deleting it removes its files too.
const forPage = (run: Run) => ({ ...run, fileKey: fileKey(run.id), ownWorkspace: ownWorkspace(run.cwd) });

// Pages allowed to call the API: this server's own, the public address, and in development the Vite server in front.
// Any other local port may be a page an agent is serving.
const trustedOrigins = new Set([
  ...(isProd ? [server.port] : [server.port, config.webPort]).flatMap((port) =>
    ["localhost", "127.0.0.1", "[::1]"].map((host) => `http://${host}:${port}`),
  ),
  ...(config.publicUrl ? [new URL(config.publicUrl).origin] : []),
]);

// Blocks cross-site requests: a foreign Origin is refused outright, and a JSON content type (exactly that, since
// `text/plain; application/json` still counts as a simple type) forces a CORS preflight we never answer.
function isTrusted(req: Request, requireJson = true): boolean {
  const origin = req.headers.get("origin");
  if (origin && !trustedOrigins.has(origin)) return false;
  return !requireJson || (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
}

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

const forbidden = () => error(403, "Request refused.");

function parse(raw: string): ClientMessage | undefined {
  try {
    return JSON.parse(raw) as ClientMessage;
  } catch {
    return undefined;
  }
}

function send(ws: ServerWebSocket<SocketData>, event: ServerEvent) {
  ws.send(JSON.stringify(event));
}

let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} received, stopping agents and saving missions…`);
  await shutdown();
  await flushAll();
  server.stop(true);
  process.exit(0);
}

// `bun --hot` re-runs this file, so the signal handlers are added once and always call the latest stop().
const hot = globalThis as typeof globalThis & { __satgasStop?: (signal: string) => void };
if (!hot.__satgasStop) {
  process.on("SIGINT", () => hot.__satgasStop?.("SIGINT"));
  process.on("SIGTERM", () => hot.__satgasStop?.("SIGTERM"));
}
hot.__satgasStop = (signal) => void stop(signal);

const pageUrl = config.publicUrl ?? `http://localhost:${isProd ? server.port : config.webPort}`;
console.log(isProd ? `Satgas is ready at ${pageUrl}` : `Satgas API on http://localhost:${server.port}; open the UI at ${pageUrl}`);
console.log(tokenFromEnv ? "Sign in with the token in SATGAS_TOKEN." : `Sign in once per browser: ${signInLink(pageUrl)}`);
