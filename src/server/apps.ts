// Web apps agents build that need a server (a Vite or Next dev server, an API): Satgas runs them, in their own process
// group, and serves them under its own address at /apps/<board>/<key>/<name>/, so the person opens them the same way
// on a laptop and on a VPS where nothing but Satgas's address is reachable. A task's own background processes are
// stopped when it ends; these outlive it, and stop by themselves after two hours nobody opened them.

import { resolve, sep } from "node:path";
import type { Subprocess } from "bun";
import { type BoardOp, type Card, DEFAULT_SIZE } from "../shared/board";
import type { RunApp } from "../shared/types";
import { ANSI, childEnv } from "./agents/process";
import { placeInFlow } from "./artifacts";
import { appKey, COOKIE, validAppKey } from "./auth";
import { boardOps, getRun, patchRun } from "./store";

const PORTS = (process.env.SATGAS_APP_PORTS ?? "4400-4499").split("-").map(Number);
const FIRST_PORT = PORTS[0] ?? 4400;
const LAST_PORT = PORTS[1] ?? FIRST_PORT + 99;
const MAX_RUNNING = Number(process.env.SATGAS_MAX_APPS ?? 6);
export const IDLE_MS = 2 * 60 * 60_000;
const READY_MS = 120_000;
const LOG_LINES = 200;
// What an app's process never gets: Satgas's own sign-in and the keys its agents use.
const HIDDEN_ENV = [
  "SATGAS_TOKEN",
  "SATGAS_TEAM_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "GH_TOKEN",
  "GITHUB_TOKEN",
];

interface Live {
  proc: Subprocess;
  port: number;
  lastHit: number;
  log: string[];
}

// Kept on globalThis so a `bun --hot` reload does not lose track of apps that keep running.
const g = globalThis as typeof globalThis & { __satgasApps?: Map<string, Live> };
g.__satgasApps ??= new Map();
const live = g.__satgasApps;
const keyOf = (runId: string, name: string) => `${runId}/${name}`;

// The watcher waits on a pipe only Satgas writes to, so when Satgas dies in any way, even a crash, the app's group goes too.
const WATCHED = `exec 3<&0; sh -c "$1" </dev/null & app=$!; (trap '' TERM; cat <&3 >/dev/null; kill 0; sleep 3; kill -9 0) >/dev/null 2>&1 & exec 3<&-; wait $app`;

export const cleanAppName = (v: unknown) =>
  typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,23}$/.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null;

export const appPath = (runId: string, name: string) => `/apps/${runId}/${appKey(runId, name)}/${name}/`;

// Where the person opens it: the public address on a server, the dev page or Satgas's own port on a laptop.
export const appUrl = (runId: string, name: string, pageUrl: string) => `${pageUrl}${appPath(runId, name)}`;

export function portOf(runId: string, name: string): number | null {
  return live.get(keyOf(runId, name))?.port ?? null;
}

export function touchApp(runId: string, name: string) {
  const app = live.get(keyOf(runId, name));
  if (app) app.lastHit = Date.now();
}

export function appLog(runId: string, name: string): string[] {
  return live.get(keyOf(runId, name))?.log ?? [];
}

async function freePort(): Promise<number | null> {
  const taken = new Set([...live.values()].map((a) => a.port));
  for (let p = FIRST_PORT; p <= LAST_PORT; p++) {
    if (taken.has(p)) continue;
    try {
      Bun.listen({ hostname: "127.0.0.1", port: p, socket: { data() {} } }).stop(true);
      return p;
    } catch {}
  }
  return null;
}

async function answers(port: number): Promise<boolean> {
  try {
    const socket = await Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {} } });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

function setApp(runId: string, name: string, patch: Partial<RunApp>) {
  const run = getRun(runId);
  const app = run?.apps?.[name];
  if (!run || !app) return;
  patchRun(runId, { apps: { ...run.apps, [name]: { ...app, ...patch } } });
}

// A board's folder, or a folder inside it; never a way out of it.
function folderOf(cwd: string, dir: string): string | null {
  const full = resolve(cwd, dir || ".");
  return full === cwd || full.startsWith(cwd + sep) ? full : null;
}

