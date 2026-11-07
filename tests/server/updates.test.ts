import { afterAll, afterEach, beforeAll, beforeEach, expect, setSystemTime, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json";
import { config } from "../../src/server/config";
import { defaultSettings } from "../../src/server/settings";
import { resetUpdates, startUpdate, updateInfo } from "../../src/server/updates";
import type { Settings } from "../../src/shared/settings";
import { assetName } from "../../src/shared/updates";

const g = globalThis as { __satgasSettings?: Settings };
const original = { api: config.updateApi, dir: config.dataDir, settings: g.__satgasSettings };
const NEXT = "99.0.0";
const asset = assetName(process.platform, process.arch) as string;
const script = `#!/bin/sh\necho ${NEXT}\n`;
const sum = new Bun.CryptoHasher("sha256").update(script).digest("hex");

let dir: string;
let hits = 0;
let status = 200;
let checksums = `${sum}  ${asset}\n`;
let binary = script;
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      const base = `http://localhost:${server.port}`;
      if (path.endsWith("/releases/latest")) {
        hits++;
        if (status !== 200) return new Response("no", { status });
        return Response.json({
          tag_name: `v${NEXT}`,
          body: "## Notes",
          html_url: `${base}/notes`,
          assets: [
            { name: asset, browser_download_url: `${base}/${asset}` },
            { name: "checksums.txt", browser_download_url: `${base}/checksums.txt` },
          ],
        });
      }
      if (path === "/checksums.txt") return new Response(checksums);
      if (path === `/${asset}`) return new Response(binary);
      return new Response("missing", { status: 404 });
    },
  });
  config.updateApi = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  config.updateApi = original.api;
  config.dataDir = original.dir;
  g.__satgasSettings = original.settings;
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-update-"));
  config.dataDir = dir;
  g.__satgasSettings = defaultSettings();
  hits = 0;
  status = 200;
  checksums = `${sum}  ${asset}\n`;
  binary = script;
  process.env.SATGAS_CONTAINER = "1";
  resetUpdates();
});

afterEach(async () => {
  setSystemTime();
  delete process.env.SATGAS_CONTAINER;
  await rm(dir, { recursive: true, force: true });
});

const settled = async () => {
  for (let i = 0; i < 400; i++) {
    const info = await updateInfo();
    if (info.stage === "idle" || info.stage === "restarting") return info;
    await Bun.sleep(10);
  }
  throw new Error("timed out");
};

test("reports a newer release with its notes, and asks GitHub once while the answer is fresh", async () => {
  const info = await updateInfo();
  expect(info).toMatchObject({ current: pkg.version, latest: NEXT, available: true, notes: "## Notes", check: "ok" });
  await updateInfo();
  expect(hits).toBe(1);
  await updateInfo({ force: true });
  expect(hits).toBe(2);
});

test("asks GitHub again once the answer is 15 minutes old", async () => {
  const start = Date.now();
  await updateInfo();
  setSystemTime(new Date(start + 14 * 60_000));
  await updateInfo();
  expect(hits).toBe(1);
  setSystemTime(new Date(start + 15 * 60_000));
  await updateInfo();
  expect(hits).toBe(2);
});

test("a failed check keeps the release it already found, and tries again on the same interval", async () => {
  const start = Date.now();
  await updateInfo();
  status = 403;
  expect(await updateInfo({ force: true })).toMatchObject({ check: "failed", latest: NEXT, available: true, notes: "## Notes" });
  expect(hits).toBe(2);
  status = 200;
  await updateInfo();
  expect(hits).toBe(2);
  setSystemTime(new Date(start + 15 * 60_000));
  expect(await updateInfo()).toMatchObject({ check: "ok", latest: NEXT });
  expect(hits).toBe(3);
});

test("a repo with no release yet is not an error, and an outage is not mistaken for up to date", async () => {
  status = 404;
  expect(await updateInfo()).toMatchObject({ check: "none", available: false });
  resetUpdates();
  status = 500;
  expect(await updateInfo()).toMatchObject({ check: "failed", available: false });
});

test("never asks GitHub on its own when checks are off, but a person can still ask", async () => {
  (g.__satgasSettings as Settings).checkUpdates = false;
  expect(await updateInfo()).toMatchObject({ check: "off", available: false });
  expect(hits).toBe(0);
  expect(await updateInfo({ force: true })).toMatchObject({ available: true });
  expect(hits).toBe(1);
});

test("a container keeps the verified binary in its data volume, then asks to be restarted", async () => {
  const codes: number[] = [];
  expect(startUpdate(false, (c) => codes.push(c))).toBeNull();
  expect((await settled()).error).toBeNull();
  expect(codes).toEqual([75]);
  const file = join(dir, "update", "satgas");
  expect(await Bun.file(file).text()).toBe(script);
  expect((await stat(file)).mode & 0o111).toBeTruthy();
});

test("a download that does not match the checksum is thrown away and nothing restarts", async () => {
  checksums = `${"0".repeat(64)}  ${asset}\n`;
  const codes: number[] = [];
  startUpdate(false, (c) => codes.push(c));
  expect((await settled()).error).toContain("checksum");
  expect(codes).toEqual([]);
  expect(await Bun.file(join(dir, "update", "satgas")).exists()).toBe(false);
  expect(await Bun.file(join(dir, "update", `.satgas-${NEXT}.tmp`)).exists()).toBe(false);
});

test("a binary that does not run as the new version is refused", async () => {
  const other = "#!/bin/sh\necho 1.0.0\n";
  binary = other;
  checksums = `${new Bun.CryptoHasher("sha256").update(other).digest("hex")}  ${asset}\n`;
  const codes: number[] = [];
  startUpdate(false, (c) => codes.push(c));
  expect((await settled()).error).toContain("does not run");
  expect(codes).toEqual([]);
});

test("waits for running agents, and leaves a copy run from source to git", () => {
  expect(startUpdate(true, () => {})).toContain("Agents are working");
  delete process.env.SATGAS_CONTAINER;
  expect(startUpdate(false, () => {})).toContain("git pull");
});
