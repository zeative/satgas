import type { Card } from "./board";

// The composer's `/` and `@` tokens: `/name` runs an action or a skill, `@name` or `@"two words"` points at something.
// They stay plain text in the prompt; whatever a token names is looked up when the prompt is planned.
export const ACTIONS = ["ask", "claude", "codex"] as const;
export type Action = (typeof ACTIONS)[number];

// What a round's prompt pointed at, once looked up against the board, its workspace and Integrations.
export interface Refs {
  // /ask: the planner asks before planning.
  ask?: boolean;
  // /claude or /codex: every task goes to this agent.
  only?: "claude" | "codex";
  skills?: string[];
  files?: string[];
  // Card ids.
  cards?: string[];
  // Picture and page cards among them, by id, as files in the working directory.
  media?: Record<string, string>;
  agents?: ("claude" | "codex")[];
  connectors?: string[];
}

// A token starts the text or follows whitespace, so paths like src/app and emails like a@b.com stay prose.
const TOKEN = /(?<=^|\s)(?:\/([a-z0-9][a-z0-9-]*)(?=$|[\s.,;:!?)])|@(?:"([^"\n]+)"|([^\s"]+)))/g;

// Prompt text cut into words and tokens, so the composer and the chat can mark the tokens.
export interface Piece {
  text: string;
  kind?: "/" | "@";
  name?: string;
}

export function splitTokens(text: string): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    // A bare mention gives back the punctuation that ends its sentence.
    const bare = m[3]?.replace(/[.,;:!?)]+$/, "");
    const piece: Piece = m[1]
      ? { text: m[0], kind: "/", name: m[1] }
      : m[2]
        ? { text: m[0], kind: "@", name: m[2].trim() }
        : { text: `@${bare}`, kind: "@", name: bare };
    if (!piece.name) continue;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push(piece);
    at = start + piece.text.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

export function parseTokens(text: string): { slash: string[]; at: string[] } {
  const pieces = splitTokens(text);
  const names = (kind: "/" | "@") => [...new Set(pieces.filter((p) => p.kind === kind).map((p) => p.name ?? ""))];
  return { slash: names("/"), at: names("@") };
}

// How the composer writes a mention: bare when it is one word, quoted when it has spaces.
export const atToken = (name: string) => (/[\s"]/.test(name) ? `@"${name.replace(/"/g, "'")}"` : `@${name}`);

const fileName = (src = "") => {
  const last = src.split(/[?#]/)[0]?.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

// The words a card is mentioned by: its title, the first line of a sticky or a text, or a picture's or page's file name.
export function cardLabel(card: Pick<Card, "title" | "text" | "kind" | "src">): string {
  return (
    card.title ||
    (card.kind === "note" || card.kind === "text" || card.kind === "frame" ? card.text?.trim().split("\n")[0] : "") ||
    (card.kind === "image" || card.kind === "preview" ? fileName(card.src) : "") ||
    ""
  ).slice(0, 80);
}

// What each card on a board is mentioned by, in board order. Pasted screenshots are all called image.png, so later ones get a number.
export function cardMentions(cards: Card[]): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const c of cards) {
    const label = cardLabel(c);
    if (!label || c.kind === "drawing") continue;
    const n = (seen.get(label.toLowerCase()) ?? 0) + 1;
    seen.set(label.toLowerCase(), n);
    out.set(c.id, n === 1 ? label : `${label} ${n}`);
  }
  return out;
}

// A card's content as text for a prompt: markdown for notes and docs, a markdown table for tables, a fence for code.
export function cardContent(card: Card, max = 4000): string {
  let body = "";
  if (card.kind === "table" && card.rows?.length) {
    const [head = [], ...rest] = card.rows;
    const row = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
    body = [row(head), row(head.map(() => "---")), ...rest.map(row)].join("\n");
  } else if (card.kind === "code") body = `\`\`\`${card.lang ?? ""}\n${card.text ?? ""}\n\`\`\``;
  else if (card.kind === "image" || card.kind === "preview") body = card.src ?? "";
  else if (card.kind === "files") body = (card.files ?? []).map((f) => `- ${f.path}`).join("\n");
  else body = card.text ?? "";
  return body.length > max ? `${body.slice(0, max)}…` : body;
}
