import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appPath,
  cleanAppName,
  filesOutsideBase,
  screensOf,
  serveApp,
  settleApps,
  shareApp,
  showScreens,
  startApp,
  stopAllApps,
  stopApp,
} from "../../src/server/apps";
import { loadToken } from "../../src/server/auth";
import { config } from "../../src/server/config";
import { createRun, flushAll, getRun, patchRun } from "../../src/server/store";

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

test("a sandboxed page's requests do not reach the app as cross-site, or dev servers refuse them", async () => {
  const echo = `bun -e 'Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch(req) { return Response.json({ site: req.headers.get("sec-fetch-site"), mode: req.headers.get("sec-fetch-mode"), origin: req.headers.get("origin") }); } })'`;
  expect((await startApp(runId, "echo", echo)).ok).toBe(true);
  const res = await serveApp(
    get(`${appPath(runId, "echo")}a.jpg`, {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-dest": "image",
      origin: "null",
    }),
    noUpgrade,
    false,
  );
  expect(await res?.json()).toEqual({ site: null, mode: null, origin: null });
  await stopApp(runId, "echo");
});

test("names the files a page loads from outside the base, which the person's browser never gets", async () => {
  const page = (body: string) =>
    `bun -e 'Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch() { return new Response(\`${body}\`, { headers: { "content-type": "text/html" } }); } })'`;
  const base = appPath(runId, "pages");
  const broken = `<script src="/@vite/client"></script><link href="/src/a.css" rel="stylesheet"><img src="${base}ok.jpg"><script src="//cdn.test/x.js"></script><a href="/about">x</a>`;
  expect((await startApp(runId, "pages", page(broken))).ok).toBe(true);
  expect(await filesOutsideBase(runId, "pages")).toEqual(["/@vite/client", "/src/a.css"]);
  expect((await startApp(runId, "pages", page(`<script src="${base}a.js"></script>`))).ok).toBe(true);
  expect(await filesOutsideBase(runId, "pages")).toEqual([]);
  await stopApp(runId, "pages");
});

test("a command that exits fails with what it printed", async () => {
  const r = await startApp(runId, "broken", "echo 'missing script dev' && exit 1");
  expect(r.ok).toBe(false);
  expect(r.ok ? "" : r.error).toContain("missing script dev");
  expect(getRun(runId)?.apps?.broken?.status).toBe("failed");
});

test("settling marks only apps from before as stopped, so a hot reload keeps the ones still running", async () => {
  const apps = getRun(runId)?.apps ?? {};
  const before = { name: "before", command: "x", dir: ".", status: "running" as const, startedAt: 1, path: "/x" };
  patchRun(runId, { apps: { ...apps, before } });
  expect(getRun(runId)?.apps?.game?.status).toBe("running");
  settleApps([runId]);
  expect(getRun(runId)?.apps?.before?.status).toBe("stopped");
  expect(getRun(runId)?.apps?.game?.status).toBe("running");
});

test("an app stops with Satgas, even when Satgas is killed outright", async () => {
  const cwd = join(dir, "workspaces", "host");
  await mkdir(cwd, { recursive: true });
  const host = Bun.spawn(["bun", join(import.meta.dir, "../fixtures/app-host.ts"), SERVER, cwd], {
    env: { ...process.env, SATGAS_DATA_DIR: join(dir, "host-data") },
    stdout: "pipe",
    stderr: "ignore",
  });
  const { value } = await host.stdout.getReader().read();
  const port = Number(new TextDecoder().decode(value).trim());
  expect(port).toBeGreaterThan(0);
  const answers = () =>
    fetch(`http://127.0.0.1:${port}/`).then(
      () => true,
      () => false,
    );
  expect(await answers()).toBe(true);
  Bun.gc(true);
  await Bun.sleep(500);
  expect(await answers()).toBe(true);
  host.kill(9);
  let alive = true;
  for (let i = 0; i < 40 && alive; i++) {
    await Bun.sleep(250);
    alive = await answers();
  }
  expect(alive).toBe(false);
}, 30_000);

test("an app that exits by itself still reports its own exit code", async () => {
  const r = await startApp(runId, "short", `${SERVER} & pid=$!; sleep 1; kill $pid; exit 3`);
  expect(r.ok).toBe(true);
  for (let i = 0; i < 40 && getRun(runId)?.apps?.short?.status === "running"; i++) await Bun.sleep(250);
  expect(getRun(runId)?.apps?.short?.status).toBe("failed");
  expect(getRun(runId)?.apps?.short?.error).toContain("code 3");
}, 30_000);

