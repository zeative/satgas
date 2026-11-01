import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import pkg from "../../package.json";
import type { ClientMessage, ServerEvent } from "../shared/types";
import index from "../web/index.html";
import { config } from "./config";
import { serveFont } from "./fonts";
import { cancelRun, isLive, shutdown, startRun } from "./orchestrator";
import { deleteRun, flushAll, getLogs, getRun, listRuns, loadRuns, setPublisher, topicOf } from "./store";

interface SocketData {
  watching: string | null;
}

await loadRuns();

const isProd = process.env.NODE_ENV === "production";

const server: Server<SocketData> = Bun.serve({
  // Agents can write files and run commands, so the API must never be reachable off this machine.
  hostname: "127.0.0.1",
  port: config.port,
  development: isProd ? false : { hmr: true, console: true },
  routes: {
    "/": index,
    "/fonts/:name": (req) => serveFont(req.params.name),
    "/api/config": () => Response.json({ defaultCwd: config.defaultCwd, concurrency: config.concurrency, version: pkg.version }),
    "/api/runs": {
      GET: () => Response.json(listRuns()),
      POST: async (req) => {
        if (!isTrusted(req)) return forbidden();
        const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; cwd?: unknown };
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) return error(400, "The mission cannot be empty.");
        const cwd = resolve(typeof body.cwd === "string" && body.cwd.trim() ? body.cwd.trim() : config.defaultCwd);
        const isDir = await stat(cwd).then(
          (s) => s.isDirectory(),
          () => false,
        );
        if (!isDir) return error(400, `Working folder not found: ${cwd}`);
        return Response.json(startRun(prompt, cwd), { status: 201 });
      },
    },
    "/api/runs/:id": {
      GET: (req) => {
        const run = getRun(req.params.id);
        return run ? Response.json(run) : error(404, "Mission not found.");
      },
      DELETE: async (req) => {
        if (!isTrusted(req, false)) return forbidden();
        if (isLive(req.params.id)) return error(409, "Cancel the mission before deleting it.");
        return (await deleteRun(req.params.id)) ? new Response(null, { status: 204 }) : error(404, "Mission not found.");
      },
    },
    "/api/runs/:id/cancel": {
      POST: (req) => {
        if (!isTrusted(req)) return forbidden();
        return cancelRun(req.params.id) ? Response.json({ ok: true }) : error(409, "This mission is not running.");
      },
    },
  },
  fetch(req, srv) {
    if (new URL(req.url).pathname !== "/ws") return error(404, "Not found.");
    if (!isTrusted(req, false)) return forbidden();
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
      send(ws, { type: "snapshot", run, logs: getLogs(run.id) });
    },
  },
});

setPublisher((topic, event) => server.publish(topic, JSON.stringify(event)));

// Blocks cross-site requests: a JSON content type forces a CORS preflight we never answer, and a foreign Origin is refused outright.
function isTrusted(req: Request, requireJson = true): boolean {
  const origin = req.headers.get("origin");
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return false;
  return !requireJson || (req.headers.get("content-type") ?? "").includes("application/json");
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

process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));

console.log(`Satgas is ready at http://localhost:${server.port}`);
