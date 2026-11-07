import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "../shared/settings";
import { config } from "./config";

const TIMEOUT = 10_000;
const LOGIN_TTL = 10 * 60_000;
const DETECT_TTL = 10 * 60_000;
// Agents cannot refresh a header mid-task, so a token has to outlive the task it starts.
const REFRESH_MARGIN = 30 * 60_000;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export interface AuthSupport {
  // Answers without any sign-in.
  open: boolean;
  oauth: boolean;
  // Signs in with a code typed on the server's page, because it has no way back to this Satgas.
  device?: boolean;
  // The server could not be reached, which says nothing about what it supports.
  failed?: boolean;
}

interface AuthServer {
  issuer: string;
  authorize: string;
  token: string;
  register?: string;
  device?: string;
  resource: string;
  scope: string;
}

interface Client {
  id: string;
  secret?: string;
}

interface Grant {
  url: string;
  token: string;
  clientId: string;
  clientSecret?: string;
  resource: string;
  access: string;
  refresh?: string;
  expiresAt?: number;
  // The server refused the refresh token, so only a new sign-in brings it back.
  broken?: boolean;
}

interface Store {
  grants: Record<string, Grant>;
  clients: Record<string, Client>;
}

interface Pending {
  serverId: string;
  url: string;
  auth: AuthServer;
  client: Client;
  at: number;
  redirect?: string;
  verifier?: string;
  device?: { code: string; next: number; every: number };
  status: "waiting" | "done" | "failed";
  error?: string;
}

const file = () => join(config.dataDir, "connector-logins.json");
const pending = new Map<string, Pending>();
const detected = new Map<string, { at: number; support: AuthSupport }>();
let store: Store | undefined;
let writing: Promise<unknown> = Promise.resolve();

async function load(): Promise<Store> {
  if (!store) {
    const raw = await readFile(file(), "utf8").catch(() => "");
    try {
      store = { grants: {}, clients: {}, ...JSON.parse(raw) } as Store;
    } catch {
      store = { grants: {}, clients: {} };
    }
  }
  return store;
}

// Tokens live here, so the file is private to this user and written whole, one save at a time.
function save(): Promise<unknown> {
  writing = writing.then(async () => {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file()}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(store), { mode: 0o600 });
      await rename(tmp, file());
    } catch (e) {
      await rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  });
  return writing;
}

// The browser opens these addresses and tokens go to them, so plain http is only allowed on this machine.
function usable(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") return raw;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ? raw : null;
  } catch {
    return null;
  }
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "satgas", version: "1" } },
});

async function authServerAt(issuer: string, resource: string, scope: string): Promise<AuthServer | null> {
  const root = usable(issuer);
  if (!root) return null;
  const { origin, pathname } = new URL(root);
  const path = pathname.replace(/\/$/, "");
  for (const at of [
    `${origin}/.well-known/oauth-authorization-server${path}`,
    `${origin}/.well-known/openid-configuration${path}`,
    `${origin}${path}/.well-known/openid-configuration`,
  ]) {
    const meta = await getJson(at);
    if (!meta) continue;
    const authorize = usable(meta.authorization_endpoint);
    const token = usable(meta.token_endpoint);
    const methods = meta.code_challenge_methods_supported;
    if (meta.issuer !== issuer || !authorize || !token || !Array.isArray(methods) || !methods.includes("S256")) continue;
    const register = usable(meta.registration_endpoint) ?? undefined;
    const device = usable(meta.device_authorization_endpoint) ?? undefined;
    // GitHub offers no client registration, so its sign-in needs an app of ours and goes through a device code.
    if (!register && !(device && config.oauthClients[issuer])) continue;
    // Refreshing needs this scope on the servers that have it, or the sign-in lasts an hour.
    const offline = Array.isArray(meta.scopes_supported) && meta.scopes_supported.includes("offline_access");
    const scopes = new Set([...scope.split(/\s+/).filter(Boolean), ...(offline ? ["offline_access"] : [])]);
    return { issuer, authorize, token, register, device, resource, scope: [...scopes].join(" ") };
  }
  return null;
}

// What a server says about itself when asked without credentials, following the MCP authorization spec.
async function discover(url: string): Promise<{ open: boolean; auth: AuthServer | null }> {
  const probe = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: INITIALIZE,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  await probe.body?.cancel().catch(() => {});
  // A web page answers 200 too, and only a JSON or stream reply is a server that spoke back.
  if (probe.ok) return { open: /json|event-stream/i.test(probe.headers.get("content-type") ?? ""), auth: null };
  const challenge = probe.headers.get("www-authenticate") ?? "";
  const { origin, pathname } = new URL(url);
  const hinted = usable(/resource_metadata="([^"]+)"/.exec(challenge)?.[1]);
  for (const at of [
    hinted,
    `${origin}/.well-known/oauth-protected-resource${pathname}`,
    `${origin}/.well-known/oauth-protected-resource`,
  ]) {
    if (!at) continue;
    const meta = await getJson(at);
    if (!Array.isArray(meta?.authorization_servers)) continue;
    const resource = usable(meta.resource) ?? url;
    // A server cannot send a sign-in meant for somewhere else.
    if (new URL(resource).origin !== origin) continue;
    const listed = Array.isArray(meta.scopes_supported) ? meta.scopes_supported.filter((s) => typeof s === "string").join(" ") : "";
    const scope = /scope="([^"]*)"/.exec(challenge)?.[1] ?? listed;
    for (const issuer of meta.authorization_servers) {
      const auth = await authServerAt(String(issuer), resource, scope);
      if (auth) return { open: false, auth };
    }
    return { open: false, auth: null };
  }
  return { open: false, auth: null };
}

