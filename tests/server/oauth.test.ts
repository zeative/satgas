import { afterAll, afterEach, beforeAll, beforeEach, expect, setSystemTime, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import {
  detectAuth,
  finishLogin,
  type LoginStart,
  loginList,
  loginStatus,
  pruneLogins,
  resetLogins,
  startLogin,
  withLogins,
} from "../../src/server/oauth";
import type { McpServer } from "../../src/shared/settings";

let server: ReturnType<typeof Bun.serve>;
let base = "";
let dataDir = "";
const original = { dir: config.dataDir, clients: config.oauthClients };

// A small authorization server, with what each test wants it to do.
let registered = 0;
let refreshes = 0;
let lastAuthCode: Record<string, string> = {};
let tokenAnswer: () => Response;
let s256 = true;
let register = true;

const granted = (access: string, extra: object = {}) => Response.json({ access_token: access, ...extra });

const asMeta = () => ({
  issuer: base,
  authorization_endpoint: `${base}/authorize`,
  token_endpoint: `${base}/token`,
  ...(register ? { registration_endpoint: `${base}/register` } : {}),
  device_authorization_endpoint: `${base}/device`,
  code_challenge_methods_supported: s256 ? ["S256"] : ["plain"],
  scopes_supported: ["read", "offline_access"],
});

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/open") return Response.json({ result: {} });
      if (path === "/page") return new Response("<html></html>", { headers: { "content-type": "text/html" } });
      if (path === "/keyonly") return new Response("no", { status: 401 });
      if (path === "/mcp")
        return new Response("no", {
          status: 401,
          headers: { "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="read"` },
        });
      if (path === "/.well-known/oauth-protected-resource/mcp")
        return Response.json({ resource: `${base}/mcp`, authorization_servers: [base] });
      if (path === "/.well-known/oauth-authorization-server") return Response.json(asMeta());
      if (path === "/register") {
        registered++;
        return Response.json({ client_id: `client-${registered}` });
      }
      if (path === "/device")
        return Response.json({ device_code: "dev", user_code: "ABCD-1234", verification_uri: `${base}/activate`, interval: 1 });
      if (path === "/token") {
        const form = Object.fromEntries(new URLSearchParams(await req.text()));
        if (form.grant_type === "refresh_token") refreshes++;
        lastAuthCode = form;
        return tokenAnswer();
      }
      return new Response("missing", { status: 404 });
    },
  });
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  config.dataDir = original.dir;
  config.oauthClients = original.clients;
});

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "satgas-oauth-"));
  config.dataDir = dataDir;
  config.oauthClients = {};
  registered = 0;
  refreshes = 0;
  lastAuthCode = {};
  s256 = true;
  register = true;
  tokenAnswer = () => granted("first", { refresh_token: "r1", expires_in: 7200 });
  resetLogins();
});

afterEach(async () => {
  setSystemTime();
  await rm(dataDir, { recursive: true, force: true });
});

const http = (id: string, url = `${base}/mcp`): McpServer => ({
  id,
  name: id,
  enabled: true,
  transport: "http",
  url,
  headers: { "x-keep": "1" },
});

const redirected = async (id = "s1") => {
  const started = await startLogin(id, `${base}/mcp`, "http://localhost:5317");
  if ("error" in started || started.flow !== "redirect") throw new Error("expected a redirect sign-in");
  return started as Extract<LoginStart, { flow: "redirect" }>;
};

test("tells a server that signs in, one that needs a key, one that needs nothing and one that cannot be reached", async () => {
  expect(await detectAuth(`${base}/mcp`)).toEqual({ open: false, oauth: true });
  expect(await detectAuth(`${base}/keyonly`)).toEqual({ open: false, oauth: false });
  expect(await detectAuth(`${base}/open`)).toEqual({ open: true, oauth: false });
  expect(await detectAuth(`${base}/page`)).toEqual({ open: false, oauth: false });
  expect((await detectAuth("http://localhost:1/nothing")).failed).toBe(true);
  expect((await detectAuth("http://example.com/mcp")).failed).toBe(true);
});

test("refuses a sign-in without PKCE or any way to get a client", async () => {
  s256 = false;
  expect((await detectAuth(`${base}/mcp`)).oauth).toBe(false);
  resetLogins();
  s256 = true;
  register = false;
  expect((await detectAuth(`${base}/mcp`)).oauth).toBe(false);
});

