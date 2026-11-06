// Reads JSON that is still being written (a model streaming its plan), so what is already there can show before the
// end arrives. An open string and open brackets are closed and a dangling key or half a literal is dropped; undefined
// when nothing usable is there yet.

function scan(text: string): { inString: boolean; escaped: boolean; stack: string[] } {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  return { inString, escaped, stack };
}

const closeString = (text: string) => {
  const { inString, escaped } = scan(text);
  return inString ? `${escaped ? text.slice(0, -1) : text}"` : text;
};
const closeBrackets = (text: string) => text + scan(text).stack.reverse().join("");

// Tried in order whenever the text does not parse yet: a key with no value, half a literal, a trailing comma or colon.
const TRIMS: ((s: string) => string)[] = [
  (s) => s.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, ""),
  (s) => s.replace(/([{,])\s*"(?:[^"\\]|\\.)*"\s*$/, "$1"),
  (s) => s.replace(/(?<=[:,[]\s*)[\w.+-]+$/, ""),
  (s) => s.replace(/[,:]\s*$/, ""),
];

export function parsePartial(text: string): unknown {
  let s = closeString(text.trim());
  if (!s) return undefined;
  for (let i = 0; i < 8; i++) {
    try {
      return JSON.parse(closeBrackets(s));
    } catch {}
    const next = TRIMS.map((trim) => trim(s)).find((t) => t !== s);
    if (next === undefined) return undefined;
    s = next;
  }
  return undefined;
}