export async function detectAuth(url: string): Promise<AuthSupport> {
  if (!usable(url)) return { open: false, oauth: false, failed: true };
  const known = detected.get(url);
  if (known && Date.now() - known.at < DETECT_TTL) return known.support;
  try {
    const { open, auth } = await discover(url);
    const support: AuthSupport = { open, oauth: !!auth, ...(auth && !auth.register ? { device: true } : {}) };
    detected.set(url, { at: Date.now(), support });
    return support;
  } catch {
    return { open: false, oauth: false, failed: true };
  }
}

async function clientFor(auth: AuthServer, redirect: string): Promise<Client> {
  const known = config.oauthClients[auth.issuer];
  if (known) return { id: known };
  const data = await load();
  const key = `${auth.issuer}|${redirect}`;
  const saved = data.clients[key];
  if (saved) return saved;
  const res = await fetch(auth.register as string, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Satgas",
      redirect_uris: [redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = (await res.json().catch(() => null)) as { client_id?: unknown; client_secret?: unknown } | null;
  if (!res.ok || typeof body?.client_id !== "string") throw new Error("The server did not accept Satgas as an app.");
  const client: Client = { id: body.client_id, ...(typeof body.client_secret === "string" ? { secret: body.client_secret } : {}) };
  data.clients[key] = client;
  await save();
  return client;
}

const random = (bytes = 32) => Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
const challengeOf = (verifier: string) => new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");

export type LoginStart = { flow: "redirect"; state: string; open: string } | { flow: "device"; state: string; open: string; code: string };

// origin: where this Satgas is reached from, which is where the sign-in page sends the person back to.
export async function startLogin(serverId: string, url: string, origin: string): Promise<LoginStart | { error: string }> {
  if (!usable(url)) return { error: "This server's address cannot be used for a sign-in." };
  const now = Date.now();
  for (const [state, p] of pending) if (now - p.at > LOGIN_TTL) pending.delete(state);
  const { auth } = await discover(url).catch(() => ({ auth: null }));
  if (!auth) return { error: "This server does not offer a sign-in Satgas can use." };
  const state = random();
  try {
    if (!auth.register && auth.device) {
      const client = await clientFor(auth, "");
      const res = await fetch(auth.device, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: client.id, scope: auth.scope }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const open = usable(body?.verification_uri);
      if (!res.ok || !open || typeof body?.device_code !== "string" || typeof body.user_code !== "string")
        return { error: "The server refused to start a sign-in." };
      const every = Math.max(1, Number(body.interval) || 5) * 1000;
      pending.set(state, {
        serverId,
        url,
        auth,
        client,
        at: now,
        device: { code: body.device_code, every, next: now + every },
        status: "waiting",
      });
      return { flow: "device", state, open, code: body.user_code };
    }
    const redirect = `${origin}/api/connectors/callback`;
    const client = await clientFor(auth, redirect);
    const verifier = random();
    const open = new URL(auth.authorize);
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: client.id,
      redirect_uri: redirect,
      state,
      code_challenge: challengeOf(verifier),
      code_challenge_method: "S256",
      resource: auth.resource,
      ...(auth.scope ? { scope: auth.scope } : {}),
    }))
      open.searchParams.set(k, v);
    pending.set(state, { serverId, url, auth, client, at: now, redirect, verifier, status: "waiting" });
    return { flow: "redirect", state, open: open.href };
  } catch (e) {
    return { error: (e as Error).message || "The server refused to start a sign-in." };
  }
}

