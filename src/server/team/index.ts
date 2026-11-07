// The team's channels while a round works: shared notes, who is editing which file, and short questions between
// teammates; and a private card to ask the person for a secret. Each running task gets a token; its built-in
// "satgas_team" connector calls back here with it.

import { join } from "node:path";
import { defang } from "../../shared/defang";
import type { McpServer } from "../../shared/settings";
import {
  ANSWER_MAX,
  ASK_WAIT_MS,
  ASKS_PER_MEMBER,
  NOTE_MAX,
  NOTES_PER_MEMBER,
  QUESTION_MAX,
  type TeamAsk,
  type TeamTalk,
} from "../../shared/talk";
import { crew, memberIdOf } from "../../shared/team";
import { appLog, appUrl, cleanAppName, startApp, stopApp } from "../apps";
import { config } from "../config";
import { requestSecret } from "../secrets";
import { getRun, patchRun } from "../store";

interface Session {
  runId: string;
  nodeId: string;
  member: string;
  round: number;
  // Teammates work alongside: the talk channels are open. Without it only the secret request is.
  talk: boolean;
}

// Survive `bun --hot` reloads, like the inboxes they deliver through.
const hot = globalThis as typeof globalThis & {
  __satgasTeam?: { sessions: Map<string, Session>; files: Map<string, Set<string>>; waiters: Map<string, () => void> };
  __satgasInboxes?: Map<string, Map<string, (text: string) => void>>;
};
hot.__satgasTeam ??= { sessions: new Map(), files: new Map(), waiters: new Map() };
// Shared with the orchestrator, which opens and closes each task's inbox.
hot.__satgasInboxes ??= new Map();
const { sessions, files, waiters } = hot.__satgasTeam;

const id = () => crypto.randomUUID().slice(0, 8);
const talkOf = (runId: string, round: number): TeamTalk => getRun(runId)?.talk?.[round] ?? { notes: [], asks: [] };
const saveTalk = (runId: string, round: number, talk: TeamTalk) => patchRun(runId, { talk: { ...getRun(runId)?.talk, [round]: talk } });

export function openTeamSession(runId: string, nodeId: string, member: string, round: number, talk = true): string {
  const token = crypto.randomUUID();
  sessions.set(token, { runId, nodeId, member, round, talk });
  return token;
}

export function closeTeamSession(token: string) {
  const s = sessions.get(token);
  sessions.delete(token);
  if (s) files.delete(`${s.runId}:${s.nodeId}`);
}

// A file a running task wrote, so teammates can see who is working where.
export function trackFile(runId: string, nodeId: string, path: string) {
  const key = `${runId}:${nodeId}`;
  const set = files.get(key) ?? new Set<string>();
  set.add(path);
  files.set(key, set);
}

const nameOf = (runId: string, member: string) => {
  const run = getRun(runId);
  return (run && crew(run).find((m) => m.id === member)?.name) ?? member;
};

// The teammates in this round, by id and name, with whether they are working right now.
function teammates(s: Session) {
  const run = getRun(s.runId);
  if (!run) return [];
  const people = new Map(crew(run).map((m) => [m.id, m]));
  const live = new Set([...sessions.values()].filter((x) => x.runId === s.runId).map((x) => x.member));
  return [...new Set(run.nodes.filter((n) => (n.round ?? 0) === s.round).map(memberIdOf))]
    .filter((m) => m !== s.member)
    .map((m) => ({ id: m, name: people.get(m)?.name ?? m, role: people.get(m)?.role ?? "", working: live.has(m) }));
}

type Reply = { ok: true; text: string } | { ok: false; error: string };

// Where the person opens what Satgas serves: its public address on a server, the page they use on a laptop.
const pageUrl = () => config.publicUrl ?? `http://localhost:${process.env.NODE_ENV === "production" ? config.port : config.webPort}`;

