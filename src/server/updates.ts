import { chmod, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import pkg from "../../package.json";
import {
  assetName,
  type CheckState,
  checksumFor,
  cleanVersion,
  type InstallMode,
  isNewer,
  RESTART_CODE,
  type UpdateInfo,
  type UpdateStage,
} from "../shared/updates";
import { config } from "./config";
import { getSettings } from "./settings";

const TTL = 6 * 60 * 60 * 1000;
// Offline or rate limited: try again sooner than a success would.
const RETRY = 15 * 60 * 1000;
const HEADERS = { accept: "application/vnd.github+json", "user-agent": "satgas" };

interface Asset {
  name: string;
  browser_download_url: string;
}
interface Check {
  at: number;
  check: CheckState;
  latest: string | null;
  notes: string;
  url: string | null;
  assets: Asset[];
}

const compiled = import.meta.dir.includes("$bunfs") || import.meta.dir.includes("~BUN");

export function installMode(): InstallMode {
  if (process.env.SATGAS_CONTAINER === "1") return "container";
  return compiled ? "binary" : "source";
}

let cache: Check | undefined;
let inflight: Promise<Check> | undefined;
let stage: UpdateStage = "idle";
let progress: number | null = null;
let error: string | null = null;

async function fetchRelease(): Promise<Check> {
  const blank = { at: Date.now(), latest: null, notes: "", url: null, assets: [] };
  try {
    const res = await fetch(`${config.updateApi}/repos/${config.repo}/releases/latest`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { ...blank, check: "none" };
    if (!res.ok) return { ...blank, check: "failed" };
    const data = (await res.json()) as { tag_name?: unknown; body?: unknown; html_url?: unknown; assets?: unknown };
    const latest = cleanVersion(data.tag_name);
    if (!latest) return { ...blank, check: "none" };
    return {
      ...blank,
      check: "ok",
      latest,
      notes: typeof data.body === "string" ? data.body.slice(0, 20_000) : "",
      url: typeof data.html_url === "string" ? data.html_url : null,
      assets: Array.isArray(data.assets) ? (data.assets as Asset[]) : [],
    };
  } catch {
    return { ...blank, check: "failed" };
  }
}

function release(force: boolean): Promise<Check> {
  if (!force && cache && Date.now() - cache.at < (cache.check === "failed" ? RETRY : TTL)) return Promise.resolve(cache);
  inflight ??= fetchRelease()
    .then((c) => {
      cache = c;
      return c;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

// Asks GitHub only when the person allows it or presses Check; otherwise it reports what it already knows.
export async function updateInfo({ force = false, busy = false }: { force?: boolean; busy?: boolean } = {}): Promise<UpdateInfo> {
  const c = force || getSettings().checkUpdates ? await release(force) : cache;
  const latest = c?.latest ?? null;
  return {
    current: pkg.version,
    latest,
    available: !!latest && isNewer(latest, pkg.version),
    notes: c?.notes ?? "",
    url: c?.url ?? null,
    check: c?.check ?? "off",
    checkedAt: c?.at ?? null,
    mode: installMode(),
    busy,
    stage,
    progress,
    error,
  };
}

// Release files only ever come from GitHub, or from the address someone pointed SATGAS_UPDATE_API at.
function trusted(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.origin === new URL(config.updateApi).origin) return true;
    return u.protocol === "https:" && u.hostname === "github.com";
  } catch {
    return false;
  }
}

function assetUrl(c: Check, name: string): string {
  const url = c.assets.find((a) => a?.name === name)?.browser_download_url;
  if (typeof url !== "string" || !trusted(url)) throw new Error(`This release has no \`${name}\` file.`);
  return url;
}

async function download(url: string, dest: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "satgas" } });
  if (!res.ok || !res.body) throw new Error(`The download failed with status ${res.status}.`);
  const total = Number(res.headers.get("content-length")) || 0;
  const hasher = new Bun.CryptoHasher("sha256");
  const sink = Bun.file(dest).writer();
  let got = 0;
  for await (const chunk of res.body) {
    hasher.update(chunk);
    sink.write(chunk);
    got += chunk.length;
    progress = total ? Math.min(1, got / total) : null;
  }
  await sink.end();
  return hasher.digest("hex");
}

// A binary for the wrong machine or a broken download fails here, while the running version is still untouched.
async function reportsVersion(file: string, version: string): Promise<boolean> {
  const proc = Bun.spawn([file, "--version"], { stdout: "pipe", stderr: "ignore", stdin: "ignore", timeout: 15_000 });
  const out = await new Response(proc.stdout).text();
  return (await proc.exited) === 0 && out.trim() === version;
}

// The new binary starts once this process has gone, so it can take the port.
function respawnAfterExit() {
  const script = 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; shift; exec "$@"';
  const proc = Bun.spawn(["sh", "-c", script, "sh", String(process.pid), process.execPath, ...process.argv.slice(2)], {
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    detached: true,
  });
  proc.unref();
}

async function apply(restart: (code: number) => void) {
  const mode = installMode();
  const c = await release(true);
  const latest = c.latest;
  const name = assetName(process.platform, process.arch);
  if (!latest || !isNewer(latest, pkg.version)) throw new Error("There is no newer version to install.");
  if (!name) throw new Error(`There is no release for ${process.platform} ${process.arch}.`);

  const checksumsRes = await fetch(assetUrl(c, "checksums.txt"), { headers: { "user-agent": "satgas" } });
  if (!checksumsRes.ok) throw new Error("The release's checksums could not be read.");
  const expected = checksumFor(await checksumsRes.text(), name);
  if (!expected) throw new Error(`The release's checksums do not cover \`${name}\`.`);

  // Next to where it ends up, so the final rename is atomic.
  const dir = mode === "container" ? join(config.dataDir, "update") : dirname(process.execPath);
  const tmp = join(dir, `.satgas-${latest}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    stage = "downloading";
    const hash = await download(assetUrl(c, name), tmp);
    stage = "verifying";
    progress = null;
    if (hash !== expected) throw new Error("The download does not match the release's checksum.");
    await chmod(tmp, 0o755);
    if (!(await reportsVersion(tmp, latest))) throw new Error(`The downloaded file does not run as version ${latest}.`);
    if (mode === "container") {
      await rename(tmp, join(dir, "satgas"));
    } else {
      await rename(process.execPath, `${process.execPath}.prev`);
      await rename(tmp, process.execPath);
      respawnAfterExit();
    }
  } catch (e) {
    await rm(tmp, { force: true });
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM" || code === "EROFS")
      throw new Error(`Satgas cannot write to \`${dir}\`, so it cannot update itself.`);
    throw e;
  }
  stage = "restarting";
  restart(mode === "container" ? RESTART_CODE : 0);
}

// Returns why it cannot start, or null once it is under way; the page follows it through updateInfo.
export function startUpdate(busy: boolean, restart: (code: number) => void): string | null {
  if (installMode() === "source") return "This copy runs from source, so update it with `git pull`.";
  if (stage !== "idle") return "An update is already running.";
  if (busy) return "Agents are working. Update when they finish.";
  stage = "downloading";
  progress = null;
  error = null;
  void apply(restart).catch((e) => {
    stage = "idle";
    progress = null;
    error = (e as Error).message;
  });
  return null;
}

// For tests: forget what earlier checks found.
export function resetUpdates() {
  cache = undefined;
  inflight = undefined;
  stage = "idle";
  progress = null;
  error = null;
}
