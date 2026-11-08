import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appPath, cleanAppName, serveApp, settleApps, shareApp, startApp, stopAllApps, stopApp } from "../../src/server/apps";
import { loadToken } from "../../src/server/auth";
import { config } from "../../src/server/config";
import { createRun, flushAll, getRun } from "../../src/server/store";

const original = config.dataDir;
let dir = "";
let runId = "";

// A tiny server that does what app_start asks of an app: listen on PORT at 127.0.0.1, under SATGAS_APP_BASE.
const SERVER = `bun -e 'Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch(req) { const p = new URL(req.url).pathname; if (!p.startsWith(process.env.SATGAS_APP_BASE)) return new Response("outside the base", { status: 404 }); return new Response(p.endsWith(".js") ? "console.log(1)" : "<html><head><title>t</title></head><body>hello " + (req.headers.get("cookie") ?? "no cookie") + "</body></html>", { headers: { "content-type": p.endsWith(".js") ? "text/javascript" : "text/html" } }); } })'`;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-apps-"));
  await mkdir(join(dir, "runs"), { recursive: true });
  config.dataDir = dir;
  await loadToken();
  const cwd = join(dir, "workspaces", "w");
  await mkdir(cwd, { recursive: true });
  runId = createRun("make a game", cwd).id;
});
afterAll(async () => {
  await stopAllApps();
  await flushAll();
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

const noUpgrade = () => false;
const get = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost:4317${path}`, { headers });

test("names are short, lowercase and safe in a path", () => {
  expect(cleanAppName("Web")).toBe("web");
  expect(cleanAppName("my-game2")).toBe("my-game2");
  expect(cleanAppName("../x")).toBeNull();
  expect(cleanAppName("a".repeat(30))).toBeNull();
});

test("an app starts, answers under its base, and the person's page gets it sandboxed without their Satgas sign-in", async () => {
  const r = await startApp(runId, "game", SERVER);
  expect(r.ok).toBe(true);
  expect(getRun(runId)?.apps?.game).toMatchObject({ status: "running", path: appPath(runId, "game") });
  const res = await serveApp(
    get(appPath(runId, "game"), { "sec-fetch-dest": "document", cookie: "satgas_token=secret; theme=dark" }),
    noUpgrade,
    true,
  );
  expect(res?.status).toBe(200);
  expect(res?.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
  const html = (await res?.text()) ?? "";
  expect(html).toContain("<head><script>");
  expect(html).toContain("hello theme=dark");
  expect(html).not.toContain("secret");
});

test("a page needs the person signed in until they share it, and the key opens only this app", async () => {
  const page = { "sec-fetch-dest": "document" };
  expect((await serveApp(get(appPath(runId, "game"), page), noUpgrade, false))?.status).toBe(403);
  // What the page loads needs only the key, since a sandboxed page cannot send the sign-in.
  expect((await serveApp(get(`${appPath(runId, "game")}main.js`, { "sec-fetch-dest": "script" }), noUpgrade, false))?.status).toBe(200);
  shareApp(runId, "game", true);
  expect((await serveApp(get(appPath(runId, "game"), page), noUpgrade, false))?.status).toBe(200);
  const wrong = appPath(runId, "game").replace(/\/apps\/[^/]+\/[^/]+\//, `/apps/${runId}/not-the-key/`);
  expect((await serveApp(get(wrong, page), noUpgrade, true))?.status).toBe(404);
});

// A sandboxed page loads its module scripts from an opaque origin; without this the browser refuses them and the card
// stays blank even though every request answers 200.
test("the sandboxed page may load its own scripts, and nothing else gets the opening", async () => {
  const asset = `${appPath(runId, "game")}main.js`;
  const fromPage = await serveApp(get(asset, { "sec-fetch-dest": "script", origin: "null" }), noUpgrade, false);
  expect(fromPage?.status).toBe(200);
  expect(fromPage?.headers.get("access-control-allow-origin")).toBe("*");
  const fromElsewhere = await serveApp(get(asset, { "sec-fetch-dest": "script", origin: "https://evil.example" }), noUpgrade, false);
  expect(fromElsewhere?.headers.get("access-control-allow-origin")).toBeNull();
});

test("a stopped app shows as stopped, and a visit starts it again", async () => {
  await stopApp(runId, "game");
  expect(getRun(runId)?.apps?.game?.status).toBe("stopped");
  const res = await serveApp(get(appPath(runId, "game"), { "sec-fetch-dest": "document" }), noUpgrade, true);
  expect(res?.status).toBe(503);
  for (let i = 0; i < 40 && getRun(runId)?.apps?.game?.status !== "running"; i++) await Bun.sleep(250);
  expect(getRun(runId)?.apps?.game?.status).toBe("running");
});

test("a command that exits fails with what it printed, and a restart of Satgas leaves nothing marked running", async () => {
  const r = await startApp(runId, "broken", "echo 'missing script dev' && exit 1");
  expect(r.ok).toBe(false);
  expect(r.ok ? "" : r.error).toContain("missing script dev");
  expect(getRun(runId)?.apps?.broken?.status).toBe("failed");
  settleApps([runId]);
  expect(getRun(runId)?.apps?.game?.status).toBe("stopped");
});
