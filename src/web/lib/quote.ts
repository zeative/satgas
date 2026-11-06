// Passages cited from the chat ride at the head of the next message as markdown quotes, which every agent reads as
// "about this part".
export const MAX_QUOTES = 3;
export const QUOTE_MAX = 1200;

const tidy = (q: string) =>
  q
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, QUOTE_MAX);

export function withQuotes(text: string, quotes: string[]): string {
  const parts = quotes.map(tidy).filter(Boolean);
  if (!parts.length) return text;
  const block = parts
    .map((q) =>
      q
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n"),
    )
    .join("\n>\n");
  return `${block}\n\n${text}`;
}

// The quotes a message opens with, each one separated by a bare ">", and what was written after them.
export function splitQuotes(text: string): { quotes: string[]; rest: string } {
  const lines = text.split("\n");
  const quotes: string[] = [];
  let current: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.startsWith(">")) break;
    const body = line.replace(/^> ?/, "");
    if (body.trim()) current.push(body);
    else if (current.length) {
      quotes.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length) quotes.push(current.join("\n"));
  if (!quotes.length) return { quotes, rest: text };
  return { quotes, rest: lines.slice(i).join("\n").trim() };
}