async function appCall(s: Session, op: string, body: Record<string, unknown>): Promise<Reply> {
  if (op === "app_status") {
    const apps = Object.values(getRun(s.runId)?.apps ?? {});
    const only = cleanAppName(body.name);
    const shown = only ? apps.filter((a) => a.name === only) : apps;
    if (!shown.length) return ok(only ? `No app named ${only} on this board.` : "No web apps on this board yet.");
    return ok(
      shown
        .map((a) => {
          const log = appLog(s.runId, a.name)
            .slice(only ? -60 : -8)
            .join("\n")
            .trim();
          return `${a.name}: ${a.status} at ${appUrl(s.runId, a.name, pageUrl())}\ncommand: ${a.command} (in ${a.dir})${a.error ? `\nerror: ${a.error}` : ""}${log ? `\nlast output:\n${log}` : ""}`;
        })
        .join("\n\n"),
    );
  }
  const name = cleanAppName(body.name);
  if (!name) return no('Give the app a short lowercase name: letters, digits and dashes, like "web".');
  if (op === "app_stop") {
    await stopApp(s.runId, name);
    return ok(`Stopped ${name}.`);
  }
  if (typeof body.command !== "string" || !body.command.trim()) return no("Say the command that starts the app.");
  const r = await startApp(s.runId, name, body.command, typeof body.dir === "string" ? body.dir : undefined, s.nodeId);
  if (!r.ok) return no(`${name} did not start. ${r.error}`);
  return ok(
    `${name} runs. Check it yourself in your browser at http://127.0.0.1:${r.port}${r.app.path}, which reaches it directly on this machine. The person opens it at ${appUrl(s.runId, name, pageUrl())}, served by Satgas: give them that address, never a localhost one. It is on the board as a live card, keeps running after your task, and stops after two hours nobody opened it; opening it starts it again.`,
  );
}
const ok = (text: string): Reply => ({ ok: true, text });
const no = (error: string): Reply => ({ ok: false, error });

