import { create } from "zustand";
import { type ChatSession, MAIN_SESSION, sessionOf, sessionsOf } from "../../shared/sessions";
import type { Run } from "../../shared/types";
import { request, useRuns } from "./runs";

// Which chat session each board shows, kept across reloads; a board never opened before shows its latest session.
const KEY = "satgas.chatSession";

function stored(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export const useChatSession = create<{ picked: Record<string, string> }>(() => ({ picked: stored() }));

export function pickSession(runId: string, session: string) {
  const picked = { ...useChatSession.getState().picked, [runId]: session };
  useChatSession.setState({ picked });
  localStorage.setItem(KEY, JSON.stringify(picked));
}

// The session a board shows: the picked one while it still exists and is not archived, else the latest round's.
export function activeSession(run: Pick<Run, "id" | "sessions" | "roundSessions" | "rounds" | "createdAt">, picked?: string): string {
  const live = sessionsOf(run).filter((s) => !s.archived);
  if (picked && live.some((s) => s.id === picked)) return picked;
  const latest = sessionOf(run, run.rounds?.length ?? 0);
  return live.some((s) => s.id === latest) ? latest : MAIN_SESSION;
}

export function useActiveSession(run: Pick<Run, "id" | "sessions" | "roundSessions" | "rounds" | "createdAt">): string {
  const picked = useChatSession((s) => s.picked[run.id]);
  return activeSession(run, picked);
}

// What a message sent now from anywhere on the board (chat, a button, a comment) belongs to.
export function currentSession(runId: string): string | undefined {
  const run = useRuns.getState().run;
  if (!run || run.id !== runId) return useChatSession.getState().picked[runId];
  return activeSession(run, useChatSession.getState().picked[runId]);
}

export async function newSession(runId: string): Promise<ChatSession> {
  const session = (await request("POST", `/api/runs/${runId}/sessions`, {})) as ChatSession;
  pickSession(runId, session.id);
  return session;
}

export const updateSession = (runId: string, session: string, patch: { title?: string; archived?: boolean }) =>
  request("PATCH", `/api/runs/${runId}/sessions/${session}`, patch) as Promise<ChatSession>;
