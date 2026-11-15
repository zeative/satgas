import { readFile, rename, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

// Words a person rewrote on the page in the design panel, written straight into the source line the element came from,
// the way a design tool's text edit lands at once. Only a plain, unambiguous replacement is made: the old words found
// once near that line, and new words with nothing that would change the markup around them. Anything else goes to the
// team with the rest of the request.

const NEAR = 25;
// Characters that mean more than text in JSX, HTML or a template, so new words carrying them need a person's care.
const MARKUP = /[<>{}`$\\]/;
const MAX = 2000;

export type TextWrite = { ok: true; file: string } | { ok: false; reason: string };

export function parseLoc(loc: string): { file: string; line: number } | null {
  const m = /^(.+?):(\d+)(?::\d+)?$/.exec(loc.trim());
  return m?.[1] && m[2] ? { file: m[1], line: Number(m[2]) } : null;
}

export async function writeText(dir: string, loc: string, from: string, to: string): Promise<TextWrite> {
  const at = parseLoc(loc);
  if (!at) return { ok: false, reason: "no source line" };
  const old = from.trim();
  const next = to.trim();
  if (!old || !next || old.length > MAX || next.length > MAX) return { ok: false, reason: "empty or too long" };
  if (MARKUP.test(next) || next.includes("\n")) return { ok: false, reason: "markup in the new words" };
  const file = resolve(dir, at.file);
  if (file !== dir && !file.startsWith(dir + sep)) return { ok: false, reason: "outside the app" };
  if (/(^|[\\/])node_modules[\\/]/.test(file)) return { ok: false, reason: "a dependency" };
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return { ok: false, reason: "file not found" };
  const lines = text.split("\n");
  // Every place the old words start, by line; only those near the element's own line count.
  const hits: number[] = [];
  let i = text.indexOf(old);
  while (i !== -1) {
    const line = text.slice(0, i).split("\n").length;
    if (Math.abs(line - at.line) <= NEAR) hits.push(i);
    i = text.indexOf(old, i + 1);
  }
  if (hits.length !== 1 || hits[0] === undefined) return { ok: false, reason: hits.length ? "found more than once" : "not found" };
  const start = hits[0];
  const updated = text.slice(0, start) + next + text.slice(start + old.length);
  if (lines.length !== updated.split("\n").length) return { ok: false, reason: "line count changed" };
  const tmp = `${file}.satgas-${crypto.randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, updated);
  await rename(tmp, file);
  return { ok: true, file: relative(dir, file) };
}
