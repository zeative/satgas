import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

// Design tokens a person changed in the design panel's Tweaks, written straight into the app's stylesheets, the way a
// design tool's edits land at once. Only a token defined in exactly one place is written; one defined twice (light and
// dark, or two themes) is ambiguous, so it goes to the team with the rest of the request.

const EXTS = new Set([".css", ".scss", ".sass", ".less", ".html", ".astro", ".vue", ".svelte"]);
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".nuxt", ".svelte-kit", ".output", ".turbo", ".cache", "coverage"]);
const MAX_FILES = 3000;
const MAX_SIZE = 512 * 1024;
const NAME = /^--[a-zA-Z0-9_-]{1,80}$/;
// A value that stays one declaration: no braces, semicolons or comments that could close the rule or open another.
const VALUE = /^[^;{}<>\n]{1,200}$/;

export interface TokenWrite {
  written: { name: string; file: string }[];
  missed: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const declaration = (name: string) => new RegExp(`(^|[\\s;{])(${escape(name)}\\s*:\\s*)([^;}\\n]+?)(\\s*(?:!important\\s*)?[;}\\n])`, "g");

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    if (out.length >= MAX_FILES) return;
    const entries = await readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) await walk(join(d, e.name));
      } else if (e.isFile()) {
        const dot = e.name.lastIndexOf(".");
        if (dot > 0 && EXTS.has(e.name.slice(dot).toLowerCase())) out.push(join(d, e.name));
      }
    }
  };
  await walk(dir);
  return out;
}

export function cleanTokens(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!NAME.test(k) || typeof v !== "string" || !VALUE.test(v.trim()) || v.includes("/*")) return null;
    out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

export async function writeTokens(dir: string, vars: Record<string, string>): Promise<TokenWrite> {
  const files = await sources(dir);
  const texts = new Map<string, string>();
  for (const f of files) {
    const s = await stat(f).catch(() => null);
    if (!s || s.size > MAX_SIZE) continue;
    const text = await readFile(f, "utf8").catch(() => null);
    if (text?.includes("--")) texts.set(f, text);
  }
  const written: TokenWrite["written"] = [];
  const missed: string[] = [];
  const changed = new Map<string, string>();
  for (const [name, value] of Object.entries(vars)) {
    const hits: string[] = [];
    let count = 0;
    for (const [f, text] of texts) {
      const n = [...(changed.get(f) ?? text).matchAll(declaration(name))].length;
      if (n) hits.push(f);
      count += n;
    }
    const file = hits[0];
    if (count !== 1 || !file) {
      missed.push(name);
      continue;
    }
    const text = changed.get(file) ?? texts.get(file) ?? "";
    changed.set(
      file,
      text.replace(declaration(name), (_m, lead: string, head: string, _old: string, tail: string) => `${lead}${head}${value}${tail}`),
    );
    written.push({ name, file: relative(dir, file) });
  }
  // Each file written to a temp name and renamed, so a dev server never reads half a stylesheet.
  for (const [f, text] of changed) {
    const tmp = `${f}.satgas-${crypto.randomUUID().slice(0, 8)}.tmp`;
    await writeFile(tmp, text);
    await rename(tmp, f);
  }
  return { written, missed };
}