const tail = (log: string[], n = 12) => log.slice(-n).join("\n").trim();

async function pipe(stream: ReadableStream<Uint8Array> | null | undefined, log: string[]) {
  if (!stream) return;
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of stream) {
    const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
    rest = lines.pop() ?? "";
    for (const l of lines) log.push(l.replace(ANSI, ""));
    if (log.length > LOG_LINES) log.splice(0, log.length - LOG_LINES);
  }
}

export type StartResult = { ok: true; app: RunApp; port: number } | { ok: false; error: string };

// Starts (or restarts) an app and waits until its port answers, so the caller learns whether it really runs.
export async function startApp(runId: string, name: string, command?: string, dir?: string, from?: string): Promise<StartResult> {
  const run = getRun(runId);
  if (!run) return { ok: false, error: "Board not found." };
  const known = run.apps?.[name];
  const cmd = (command ?? known?.command ?? "").trim();
  if (!cmd) return { ok: false, error: "Say the command that starts the app." };
  const folder = folderOf(run.cwd, dir ?? known?.dir ?? ".");
  if (!folder) return { ok: false, error: "The folder must be inside the board's folder." };
  await stopApp(runId, name, false);
  const running = [...live.keys()].length;
  if (running >= MAX_RUNNING)
    return { ok: false, error: `${MAX_RUNNING} apps already run on this Satgas. Stop one first (app_stop, or Stop on its card).` };
  const port = await freePort();
  if (port === null) return { ok: false, error: "No free port is left for apps." };
  const path = appPath(runId, name);
  const app: RunApp = {
    name,
    command: cmd,
    dir: (dir ?? known?.dir ?? ".") || ".",
    status: "starting",
    startedAt: Date.now(),
    path,
    ...(known?.shared ? { shared: true } : {}),
  };
  patchRun(runId, { apps: { ...run.apps, [name]: app } });
  const log: string[] = [];
  const env = childEnv({
    set: {
      PORT: String(port),
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      SATGAS_APP_BASE: path,
      BASE_PATH: path,
      BROWSER: "none",
      FORCE_COLOR: "0",
    },
    unset: HIDDEN_ENV,
  });
  const proc = Bun.spawn(["sh", "-c", WATCHED, "sh", cmd], {
    cwd: folder,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  const entry: Live = { proc, port, lastHit: Date.now(), log };
  live.set(keyOf(runId, name), entry);
  const read = Promise.all([pipe(proc.stdout, log), pipe(proc.stderr, log)]);
  void proc.exited.then(async (code) => {
    proc.stdin.end();
    // What it printed last is the reason it stopped; read all of it before saying so.
    await read.catch(() => {});
    if (live.get(keyOf(runId, name))?.proc !== proc) return;
    live.delete(keyOf(runId, name));
    setApp(runId, name, {
      status: code === 0 ? "stopped" : "failed",
      error: code === 0 ? undefined : tail(log) || `It exited with code ${code}.`,
    });
  });
  const end = Date.now() + READY_MS;
  while (Date.now() < end) {
    if (live.get(keyOf(runId, name))?.proc !== proc) {
      const now = getRun(runId)?.apps?.[name];
      return { ok: false, error: now?.error ?? (tail(log) || "It stopped before it answered.") };
    }
    if (await answers(port)) {
      setApp(runId, name, { status: "running", error: undefined });
      if (from) showApp(runId, name, from);
      return { ok: true, app: { ...app, status: "running" }, port };
    }
    await Bun.sleep(500);
  }
  await stopApp(runId, name, false);
  setApp(runId, name, { status: "failed", error: `It did not answer on its port within two minutes.\n${tail(log)}`.trim() });
  return { ok: false, error: `It did not answer on PORT within two minutes. Last lines it printed:\n${tail(log) || "(nothing)"}` };
}

export async function stopApp(runId: string, name: string, mark = true) {
  const app = live.get(keyOf(runId, name));
  if (mark) setApp(runId, name, { status: "stopped", error: undefined });
  if (!app) return;
  live.delete(keyOf(runId, name));
  for (const sig of ["SIGTERM", "SIGKILL"] as const) {
    try {
      process.kill(-app.proc.pid, sig);
    } catch {}
    if (sig === "SIGTERM") await Promise.race([app.proc.exited, Bun.sleep(3000)]);
  }
}

export function shareApp(runId: string, name: string, shared: boolean) {
  setApp(runId, name, { shared: shared || undefined });
}

// The app's card on the board, put there once, next to the work of the task that started it.
function showApp(runId: string, name: string, from: string) {
  const run = getRun(runId);
  if (!run || run.board?.cards.some((c) => c.kind === "preview" && c.app === name)) return;
  const card: Omit<Card, "x" | "y"> = {
    id: `app-${name}-${Date.now().toString(36)}`,
    kind: "preview",
    app: name,
    title: name,
    from,
    createdAt: Date.now(),
    ...DEFAULT_SIZE.preview,
  };
  const [placed] = placeInFlow(run, { id: from }, [card]);
  if (placed) boardOps(runId, [{ op: "put", card: placed } satisfies BoardOp]);
}

// Apps nobody opened for two hours stop; their cards start them again with one click.
export function sweepIdleApps(now = Date.now()) {
  for (const [key, app] of live) if (now - app.lastHit > IDLE_MS) void stopApp(...(key.split("/") as [string, string]));
}

// On Satgas's own start, nothing from before still runs: what was running shows as stopped. A hot reload keeps its apps.
export function settleApps(ids: string[]) {
  for (const id of ids) {
    const apps = getRun(id)?.apps;
    if (!apps) continue;
    const stale = Object.values(apps).filter((a) => (a.status === "running" || a.status === "starting") && !live.has(keyOf(id, a.name)));
    if (stale.length)
      patchRun(id, { apps: { ...apps, ...Object.fromEntries(stale.map((a) => [a.name, { ...a, status: "stopped" as const }])) } });
  }
}

export async function stopAllApps() {
  await Promise.all([...live.keys()].map((k) => stopApp(...(k.split("/") as [string, string]), false)));
}

// The app's pages run in an opaque origin, so their scripts can never call Satgas's API with the person's sign-in. Such a
// page has no storage of its own, so it gets one in memory and keeps working; it is gone on reload.
const SANDBOX =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock; frame-ancestors 'self'";
const STORAGE_SHIM = `<script>(()=>{const mk=()=>{const m=new Map();return{get length(){return m.size},key:(i)=>[...m.keys()][i]??null,getItem:(k)=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v))},removeItem:(k)=>{m.delete(String(k))},clear:()=>m.clear()}};for(const n of["localStorage","sessionStorage"]){try{window[n].length}catch{try{Object.defineProperty(window,n,{value:mk(),configurable:true})}catch{}}}try{document.cookie}catch{let c="";try{Object.defineProperty(document,"cookie",{get:()=>c,set:(v)=>{c=String(v).split(";")[0]},configurable:true})}catch{}}})();</script>`;

export interface AppSocket {
  kind: "app";
  runId: string;
  name: string;
  target: string;
  protocols: string[];
  upstream?: WebSocket;
  queue: (string | ArrayBuffer)[];
}

const page = (status: number, title: string, line: string, refresh = false) =>
  new Response(
    `<!doctype html><meta charset="utf-8">${refresh ? '<meta http-equiv="refresh" content="2">' : ""}<title>${title}</title><style>body{font:14px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#111;color:#ddd}p{color:#999}</style><div><b>${title}</b><p>${line}</p></div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

const APP_PATH = /^\/apps\/([^/]+)\/([^/]+)\/([a-z0-9-]+)(\/.*)?$/;

// Serves /apps/<board>/<key>/<name>/…: the key opens this one app; its pages need the person signed in, unless they shared
// it. A stopped app starts on the first visit. WebSockets (a dev server's live reload) go through as well.
export async function serveApp(
  req: Request,
  upgrade: (data: AppSocket, headers?: Record<string, string>) => boolean,
  signedIn: boolean,
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const m = APP_PATH.exec(url.pathname);
  if (!m) return new Response("Not found.", { status: 404 });
  const [, runId = "", key = "", name = "", rest] = m;
  if (!validAppKey(runId, name, key)) return new Response("Not found.", { status: 404 });
  const app = getRun(runId)?.apps?.[name];
  if (!app) return new Response("Not found.", { status: 404 });
  if (rest === undefined) return Response.redirect(`${url.pathname}/${url.search}`, 302);
  const dest = req.headers.get("sec-fetch-dest");
  const isPage = dest === "document" || dest === "iframe" || (!dest && (req.headers.get("accept") ?? "").includes("text/html"));
  if (isPage && !signedIn && !app.shared) return page(403, "This app is private", "Ask its owner to share it.");
  let port = portOf(runId, name);
  if (!port) {
    if (app.status !== "starting") void startApp(runId, name);
    return isPage
      ? page(503, `Starting ${name}`, "This takes a few seconds; the page reloads by itself.", true)
      : new Response("Starting.", { status: 503 });
  }
  touchApp(runId, name);
  if ((req.headers.get("upgrade") ?? "").toLowerCase() === "websocket") {
    const protocols = (req.headers.get("sec-websocket-protocol") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const data: AppSocket = {
      kind: "app",
      runId,
      name,
      target: `ws://127.0.0.1:${port}${url.pathname}${url.search}`,
      protocols,
      queue: [],
    };
    const ok = upgrade(data, protocols[0] ? { "sec-websocket-protocol": protocols[0] } : undefined);
    return ok ? undefined : new Response("WebSocket upgrade failed.", { status: 400 });
  }
  const headers = new Headers(req.headers);
  for (const h of ["host", "connection", "upgrade", "content-length"]) headers.delete(h);
  // The person's Satgas sign-in never reaches the app.
  const cookie = (headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith(`${COOKIE}=`))
    .join("; ");
  if (cookie) headers.set("cookie", cookie);
  else headers.delete("cookie");
  headers.set("accept-encoding", "identity");
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  port = portOf(runId, name) ?? port;
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
      // @ts-expect-error Bun streams a request body through without buffering it.
      duplex: "half",
    });
  } catch {
    return isPage
      ? page(502, `${name} is not answering`, "It may still be starting, or it stopped. Open its card to see why.", true)
      : new Response("Not answering.", { status: 502 });
  }
  const out = new Headers(res.headers);
  out.delete("content-encoding");
  const location = out.get("location");
  if (location?.startsWith(`http://127.0.0.1:${port}`)) out.set("location", location.slice(`http://127.0.0.1:${port}`.length) || "/");
  // The page runs sandboxed, in an opaque origin, so its module scripts and fetches arrive with Origin: null and are
  // refused unless allowed here. They carry no credentials, and the key in the path already gates them.
  if (req.headers.get("origin") === "null") out.set("access-control-allow-origin", "*");
  if (!(out.get("content-type") ?? "").includes("text/html")) return new Response(res.body, { status: res.status, headers: out });
  out.set("content-security-policy", SANDBOX);
  out.delete("content-length");
  const html = await res.text();
  const at = html.search(/<head[^>]*>/i);
  const end = at < 0 ? 0 : at + (html.slice(at).match(/<head[^>]*>/i)?.[0].length ?? 0);
  return new Response(html.slice(0, end) + STORAGE_SHIM + html.slice(end), { status: res.status, headers: out });
}

// The socket between the person's page and the app's own, both ways, holding what arrives before the app's end opens.
export const appSocket = {
  open(ws: { data: AppSocket; send: (m: string | ArrayBuffer | Uint8Array) => void; close: () => void }) {
    const s = ws.data;
    const up = new WebSocket(s.target, s.protocols.length ? s.protocols : undefined);
    up.binaryType = "arraybuffer";
    s.upstream = up;
    up.onopen = () => {
      for (const m of s.queue.splice(0)) up.send(m);
    };
    up.onmessage = (e) => ws.send(e.data as string | ArrayBuffer);
    up.onclose = () => ws.close();
    up.onerror = () => ws.close();
  },
  message(ws: { data: AppSocket }, raw: string | Buffer) {
    const s = ws.data;
    touchApp(s.runId, s.name);
    const msg = typeof raw === "string" ? raw : (raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
    if (s.upstream?.readyState === WebSocket.OPEN) s.upstream.send(msg);
    else s.queue.push(msg);
  },
  close(ws: { data: AppSocket }) {
    ws.data.upstream?.close();
  },
};
