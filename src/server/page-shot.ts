import { lookup } from "node:dns/promises";
import { mkdir, readFile, rm } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import { DEVICE_SIZE, type Device, isFixed } from "../shared/board";
import { portOf } from "./apps";
import { config } from "./config";
import { getRun } from "./store";
import { exec, scrollThrough } from "./visual-check";

// Pictures of pages taken by the same browser the agents check their work with: a frame exported at the size it is made
// for, and a site someone wants to start from. One picture at a time, so two exports never share the browser.

export type Shot = { ok: true; png: ArrayBuffer } | { ok: false; error: string };

let queue: Promise<unknown> = Promise.resolve();
const NO_BROWSER = "Pictures need agent-browser, which the Satgas image includes. Install it with: npm i -g agent-browser";

async function shoot(url: string, w: number, h: number, full: boolean): Promise<Shot> {
  const dir = join(config.dataDir, "shots");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${crypto.randomUUID()}.png`);
  const session = `satgas-shot-${crypto.randomUUID().slice(0, 8)}`;
  const ab = (...args: string[]) => exec(["agent-browser", "--session", session, ...args], dir).catch(() => ({ code: 127, out: "" }));
  try {
    if ((await ab("set", "viewport", String(w), String(h))).code === 127) return { ok: false, error: NO_BROWSER };
    if ((await ab("open", url)).code !== 0) return { ok: false, error: "The page did not open." };
    await ab("wait", "1500");
    if (full) await scrollThrough(ab, h);
    if ((await ab("screenshot", ...(full ? ["--full"] : []), file)).code !== 0) return { ok: false, error: "The picture failed." };
    const bytes = await readFile(file);
    return { ok: true, png: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
  } finally {
    await ab("close");
    await rm(file, { force: true });
  }
}

const serial = <T>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
};

// One page of a board's app at its device's real size: a post, a story or a slide exactly, a page or an email whole.
export function shootFrame(runId: string, name: string, route: string, device: Device): Promise<Shot> {
  const run = getRun(runId);
  const app = run?.apps?.[name];
  const port = portOf(runId, name);
  if (app?.status !== "running" || !port) return Promise.resolve({ ok: false, error: "Start the app first." });
  const { w, h } = DEVICE_SIZE[device];
  const url = `http://127.0.0.1:${port}${app.path}${route.replace(/^\//, "")}`;
  return serial(() => shoot(url, w, h, !isFixed(device)));
}

// Addresses that stay inside: this machine, its network, and the cloud's metadata service.
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    // An IPv4 address written as IPv6, which URL spells in hex: ::ffff:7f00:1 is 127.0.0.1.
    if (v.startsWith("::ffff:")) {
      const rest = v.slice(7);
      if (isIP(rest) === 4) return privateAddress(rest);
      const [hi = 0, lo = 0] = rest.split(":").map((x) => Number.parseInt(x, 16));
      return privateAddress([hi >> 8, hi & 255, lo >> 8, lo & 255].join("."));
    }
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

// A public web address someone pasted, or why it cannot be used.
export async function publicUrl(raw: string): Promise<URL | string> {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return "That is not a web address.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Only http and https addresses.";
  if (url.username || url.password) return "Leave the sign-in out of the address.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !isIP(host)) return "Use the site's public address.";
  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true }).then(
        (r) => r.map((x) => x.address),
        () => [],
      );
  if (!addresses.length) return "That site could not be found.";
  if (addresses.some(privateAddress)) return "Only public sites can be imported.";
  return url;
}

// A public site as a person first sees it on a laptop, whole, to start a design from.
export async function shootSite(raw: string): Promise<Shot & { url?: string }> {
  const url = await publicUrl(raw);
  if (typeof url === "string") return { ok: false, error: url };
  const shot = await serial(() => shoot(url.href, 1440, 900, true));
  return { ...shot, url: url.href };
}
