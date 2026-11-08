import { afterAll, beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import type { Server } from "bun";

let server: Server<undefined>;
let seen: { op: string; auth: string | null; body: unknown }[] = [];

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      seen.push({ op: new URL(req.url).pathname, auth: req.headers.get("authorization"), body: await req.json() });
      return Response.json({ text: "Posted for the team." });
    },
  });
});
afterAll(() => server.stop(true));

// The connector as an agent runs it: newline-delimited JSON-RPC on stdin and stdout.
async function talk(lines: object[], env: Record<string, string> = {}) {
  seen = [];
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "../../../src/server/team/mcp.ts")], {
    stdin: new Blob([`${lines.map((l) => JSON.stringify(l)).join("\n")}\n`]),
    stdout: "pipe",
    env: { ...process.env, SATGAS_TEAM_URL: `http://127.0.0.1:${server.port}/api/team`, SATGAS_TEAM_TOKEN: "tok", ...env },
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

test("speaks MCP: initialize, lists the team tools, and hands a call to Satgas with the task's token", async () => {
  const replies = await talk([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "team_note", arguments: { text: "API returns id" } } },
  ]);
  const byId = new Map(replies.map((r) => [r.id, r]));
  expect(byId.get(1)?.result.serverInfo.name).toBe("satgas_team");
  expect(byId.get(2)?.result.tools.map((t: { name: string }) => t.name)).toEqual([
    "team_notes",
    "team_note",
    "team_files",
    "team_ask",
    "team_answer",
    "app_start",
    "app_stop",
    "app_status",
    "request_secret",
  ]);
  expect(byId.get(3)?.result).toEqual({ content: [{ type: "text", text: "Posted for the team." }], isError: false });
  expect(seen).toEqual([{ op: "/api/team/note", auth: "Bearer tok", body: { text: "API returns id" } }]);
});

test("a task working alone is offered its web apps and the secret request, not the team tools", async () => {
  const replies = await talk([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { SATGAS_TEAM_TALK: "0" });
  expect(replies[0]?.result.tools.map((t: { name: string }) => t.name)).toEqual(["app_start", "app_stop", "app_status", "request_secret"]);
});

test("a model that cannot see is offered see_image, which sends the full path of the picture", async () => {
  const replies = await talk(
    [
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "see_image", arguments: { path: "shots/home.png" } } },
    ],
    { SATGAS_TEAM_TALK: "0", SATGAS_BLIND: "1" },
  );
  expect(replies[0]?.result.tools.map((t: { name: string }) => t.name)).toContain("see_image");
  expect(seen).toEqual([{ op: "/api/team/see", auth: "Bearer tok", body: { path: join(process.cwd(), "shots/home.png") } }]);
  const sighted = await talk([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { SATGAS_TEAM_TALK: "0", SATGAS_BLIND: "0" });
  expect(sighted[0]?.result.tools.map((t: { name: string }) => t.name)).not.toContain("see_image");
});

test("every tool declares MCP's four annotation hints, and only the ones that look are marked read-only", async () => {
  const replies = await talk([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { SATGAS_TEAM_TALK: "1", SATGAS_BLIND: "1" });
  const tools = replies[0]?.result.tools as { name: string; annotations: Record<string, boolean> }[];
  for (const t of tools)
    expect(Object.keys(t.annotations).sort()).toEqual(["destructiveHint", "idempotentHint", "openWorldHint", "readOnlyHint"]);
  const readOnly = tools
    .filter((t) => t.annotations.readOnlyHint)
    .map((t) => t.name)
    .sort();
  expect(readOnly).toEqual(["app_status", "see_image", "team_files", "team_notes"]);
});
