import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authorized,
  COOKIE,
  fileKey,
  HEADER,
  loadToken,
  readCookie,
  resetFailures,
  rotateToken,
  signIn,
  signInCookie,
  validFileKey,
} from "../../src/server/auth";
import { config } from "../../src/server/config";

let dir = "";
const original = { dataDir: config.dataDir, token: config.token, publicUrl: config.publicUrl };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-auth-"));
  config.dataDir = dir;
  config.token = null;
});

afterAll(async () => {
  Object.assign(config, original);
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => resetFailures());

const req = (headers: Record<string, string>) => new Request("http://localhost/api/runs", { headers });

describe("token", () => {
  test("is generated once, kept in an owner-only file and reused after a restart", async () => {
    const first = await loadToken();
    expect(first.fromEnv).toBe(false);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await readFile(join(dir, "token"), "utf8")).trim()).toBe(first.token);
    expect((await stat(join(dir, "token"))).mode & 0o777).toBe(0o600);
    expect((await loadToken()).token).toBe(first.token);
  });

  test("SATGAS_TOKEN wins over the file", async () => {
    config.token = "server-chosen-token-value";
    expect(await loadToken()).toEqual({ token: "server-chosen-token-value", fromEnv: true });
    config.token = null;
    await loadToken();
  });
});

describe("requests", () => {
  test("are authorized by the cookie or the header, and nothing else", async () => {
    const { token } = await loadToken();
    expect(authorized(req({ cookie: `other=1; ${COOKIE}=${token}` }))).toBe(true);
    expect(authorized(req({ [HEADER]: token }))).toBe(true);
    expect(authorized(req({ cookie: `${COOKIE}=${token}x` }))).toBe(false);
    expect(authorized(req({}))).toBe(false);
    expect(readCookie(req({ cookie: "a=1; b=two=2" }), "b")).toBe("two=2");
  });

  test("sign-in compares the token and caps repeated failures", async () => {
    const { token } = await loadToken();
    expect(signIn(token)).toBe("ok");
    for (let i = 0; i < 10; i++) expect(signIn("nope", 1_000)).toBe("wrong");
    expect(signIn(token, 1_000)).toBe("limited");
    expect(signIn(token, 70_000)).toBe("ok");
  });

  test("the cookie is HttpOnly and Strict, and Secure only behind HTTPS", async () => {
    await loadToken();
    config.publicUrl = null;
    expect(signInCookie()).toContain("HttpOnly; SameSite=Strict");
    expect(signInCookie()).not.toContain("Secure");
    config.publicUrl = "https://satgas.example.com";
    expect(signInCookie()).toContain("; Secure");
    config.publicUrl = null;
  });
});

test("file keys open one board only", async () => {
  await loadToken();
  const key = fileKey("run1");
  expect(key).toHaveLength(22);
  expect(validFileKey("run1", key)).toBe(true);
  expect(validFileKey("run2", key)).toBe(false);
  // One key in 64 already ends in x, which would make this the same key.
  expect(validFileKey("run1", `${key.slice(0, -1)}${key.endsWith("x") ? "y" : "x"}`)).toBe(false);
});

describe("changing the token", () => {
  test("the old token stops working at once, the new one is private, and a cookie follows it", async () => {
    config.token = null;
    await rm(join(dir, "token"), { force: true });
    const { token: old } = await loadToken();
    const next = await rotateToken();
    expect(next).not.toBe(old);
    expect(signIn(old)).toBe("wrong");
    resetFailures();
    expect(signIn(next ?? "")).toBe("ok");
    expect((await readFile(join(dir, "token"), "utf8")).trim()).toBe(next ?? "");
    expect((await stat(join(dir, "token"))).mode & 0o777).toBe(0o600);
    expect(signInCookie()).toContain(`${COOKIE}=${next}`);
  });

  test("a token from SATGAS_TOKEN belongs to whoever set it", async () => {
    config.token = "from-the-environment-0123456789abcdef";
    await loadToken();
    expect(await rotateToken()).toBeNull();
    expect(signIn("from-the-environment-0123456789abcdef")).toBe("ok");
    config.token = null;
  });
});