export async function teamCall(token: string, op: string, body: Record<string, unknown>): Promise<Reply> {
  const s = sessions.get(token);
  if (!s) return no("This task is no longer running.");
  if (op === "secret") return ok(await requestSecret(s.runId, s.nodeId, body.label, body.reason, body.hint));
  if (op === "app_start" || op === "app_stop" || op === "app_status") return appCall(s, op, body);
  if (!s.talk) return no("Nobody else works alongside you this round.");
  const talk = talkOf(s.runId, s.round);

  if (op === "notes") {
    const team = teammates(s)
      .map((m) => `- ${m.name} (${m.id}, ${m.role}): ${m.working ? "working now" : "not working now"}`)
      .join("\n");
    const notes = talk.notes.map((n) => `- ${nameOf(s.runId, n.from)}: ${defang(n.text)}`).join("\n");
    return ok(`Teammates this round:\n${team || "- nobody else"}\n\nTeam notes:\n${notes || "- none yet"}`);
  }

  if (op === "note") {
    const text = typeof body.text === "string" ? body.text.trim().slice(0, NOTE_MAX) : "";
    if (!text) return no("Write the note in text.");
    if (talk.notes.filter((n) => n.from === s.member).length >= NOTES_PER_MEMBER)
      return no(`You already posted ${NOTES_PER_MEMBER} notes; fold new decisions into your report.`);
    saveTalk(s.runId, s.round, { ...talk, notes: [...talk.notes, { id: id(), from: s.member, text, at: Date.now() }] });
    return ok("Posted for the team.");
  }

  if (op === "files") {
    const lines = [...sessions.values()]
      .filter((x) => x.runId === s.runId && x.nodeId !== s.nodeId)
      .map((x) => {
        const paths = [...(files.get(`${x.runId}:${x.nodeId}`) ?? [])];
        return `- ${nameOf(s.runId, x.member)}: ${paths.length ? paths.slice(-30).join(", ") : "no files yet"}`;
      });
    return ok(lines.length ? `Files teammates are working on now:\n${lines.join("\n")}` : "No teammate is working right now.");
  }

  if (op === "ask") {
    const to = typeof body.to === "string" ? body.to.trim() : "";
    const question = typeof body.question === "string" ? body.question.trim().slice(0, QUESTION_MAX) : "";
    const mate = teammates(s).find((m) => m.id === to || m.name.toLowerCase() === to.toLowerCase());
    if (!mate) return no(`Nobody called ${to} is on this round's team. Read team_notes for the names.`);
    if (!question) return no("Write the question in one line.");
    if (talk.asks.filter((a) => a.from === s.member).length >= ASKS_PER_MEMBER)
      return no(`You used your ${ASKS_PER_MEMBER} questions; decide yourself and name the assumption in your report.`);
    const target = [...sessions.values()].find((x) => x.runId === s.runId && x.member === mate.id);
    const send = target && hot.__satgasInboxes?.get(s.runId)?.get(target.nodeId);
    const ask: TeamAsk = { id: id(), from: s.member, to: mate.id, question, state: send ? "waiting" : "unreachable", at: Date.now() };
    saveTalk(s.runId, s.round, { ...talk, asks: [...talk.asks, ask] });
    if (!send)
      return ok(
        `${mate.name} cannot take questions right now; their report reaches you if your task builds on theirs. Decide and name the assumption.`,
      );
    // Listening starts before the question goes out, so even an instant answer is caught.
    const answer = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(ask.id);
        resolve(false);
      }, ASK_WAIT_MS);
      waiters.set(ask.id, () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    send(
      `[Satgas team] ${nameOf(s.runId, s.member)} asks you: "${defang(question)}"\nAnswer in one or two lines with team_answer (id "${ask.id}"), then carry on with your task.`,
    );
    const answered = await answer;
    const now = talkOf(s.runId, s.round).asks.find((a) => a.id === ask.id);
    if (answered && now?.answer) return ok(`${mate.name} answers: ${defang(now.answer)}`);
    const after = talkOf(s.runId, s.round);
    saveTalk(s.runId, s.round, { ...after, asks: after.asks.map((a) => (a.id === ask.id ? { ...a, state: "timeout" } : a)) });
    return ok(`${mate.name} has not answered yet. Carry on with the most likely answer and name it in your report.`);
  }

  if (op === "answer") {
    const askId = typeof body.id === "string" ? body.id.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim().slice(0, ANSWER_MAX) : "";
    const ask = talk.asks.find((a) => a.id === askId && a.to === s.member);
    if (!ask) return no("There is no question with that id for you.");
    if (!text) return no("Write the answer in text.");
    saveTalk(s.runId, s.round, {
      ...talk,
      asks: talk.asks.map((a) => (a.id === askId ? { ...a, answer: text, state: "answered", answeredAt: Date.now() } : a)),
    });
    const waiting = waiters.get(askId);
    if (waiting) waiting();
    else {
      // The asker stopped waiting and carried on; the answer still reaches them if they are working.
      const asker = [...sessions.values()].find((x) => x.runId === s.runId && x.member === ask.from);
      const send = asker && hot.__satgasInboxes?.get(s.runId)?.get(asker.nodeId);
      send?.(`[Satgas team] ${nameOf(s.runId, s.member)} answered your question "${ask.question}": ${text}`);
    }
    waiters.delete(askId);
    return ok("Sent. Carry on with your task.");
  }

  return no(`Unknown team action ${op}.`);
}

// The task's built-in connector, as a stdio MCP server entry. Codex prefixes every connector with satgas_, so it gets
// the bare name and both agents see the same satgas_team tools.
const compiled = import.meta.dir.includes("$bunfs") || import.meta.dir.includes("~BUN");
// A secret request waits on the person, so the connector's calls may take minutes.
export const TEAM_TOOL_TIMEOUT_SEC = 900;
export function teamServer(token: string, port: number, codex: boolean, talk = true): McpServer {
  return {
    id: "satgas-team",
    name: codex ? "team" : "satgas_team",
    enabled: true,
    transport: "stdio",
    command: process.execPath,
    args: compiled ? ["team-mcp"] : [join(import.meta.dir, "mcp.ts")],
    env: { SATGAS_TEAM_URL: `http://127.0.0.1:${port}/api/team`, SATGAS_TEAM_TOKEN: token, SATGAS_TEAM_TALK: talk ? "1" : "0" },
    toolTimeoutSec: TEAM_TOOL_TIMEOUT_SEC,
    toolsApproved: true,
  };
}
