import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../../src/server/config";
import { createRun, flushAll, getRun, patchRun } from "../../../src/server/store";
import { closeTeamSession, openTeamSession, teamCall, trackFile } from "../../../src/server/team";
import type { NodeState } from "../../../src/shared/types";

const original = config.dataDir;
let dir = "";
const hot = globalThis as { __satgasInboxes?: Map<string, Map<string, (text: string) => void>> };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-team-"));
  await mkdir(join(dir, "runs"), { recursive: true });
  config.dataDir = dir;
});
afterAll(async () => {
  await flushAll();
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

const node = (id: string, member: string): NodeState => ({
  id,
  title: id,
  role: "",
  agent: "claude",
  task: "",
  dependsOn: [],
  status: "running",
  member,
  round: 0,
  x: 0,
  y: 0,
});

function board() {
  const run = createRun("Build signup", dir);
  patchRun(run.id, {
    team: [
      { id: "raka", name: "Raka", role: "Backend", brief: "", agent: "claude", hiredAt: 1, round: 0 },
      { id: "nadia", name: "Nadia", role: "Frontend", brief: "", agent: "claude", hiredAt: 1, round: 0 },
    ],
    nodes: [node("api", "raka"), node("ui", "nadia")],
  });
  return run.id;
}

test("notes are shared, bounded, and name who is working", async () => {
  const id = board();
  const raka = openTeamSession(id, "api", "raka", 0);
  const nadia = openTeamSession(id, "ui", "nadia", 0);
  expect(await teamCall(raka, "note", { text: "POST /signup returns { id, email }" })).toEqual({ ok: true, text: "Posted for the team." });
  const read = await teamCall(nadia, "notes", {});
  expect(read.ok && read.text).toContain("Raka: POST /signup returns { id, email }");
  expect(read.ok && read.text).toContain("Raka (raka, Backend): working now");
  for (let i = 0; i < 7; i++) await teamCall(raka, "note", { text: `n${i}` });
  expect((await teamCall(raka, "note", { text: "one too many" })).ok).toBe(false);

  trackFile(id, "api", "src/api/signup.ts");
  const files = await teamCall(nadia, "files", {});
  expect(files.ok && files.text).toContain("Raka: src/api/signup.ts");
  closeTeamSession(raka);
  closeTeamSession(nadia);
  expect((await teamCall(raka, "notes", {})).ok).toBe(false);
});

test("a question reaches a working teammate's inbox and their answer comes back", async () => {
  const id = board();
  const raka = openTeamSession(id, "api", "raka", 0);
  const nadia = openTeamSession(id, "ui", "nadia", 0);
  // Raka's running CLI: it answers the question it hears.
  hot.__satgasInboxes?.set(
    id,
    new Map([
      [
        "api",
        (text: string) => {
          const askId = /id "([^"]+)"/.exec(text)?.[1] ?? "";
          void teamCall(raka, "answer", { id: askId, text: "email is unique; 409 when taken" });
        },
      ],
    ]),
  );
  const r = await teamCall(nadia, "ask", { to: "Raka", question: "What does signup return for a taken email?" });
  expect(r).toEqual({ ok: true, text: "Raka answers: email is unique; 409 when taken" });
  expect(getRun(id)?.talk?.[0]?.asks[0]).toMatchObject({ from: "nadia", to: "raka", state: "answered" });

  await teamCall(nadia, "ask", { to: "raka", question: "Second?" });
  expect((await teamCall(nadia, "ask", { to: "raka", question: "Third?" })).ok).toBe(false);
  hot.__satgasInboxes?.delete(id);
  closeTeamSession(raka);
  closeTeamSession(nadia);
});

test("a teammate who cannot take questions is reported, not waited on", async () => {
  const id = board();
  const nadia = openTeamSession(id, "ui", "nadia", 0);
  const r = await teamCall(nadia, "ask", { to: "raka", question: "Ready?" });
  expect(r.ok && r.text).toContain("cannot take questions right now");
  expect(getRun(id)?.talk?.[0]?.asks[0]?.state).toBe("unreachable");
  expect((await teamCall(nadia, "ask", { to: "budi", question: "?" })).ok).toBe(false);
  closeTeamSession(nadia);
});
