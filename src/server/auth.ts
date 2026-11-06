import { createHmac, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

// A browser signs in once (pasting the token or opening the sign-in link) and keeps this cookie.
export const COOKIE = "satgas_token";
// Scripts and the CLI can send the token in this header instead of a cookie.
export const HEADER = "x-satgas-token";
const YEAR = 60 * 60 * 24 * 365;
// A user-chosen SATGAS_TOKEN may be guessable, so failed sign-ins are capped per minute for everyone.
const MAX_FAILURES = 10;
const WINDOW_MS = 60_000;

let token = "";
let failures: number[] = [];

const file = () => join(config.dataDir, "token");

// SATGAS_TOKEN wins; otherwise a random token lives in a 0600 file, so restarts keep cookies valid and other accounts can't read it.
export async function loadToken(): Promise<{ token: string; fromEnv: boolean }> {
  if (config.token) {
    token = config.token;
    return { token, fromEnv: true };
  }
  const saved = await readFile(file(), "utf8").then(
    (s) => s.trim(),
    () => "",
  );
  if (/^[A-Za-z0-9_-]{32,128}$/.test(saved)) token = saved;
  else {
    token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    await writeFile(file(), token, { mode: 0o600 });
  }
  await chmod(file(), 0o600).catch(() => {});
  return { token, fromEnv: false };
}

// Every other browser and script has to sign in again. A SATGAS_TOKEN belongs to whoever set it, so it stays.
export async function rotateToken(): Promise<string | null> {
  if (config.token) return null;
  const next = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  await writeFile(file(), next, { mode: 0o600 });
  token = next;
  failures = [];
  return next;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function authorized(req: Request): boolean {
  const presented = req.headers.get(HEADER) ?? readCookie(req, COOKIE) ?? "";
  return !!token && same(presented, token);
}

export type SignIn = "ok" | "wrong" | "limited";

export function signIn(candidate: string, now = Date.now()): SignIn {
  failures = failures.filter((t) => now - t < WINDOW_MS);
  if (failures.length >= MAX_FAILURES) return "limited";
  if (token && same(candidate, token)) return "ok";
  failures.push(now);
  return "wrong";
}

// Sandboxed previews can't carry the cookie, so a board's file URLs carry this key instead; it only opens that board's files.
export const fileKey = (runId: string) => createHmac("sha256", token).update(`files:${runId}`).digest("base64url").slice(0, 22);

export const validFileKey = (runId: string, key: string) => !!token && same(key, fileKey(runId));

const secure = () => (config.publicUrl?.startsWith("https://") ? "; Secure" : "");

// HttpOnly so page scripts (and anything injected into them) never see it; Strict so other sites can't ride on it.
export const signInCookie = () => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${YEAR}${secure()}`;
export const signOutCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure()}`;

export const signInLink = (origin: string) => `${origin}/api/auth?token=${encodeURIComponent(token)}`;

// Only for tests: start the failure window over.
export const resetFailures = () => {
  failures = [];
};