// The board shows an app the way a design file shows screens: one frame per listed page, and the first once at phone width.
test("every page the app lists gets its own frame in one row, and a page added later joins the end", async () => {
  const cwd = join(dir, "workspaces", "screens");
  await mkdir(join(cwd, ".satgas"), { recursive: true });
  await Bun.write(
    join(cwd, ".satgas/screens.json"),
    JSON.stringify([
      { route: "/", name: "Beranda" },
      { route: "booking", name: "Booking" },
    ]),
  );
  const id = createRun("bikin web booking", cwd).id;
  expect((await startApp(id, "web", SERVER, ".", "t1")).ok).toBe(true);
  const frames = () => (getRun(id)?.board?.cards ?? []).filter((c) => c.app === "web");
  expect(frames().map((c) => [c.title, c.route ?? "/", c.device ?? "desktop"])).toEqual([
    ["Beranda", "/", "phone"],
    ["Beranda", "/", "desktop"],
    ["Booking", "/booking", "desktop"],
  ]);
  const [phone, home, booking] = frames();
  expect(new Set(frames().map((c) => c.y)).size).toBe(1);
  expect(home && phone && home.x).toBeGreaterThan((phone?.x ?? 0) + (phone?.w ?? 0));
  expect(booking && home && booking.x).toBeGreaterThan((home?.x ?? 0) + (home?.w ?? 0));
  // The page carries the bridge that lets its frame follow it and pick elements.
  const html = (await (await serveApp(get(appPath(id, "web"), { "sec-fetch-dest": "document" }), noUpgrade, true))?.text()) ?? "";
  expect(html).toContain("__satgas");
  // Opened on its own, the page offers a way back to its board; inside a frame it does not.
  expect(html).toContain("satgas-badge");
  // The bridge is added on the way out, so the page is never cached or revalidated against the app's own copy.
  const again = await serveApp(get(appPath(id, "web"), { "sec-fetch-dest": "document", "if-none-match": 'W/"old"' }), noUpgrade, true);
  expect(again?.status).toBe(200);
  expect(again?.headers.get("cache-control")).toBe("no-store");
  expect(again?.headers.get("etag")).toBeNull();

  await Bun.write(
    join(cwd, ".satgas/screens.json"),
    JSON.stringify([
      { route: "/", name: "Beranda" },
      { route: "/booking", name: "Booking" },
      { route: "/admin", name: "Admin" },
    ]),
  );
  await showScreens(id, "web", "t2");
  expect(frames().map((c) => c.title)).toEqual(["Beranda", "Beranda", "Booking", "Admin"]);
  const admin = frames()[3];
  expect(admin?.x).toBeGreaterThan((booking?.x ?? 0) + (booking?.w ?? 0));
  await stopApp(id, "web");
});

// A phone app is never stretched to desktop width: every page it lists is a phone frame.
test("a phone app's pages are all phone frames, with no desktop copy", async () => {
  const cwd = join(dir, "workspaces", "phone-screens");
  await mkdir(join(cwd, ".satgas"), { recursive: true });
  await Bun.write(
    join(cwd, ".satgas/screens.json"),
    JSON.stringify({
      device: "phone",
      screens: [
        { route: "/", name: "Hari ini", target: "design/refs/ref-01/part-1.jpg" },
        { route: "/latihan", name: "Latihan", target: "../secret.png" },
      ],
    }),
  );
  const id = createRun("bikin app olahraga", cwd).id;
  expect((await startApp(id, "web", SERVER, ".", "t1")).ok).toBe(true);
  const frames = () => (getRun(id)?.board?.cards ?? []).filter((c) => c.app === "web");
  expect(frames().map((c) => [c.title, c.route ?? "/", c.device ?? "desktop"])).toEqual([
    ["Hari ini", "/", "phone"],
    ["Latihan", "/latihan", "phone"],
  ]);
  await showScreens(id, "web", "t2");
  expect(frames()).toHaveLength(2);
  // A page names the picture it was cloned from, and only a picture inside design/ counts.
  expect((await screensOf(id, "web")).map((s) => s.target)).toEqual(["design/refs/ref-01/part-1.jpg", undefined]);
  await stopApp(id, "web");
});