test("signs in with PKCE, then agents carry the token and the page never sees it", async () => {
  const { open, state } = await redirected();
  const page = new URL(open);
  expect(page.searchParams.get("code_challenge_method")).toBe("S256");
  expect(page.searchParams.get("resource")).toBe(`${base}/mcp`);
  expect(page.searchParams.get("scope")).toBe("read offline_access");
  expect(page.searchParams.get("redirect_uri")).toBe("http://localhost:5317/api/connectors/callback");
  expect(await loginStatus(state)).toEqual({ status: "waiting" });

  expect(await finishLogin(new URLSearchParams({ state, code: "abc" }))).toBeNull();
  const challenge = new Bun.CryptoHasher("sha256").update(lastAuthCode.code_verifier ?? "").digest("base64url");
  expect(challenge).toBe(page.searchParams.get("code_challenge") as string);
  expect(await loginStatus(state)).toEqual({ status: "done" });

  const [out] = await withLogins([http("s1")]);
  expect(out?.headers).toEqual({ "x-keep": "1", Authorization: "Bearer first" });
  expect(JSON.stringify(await loginList())).not.toContain("first");
  expect(await loginList()).toEqual({ s1: { broken: false } });
  expect((await stat(join(dataDir, "connector-logins.json"))).mode & 0o777).toBe(0o600);
});

test("a client registers once per server and address", async () => {
  await redirected("a");
  await redirected("b");
  expect(registered).toBe(1);
});

test("the way back only works once, and never for a stranger's state or a mixed-up server", async () => {
  expect(await finishLogin(new URLSearchParams({ state: "guess", code: "x" }))).toContain("expired");
  const first = await redirected();
  expect(await finishLogin(new URLSearchParams({ state: first.state, code: "x" }))).toBeNull();
  expect(await finishLogin(new URLSearchParams({ state: first.state, code: "x" }))).toContain("expired");

  const mixed = await redirected("m");
  expect(await finishLogin(new URLSearchParams({ state: mixed.state, code: "x", iss: "https://evil.example" }))).toContain(
    "different server",
  );
  expect((await loginStatus(mixed.state)).status).toBe("failed");
  expect((await withLogins([http("m")]))[0]?.headers?.Authorization).toBeUndefined();

  const denied = await redirected("d");
  expect(await finishLogin(new URLSearchParams({ state: denied.state, error: "access_denied", error_description: "Nope" }))).toBe("Nope");
});

test("a token close to expiring is refreshed before a task, and a refused refresh asks for a new sign-in", async () => {
  const { state } = await redirected();
  await finishLogin(new URLSearchParams({ state, code: "x" }));
  await withLogins([http("s1")]);
  expect(refreshes).toBe(0);

  setSystemTime(new Date(Date.now() + 100 * 60_000));
  tokenAnswer = () => granted("second", { expires_in: 7200 });
  expect((await withLogins([http("s1")]))[0]?.headers?.Authorization).toBe("Bearer second");
  expect(refreshes).toBe(1);
  expect(lastAuthCode.refresh_token).toBe("r1");

  setSystemTime(new Date(Date.now() + 200 * 60_000));
  tokenAnswer = () => Response.json({ error: "invalid_grant" }, { status: 400 });
  expect((await withLogins([http("s1")]))[0]?.headers?.Authorization).toBeUndefined();
  expect(await loginList()).toEqual({ s1: { broken: true } });
});

test("a server with no registration signs in by device code through a known client", async () => {
  register = false;
  config.oauthClients = { [base]: "known-app" };
  expect(await detectAuth(`${base}/mcp`)).toEqual({ open: false, oauth: true, device: true });
  const started = await startLogin("g", `${base}/mcp`, "http://localhost:5317");
  if ("error" in started || started.flow !== "device") throw new Error("expected a device sign-in");
  expect(started.code).toBe("ABCD-1234");
  expect(registered).toBe(0);

  tokenAnswer = () => Response.json({ error: "authorization_pending" }, { status: 400 });
  const start = Date.now();
  expect(await loginStatus(started.state)).toEqual({ status: "waiting" });
  expect(lastAuthCode).toEqual({});
  setSystemTime(new Date(start + 1500));
  expect(await loginStatus(started.state)).toEqual({ status: "waiting" });
  expect(lastAuthCode.client_id).toBe("known-app");

  tokenAnswer = () => granted("device-token");
  setSystemTime(new Date(start + 3000));
  expect(await loginStatus(started.state)).toEqual({ status: "done" });
  expect((await withLogins([http("g")]))[0]?.headers?.Authorization).toBe("Bearer device-token");
});

test("removing a connector forgets its sign-in, and other servers pass through untouched", async () => {
  const { state } = await redirected();
  await finishLogin(new URLSearchParams({ state, code: "x" }));
  const local: McpServer = { id: "l", name: "l", enabled: true, transport: "stdio", command: "x" };
  expect((await withLogins([local, http("other")])).map((s) => s.headers?.Authorization)).toEqual([undefined, undefined]);
  await pruneLogins(["other"]);
  expect(await loginList()).toEqual({});
});
