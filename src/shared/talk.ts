// How a round's team talks while it works: notes everyone reads (decisions, contracts) and the rare short question one
// teammate asks another. Kept small on purpose: free chat between agents costs tokens and time and breeds clashing
// decisions, so the channels are narrow and every word is visible to the person.

export interface TeamNote {
  id: string;
  // The member who wrote it.
  from: string;
  text: string;
  at: number;
}

export interface TeamAsk {
  id: string;
  from: string;
  to: string;
  question: string;
  answer?: string;
  state: "waiting" | "answered" | "unreachable" | "timeout";
  at: number;
  answeredAt?: number;
}

export interface TeamTalk {
  notes: TeamNote[];
  asks: TeamAsk[];
}

// Bounds that keep talk from turning into chat.
export const NOTE_MAX = 500;
export const NOTES_PER_MEMBER = 8;
export const ASKS_PER_MEMBER = 2;
export const QUESTION_MAX = 300;
export const ANSWER_MAX = 800;
// How long an asking agent waits before it carries on without an answer.
export const ASK_WAIT_MS = 120_000;
