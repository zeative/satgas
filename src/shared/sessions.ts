import type { Run } from "./types";

// A board holds one or more chat sessions sharing its canvas, folder, team, memory and rules. Each round belongs to
// one; the lead reads only its own session's earlier rounds. Rounds from before sessions existed belong to the main one.
export const MAIN_SESSION = "main";
export const MAX_SESSIONS = 50;
export const SESSION_TITLE_MAX = 80;

export interface ChatSession {
  id: string;
  title?: string;
  createdAt: number;
  archived?: boolean;
}

type Rounds = Pick<Run, "prompt" | "rounds" | "roundSessions">;

export const sessionOf = (run: Pick<Run, "roundSessions">, round: number) => run.roundSessions?.[round] ?? MAIN_SESSION;

export const roundText = (run: Rounds, round: number) => (round === 0 ? run.prompt : (run.rounds?.[round - 1] ?? ""));

// The rounds of one session, oldest first, up to and including `upTo`.
export function sessionRounds(run: Rounds, session: string, upTo = Number.POSITIVE_INFINITY): number[] {
  const last = Math.min(upTo, run.rounds?.length ?? 0);
  const out: number[] = [];
  for (let r = 0; r <= last; r++) if (sessionOf(run, r) === session) out.push(r);
  return out;
}

// Every session of the board, the main one first; a board without any made since still has its main session.
export function sessionsOf(run: Pick<Run, "sessions" | "createdAt">): ChatSession[] {
  return [{ id: MAIN_SESSION, createdAt: run.createdAt }, ...(run.sessions ?? [])];
}