async function askToken(token: string, form: Record<string, string>) {
  const res = await fetch(token, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  return { ok: res.ok && typeof body.access_token === "string", body };
}

const clientForm = (c: Client) => ({ client_id: c.id, ...(c.secret ? { client_secret: c.secret } : {}) });
const reason = (body: Record<string, unknown>) =>
  String(body.error_description ?? body.error ?? "The server refused the sign-in.").slice(0, 200);

async function keep(p: Pending, body: Record<string, unknown>) {
  const data = await load();
  const life = Number(body.expires_in);
  data.grants[p.serverId] = {
    url: p.url,
    token: p.auth.token,
    clientId: p.client.id,
    ...(p.client.secret ? { clientSecret: p.client.secret } : {}),
    resource: p.auth.resource,
    access: body.access_token as string,
    ...(typeof body.refresh_token === "string" ? { refresh: body.refresh_token } : {}),
    ...(life > 0 ? { expiresAt: Date.now() + life * 1000 } : {}),
  };
  await save();
  p.status = "done";
}

// The sign-in page's way back. The state is random and used once, so a link from anywhere else does nothing.
export async function finishLogin(params: URLSearchParams): Promise<string | null> {
  const p = pending.get(params.get("state") ?? "");
  if (!p?.verifier || !p.redirect || p.status !== "waiting") return "This sign-in has expired. Start it again from Satgas.";
  const fail = (message: string) => {
    p.status = "failed";
    p.error = message;
    return message;
  };
  if (params.get("error")) return fail(reason({ error: params.get("error"), error_description: params.get("error_description") }));
  const iss = params.get("iss");
  if (iss && iss !== p.auth.issuer) return fail("The answer came from a different server than the one asked.");
  const code = params.get("code");
  if (!code) return fail("The server sent no sign-in code.");
  const { ok, body } = await askToken(p.auth.token, {
    grant_type: "authorization_code",
    code,
    redirect_uri: p.redirect,
    code_verifier: p.verifier,
    resource: p.auth.resource,
    ...clientForm(p.client),
  }).catch(() => ({ ok: false, body: { error: "The server could not be reached." } as Record<string, unknown> }));
  if (!ok) return fail(reason(body));
  await keep(p, body);
  return null;
}

// A device-code sign-in has no way back, so each look at its status also asks the server, no faster than it allows.
async function pollDevice(p: Pending) {
  if (!p.device || p.status !== "waiting" || Date.now() < p.device.next) return;
  p.device.next = Date.now() + p.device.every;
  const { ok, body } = await askToken(p.auth.token, {
    grant_type: DEVICE_GRANT,
    device_code: p.device.code,
    ...clientForm(p.client),
  }).catch(() => ({
    ok: false,
    body: { error: "authorization_pending" } as Record<string, unknown>,
  }));
  if (ok) return keep(p, body);
  if (body.error === "authorization_pending") return;
  if (body.error === "slow_down") {
    p.device.every += 5000;
    return;
  }
  p.status = "failed";
  p.error = reason(body);
}

export async function loginStatus(state: string): Promise<{ status: Pending["status"] | "gone"; error?: string }> {
  const p = pending.get(state);
  if (!p || Date.now() - p.at > LOGIN_TTL) return { status: "gone", error: "This sign-in has expired. Start it again." };
  await pollDevice(p);
  return { status: p.status, ...(p.error ? { error: p.error } : {}) };
}

// Which servers are signed in, for the page; the tokens themselves never leave the server.
export async function loginList(): Promise<Record<string, { broken: boolean }>> {
  const { grants } = await load();
  return Object.fromEntries(Object.entries(grants).map(([id, g]) => [id, { broken: !!g.broken }]));
}

// A removed connector takes its sign-in with it.
export async function pruneLogins(serverIds: string[]) {
  const data = await load();
  const stale = Object.keys(data.grants).filter((id) => !serverIds.includes(id));
  if (!stale.length) return;
  for (const id of stale) delete data.grants[id];
  await save();
}

const refreshing = new Map<string, Promise<string | null>>();

async function refresh(g: Grant): Promise<string | null> {
  if (!g.refresh) {
    g.broken = true;
    await save();
    return null;
  }
  const answer = await askToken(g.token, {
    grant_type: "refresh_token",
    refresh_token: g.refresh,
    resource: g.resource,
    ...clientForm({ id: g.clientId, secret: g.clientSecret }),
  }).catch(() => null);
  // Offline says nothing about the sign-in, so the old token stays until the server itself refuses.
  if (!answer) return g.expiresAt && g.expiresAt > Date.now() ? g.access : null;
  if (!answer.ok) {
    g.broken = true;
    await save();
    return null;
  }
  const life = Number(answer.body.expires_in);
  g.access = answer.body.access_token as string;
  if (typeof answer.body.refresh_token === "string") g.refresh = answer.body.refresh_token;
  g.expiresAt = life > 0 ? Date.now() + life * 1000 : undefined;
  g.broken = undefined;
  await save();
  return g.access;
}

async function freshToken(id: string): Promise<string | null> {
  const g = (await load()).grants[id];
  if (!g || g.broken) return null;
  if (!g.expiresAt || g.expiresAt - Date.now() > REFRESH_MARGIN) return g.access;
  const running = refreshing.get(id);
  if (running) return running;
  const next = refresh(g).finally(() => refreshing.delete(id));
  refreshing.set(id, next);
  return next;
}

// The servers as agents should get them, with a signed-in one carrying its current token.
export async function withLogins(servers: McpServer[]): Promise<McpServer[]> {
  const { grants } = await load();
  return Promise.all(
    servers.map(async (s) => {
      if (s.transport !== "http" || !grants[s.id]) return s;
      const token = await freshToken(s.id);
      return token ? { ...s, headers: { ...s.headers, Authorization: `Bearer ${token}` } } : s;
    }),
  );
}

// For tests: forget everything held in memory.
export function resetLogins() {
  store = undefined;
  pending.clear();
  detected.clear();
  refreshing.clear();
}
