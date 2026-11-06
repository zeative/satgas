// Before planning, the planner may ask a few short questions, each with likely answers to pick from.
export interface Question {
  // A chip-sized name for what is asked, like "Platform".
  header: string;
  question: string;
  options: { label: string; description: string }[];
  multiSelect: boolean;
}

// One reply: the options picked, and the person's own words when none fit.
export interface Answer {
  picked: string[];
  own?: string;
}

export interface Asked {
  questions: Question[];
  // Absent while the planner waits for the person.
  answers?: Answer[];
}

export const MAX_QUESTIONS = 4;
export const MAX_OPTIONS = 4;
const MAX_OWN = 2000;

// The person can always type their own answer, so an option that only says "other" is noise.
const CATCH_ALL = new Set(["other", "others", "something else", "lainnya", "lain-lain", "yang lain"]);

const line = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

// What the planner asked, cut to what the card can show; a question left with fewer than two options is dropped.
export function cleanQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  const out: Question[] = [];
  for (const q of raw) {
    const question = line(q?.question, 300);
    const seen = new Set<string>();
    const options: Question["options"] = [];
    for (const o of Array.isArray(q?.options) ? q.options : []) {
      const label = line(o?.label, 60);
      const key = label.toLowerCase();
      if (!label || seen.has(key) || CATCH_ALL.has(key)) continue;
      seen.add(key);
      options.push({ label, description: line(o?.description, 160) });
    }
    if (!question || options.length < 2) continue;
    out.push({
      header: line(q?.header, 24) || question.slice(0, 24),
      question,
      options: options.slice(0, MAX_OPTIONS),
      multiSelect: q?.multiSelect === true,
    });
    if (out.length === MAX_QUESTIONS) break;
  }
  return out;
}

// Replies checked against what was asked: only offered options count, a single-choice question keeps one,
// and every question needs a pick or the person's own words. Null when the replies don't fit the questions.
export function cleanAnswers(raw: unknown, questions: Question[]): Answer[] | null {
  if (!Array.isArray(raw) || raw.length !== questions.length) return null;
  const out: Answer[] = [];
  for (const [i, q] of questions.entries()) {
    const a = raw[i];
    const offered = new Set(q.options.map((o) => o.label));
    const chosen = Array.isArray(a?.picked) ? a.picked : [];
    const picked = [...new Set<string>(chosen.filter((p: unknown): p is string => typeof p === "string" && offered.has(p)))];
    const own = typeof a?.own === "string" ? a.own.trim().slice(0, MAX_OWN) : "";
    const kept = q.multiSelect ? picked : picked.slice(0, 1);
    if (!kept.length && !own) return null;
    out.push(own ? { picked: kept, own } : { picked: kept });
  }
  return out;
}

// What one reply says, in plain words: the picks, then the person's own words.
export const answerText = (a: Answer | undefined) => [a?.picked.join(", "), a?.own].filter(Boolean).join("; ");

// The questions and replies for the planner and for the agents doing the work.
export function describeAnswers(asked: Asked): string {
  return asked.questions
    .map((q, i) => `- ${q.question}\n  ${(answerText(asked.answers?.[i]) || "(no answer)").replace(/\n/g, "\n  ")}`)
    .join("\n");
}
