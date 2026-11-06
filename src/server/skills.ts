import { mkdir, readdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  MAX_DESCRIPTION,
  parseGithubSource,
  readSkillFile,
  type Skill,
  type SkillFind,
  type SkillSource,
  slugSkill,
  validSkillName,
  writeSkillFile,
} from "../shared/skills";
import { BUILTIN, OPTIONAL, packOf } from "./builtin-skills";
import { config } from "./config";
import { readZip, writeZip } from "./zip";

// Skills live in Satgas's own data folder, never in ~/.claude or a project; the index says where each came from.
interface Entry {
  enabled: boolean;
  source: SkillSource;
  installedAt: number;
}
type Index = Record<string, Entry>;

interface Found {
  name: string;
  description: string;
  path: string;
  files: Map<string, Uint8Array>;
}
interface Stage {
  source: SkillSource;
  found: Found[];
  at: number;
}

export interface EnabledSkill {
  name: string;
  description: string;
  file: string;
  // Shipped with Satgas: every agent gets it, so the planner and the composer leave it out.
  builtin?: boolean;
}

interface SkillState {
  index: Index | null;
  enabled: EnabledSkill[];
  stages: Map<string, Stage>;
  queue: Promise<unknown>;
}

// Kept across `bun --hot` reloads like the run store.
const g = globalThis as typeof globalThis & { __satgasSkills?: SkillState };
g.__satgasSkills ??= { index: null, enabled: [], stages: new Map(), queue: Promise.resolve() };
const state = g.__satgasSkills;

const root = () => join(config.dataDir, "skills");
// Built-in skills are written here at every start, apart from installed ones, so no install can land on them.
const builtinRoot = () => join(config.dataDir, "skills-builtin");
const isBuiltin = (name: string) => Object.hasOwn(BUILTIN, name);
// Where a skill's files are.
const dirOf = (name: string) => join(isBuiltin(name) ? builtinRoot() : root(), name);
const indexFile = () => join(config.dataDir, "skills.json");
export const pluginRoot = () => join(config.dataDir, "skills-plugin");

const MAX_DOWNLOAD = 50 * 1024 * 1024;
const MAX_SKILL_BYTES = 10 * 1024 * 1024;
const MAX_SKILL_FILES = 500;
const MAX_BODY = 100_000;
// A search waits this long for the person to pick what to install.
const STAGE_TTL = 15 * 60_000;
// Folders other tools keep their skills in, offered for import.
const LOCAL_ROOTS = ["~/.claude/skills", "~/.agents/skills", "~/.codex/skills"];

export async function loadSkills(): Promise<Index> {
  if (state.index) return state.index;
  const index = (await readFile(indexFile(), "utf8").then(JSON.parse, () => ({}))) as Index;
  // Built-in skills are always on, since every task relies on them, so an older "off" in the index is ignored. Optional
  // ones start on and keep the person's switch.
  for (const name of Object.keys(BUILTIN)) {
    const on = Object.hasOwn(OPTIONAL, name) ? (index[name]?.enabled ?? true) : true;
    index[name] = { enabled: on, source: { kind: "builtin" }, installedAt: index[name]?.installedAt ?? 0 };
  }
  state.index = index;
  await describeEnabled(index);
  return index;
}

// Writes the built-in skills out from the copy inside Satgas, then rebuilds what the agents read. Runs at every start.
export async function prepareSkills() {
  for (const [name, files] of Object.entries(BUILTIN)) {
    const dir = join(builtinRoot(), name);
    await rm(dir, { recursive: true, force: true });
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(join(dir, rel, ".."), { recursive: true });
      await writeFile(join(dir, rel), text);
    }
  }
  // Read again from disk, so a reload with new built-in skills (or a new data folder) starts from the truth.
  state.index = null;
  const index = await loadSkills();
  await buildPlugin(index);
  await describeEnabled(index);
}

// The skills agents get, for code that cannot wait on the disk (building a command line or a prompt).
export const enabledSkills = (): EnabledSkill[] => state.enabled;

async function describeEnabled(index: Index) {
  const on: EnabledSkill[] = [];
  for (const [name, e] of Object.entries(index)) {
    if (!e.enabled) continue;
    const file = join(dirOf(name), "SKILL.md");
    const md = await readFile(file, "utf8").catch(() => null);
    if (md !== null)
      on.push({ name, description: readSkillFile(md).description ?? "", file, ...(isBuiltin(name) ? { builtin: true } : {}) });
  }
  state.enabled = on.sort((a, b) => a.name.localeCompare(b.name));
}

// One change at a time, so the index file and the plugin folder never interleave.
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = state.queue.then(fn, fn);
  state.queue = next.catch(() => {});
  return next;
}

async function saveIndex(index: Index) {
  state.index = index;
  await mkdir(config.dataDir, { recursive: true });
  const tmp = `${indexFile()}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(index, null, 2), { mode: 0o600 });
  await rename(tmp, indexFile());
  await buildPlugin(index);
  await describeEnabled(index);
}

// Claude Code loads skills from a plugin folder named on its command line; enabled skills are linked into it.
export async function buildPlugin(index: Index) {
  const base = pluginRoot();
  await rm(join(base, "skills"), { recursive: true, force: true });
  await mkdir(join(base, ".claude-plugin"), { recursive: true });
  await mkdir(join(base, "skills"), { recursive: true });
  const manifest = { name: "satgas-skills", version: "1.0.0", description: "Skills installed in Satgas" };
  await writeFile(join(base, ".claude-plugin", "plugin.json"), JSON.stringify(manifest));
  for (const [name, e] of Object.entries(index)) if (e.enabled) await symlink(dirOf(name), join(base, "skills", name), "dir");
}

export async function listSkills(): Promise<Skill[]> {
  const index = await loadSkills();
  const out: Skill[] = [];
  for (const [name, e] of Object.entries(index)) {
    const md = await readFile(join(dirOf(name), "SKILL.md"), "utf8").catch(() => null);
    if (md === null) continue;
    const files = (await readdir(dirOf(name), { recursive: true, withFileTypes: true })).filter((f) => f.isFile()).length;
    out.push({
      name,
      description: readSkillFile(md).description ?? "",
      enabled: e.enabled,
      source: e.source,
      installedAt: e.installedAt,
      files,
      ...(packOf(name) ? { pack: packOf(name) } : {}),
      ...(Object.hasOwn(OPTIONAL, name) ? { optional: true, repo: OPTIONAL[name]?.repo } : {}),
    });
  }
  // Satgas's own skill leads, then the other built-in skills, then the person's, each by name.
  const rank = (name: string) => (name === "satgas" ? 0 : isBuiltin(name) ? 1 : 2);
  return out.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

// A skill's own words, for editing one written in Satgas.
export async function readSkill(name: string): Promise<{ name: string; description: string; body: string; source: SkillSource } | null> {
  const index = await loadSkills();
  const entry = index[name];
  if (!entry || !validSkillName(name)) return null;
  const md = await readFile(join(dirOf(name), "SKILL.md"), "utf8").catch(() => null);
  if (md === null) return null;
  const meta = readSkillFile(md);
  return { name, description: meta.description ?? "", body: meta.body.trim(), source: entry.source };
}

// Writes a skill from the form; `previous` renames one written before. Returns the problem when the input is not usable.
export function saveOwnSkill(input: unknown, previous?: string): Promise<string | null> {
  return serial(async () => {
    const body = input as { name?: unknown; description?: unknown; body?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!validSkillName(name)) return "Use lowercase letters, numbers and single hyphens, up to 64 characters.";
    if (!description) return "Say when the skill should be used; agents decide from this line.";
    if (description.length > MAX_DESCRIPTION) return `Keep the description under ${MAX_DESCRIPTION} characters.`;
    if (!text) return "Write the instructions the agent should follow.";
    if (text.length > MAX_BODY) return "The instructions are too long.";
    const index = { ...(await loadSkills()) };
    if (previous !== undefined && index[previous]?.source.kind !== "own") return "Only skills written here can be edited.";
    if (name !== previous && index[name]) return "A skill with this name already exists.";
    if (previous !== undefined && previous !== name) {
      await rename(join(root(), previous), join(root(), name));
      index[name] = index[previous] as Entry;
      delete index[previous];
    }
    await mkdir(join(root(), name), { recursive: true });
    await writeFile(join(root(), name, "SKILL.md"), writeSkillFile(name, description, text));
    index[name] = { enabled: index[name]?.enabled ?? true, source: { kind: "own" }, installedAt: index[name]?.installedAt ?? Date.now() };
    await saveIndex(index);
    return null;
  });
}

export function setSkillEnabled(name: string, enabled: boolean): Promise<"ok" | "missing" | "builtin"> {
  return serial(async () => {
    const index = await loadSkills();
    const entry = index[name];
    if (!entry) return "missing";
    if (isBuiltin(name) && !Object.hasOwn(OPTIONAL, name)) return "builtin";
    await saveIndex({ ...index, [name]: { ...entry, enabled } });
    return "ok";
  });
}

export function deleteSkill(name: string): Promise<"ok" | "missing" | "builtin"> {
  return serial(async () => {
    const index = { ...(await loadSkills()) };
    if (!index[name] || !validSkillName(name)) return "missing";
    if (isBuiltin(name)) return "builtin";
    delete index[name];
    await saveIndex(index);
    await rm(join(root(), name), { recursive: true, force: true });
    return "ok";
  });
}

export interface SkillFileInfo {
  path: string;
  size: number;
}

// Every file of a skill, for its Contents tab.
export async function skillFiles(name: string): Promise<SkillFileInfo[] | null> {
  const index = await loadSkills();
  if (!index[name] || !validSkillName(name)) return null;
  const dir = dirOf(name);
  const out: SkillFileInfo[] = [];
  for (const e of await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])) {
    if (!e.isFile()) continue;
    const full = join(e.parentPath, e.name);
    const rel = full
      .slice(dir.length + 1)
      .split("\\")
      .join("/");
    out.push({ path: rel, size: (await stat(full)).size });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const MAX_SHOWN = 512 * 1024;

// One file of a skill as text; binary or very large files are named but not shown.
export async function skillFile(name: string, path: unknown): Promise<{ path: string; size: number; text?: string } | null> {
  const index = await loadSkills();
  if (!index[name] || !validSkillName(name) || typeof path !== "string" || !safeRel(path)) return null;
  const full = join(dirOf(name), path);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) return null;
  if (info.size > MAX_SHOWN) return { path, size: info.size };
  const bytes = new Uint8Array(await readFile(full));
  // A NUL byte in the first few KB means it is not text.
  if (bytes.subarray(0, 8000).includes(0)) return { path, size: info.size };
  return { path, size: info.size, text: new TextDecoder().decode(bytes) };
}

// The skill folder as a zip, to keep or to share.
export async function skillZip(name: string): Promise<Uint8Array | null> {
  const files = await skillFiles(name);
  if (!files) return null;
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[`${name}/${f.path}`] = new Uint8Array(await readFile(join(dirOf(name), f.path)));
  return writeZip(entries);
}

// A path from an archive that stays inside the skill's folder; anything else is skipped.
export function safeRel(path: string): boolean {
  if (!path || path.length > 512 || path.startsWith("/") || /[\\\0]/.test(path)) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

const IGNORED = /(^|\/)(\.git|node_modules|__pycache__|\.DS_Store)(\/|$)/;

// Every folder holding a SKILL.md becomes a skill with the files beneath it; a skill inside another one belongs to it.
export function pickSkills(entries: Map<string, Uint8Array>, fallback: string, prefix = ""): Found[] {
  const dirs = [...entries.keys()]
    .filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md"))
    .map((p) => p.slice(0, -"SKILL.md".length).replace(/\/$/, ""))
    .sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const d of dirs) if (!kept.some((k) => k === "" || d.startsWith(`${k}/`))) kept.push(d);
  const found: Found[] = [];
  for (const dir of kept) {
    const lead = dir ? `${dir}/` : "";
    const files = new Map<string, Uint8Array>();
    let size = 0;
    for (const [path, data] of entries) {
      if (!path.startsWith(lead)) continue;
      const rel = path.slice(lead.length);
      if (!safeRel(rel) || IGNORED.test(rel)) continue;
      size += data.byteLength;
      files.set(rel, data);
    }
    if (files.size > MAX_SKILL_FILES || size > MAX_SKILL_BYTES) continue;
    const md = readSkillFile(new TextDecoder().decode(files.get("SKILL.md")));
    const name = md.name && validSkillName(md.name) ? md.name : slugSkill(md.name || basename(dir) || fallback);
    if (!name || found.some((f) => f.name === name)) continue;
    const description = (md.description ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION);
    found.push({ name, description, path: [prefix, dir].filter(Boolean).join("/"), files });
  }
  return found;
}

function stage(source: SkillSource, found: Found[], installed: Index): { stage: string; found: SkillFind[] } {
  const now = Date.now();
  for (const [id, s] of state.stages) if (now - s.at > STAGE_TTL) state.stages.delete(id);
  const id = crypto.randomUUID();
  state.stages.set(id, { source, found, at: now });
  return {
    stage: id,
    found: found.map((f) => ({
      name: f.name,
      description: f.description,
      path: f.path,
      files: f.files.size,
      installed: !!installed[f.name],
    })),
  };
}

async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!res.body) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.byteLength;
    if (size > max) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

type GithubSource = { owner: string; repo: string; ref?: string; path?: string };
const GITHUB_HEADERS = { accept: "application/vnd.github+json", "user-agent": "satgas" };
// Files fetched at once from raw.githubusercontent.com when only the skill folders are downloaded.
const RAW_PARALLEL = 8;

// Only the folders holding a SKILL.md, read from the repo's file list: a repo with big assets (a site, photos, models)
// next to its skills stays cheap. Null when the list can't be read (rate limit, truncated tree), so the tarball is used.
async function skillEntriesFromTree(src: GithubSource): Promise<Map<string, Uint8Array> | "missing" | "large" | null> {
  const ref = src.ref ?? "HEAD";
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${src.owner}/${src.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, {
      headers: GITHUB_HEADERS,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return null;
  }
  if (res.status === 404) return "missing";
  if (!res.ok) return null;
  const tree = (await res.json().catch(() => null)) as {
    truncated?: boolean;
    tree?: { path: string; type: string; size?: number }[];
  } | null;
  if (!tree?.tree || tree.truncated) return null;
  const base = src.path ? `${src.path}/` : "";
  const blobs = tree.tree.filter((e) => e.type === "blob" && e.path.startsWith(base));
  const dirs = blobs
    .filter((e) => e.path === `${base}SKILL.md` || e.path.endsWith("/SKILL.md"))
    .map((e) => e.path.slice(0, -"SKILL.md".length));
  if (!dirs.length) return new Map();
  const wanted = blobs.filter((e) => dirs.some((d) => e.path.startsWith(d)) && !IGNORED.test(e.path));
  const bytes = wanted.reduce((n, e) => n + (e.size ?? 0), 0);
  if (bytes > MAX_DOWNLOAD || wanted.length > MAX_SKILL_FILES * 4) return "large";
  const entries = new Map<string, Uint8Array>();
  const queue = [...wanted];
  const worker = async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      const path = e.path.split("/").map(encodeURIComponent).join("/");
      const got = await fetch(`https://raw.githubusercontent.com/${src.owner}/${src.repo}/${encodeURIComponent(ref)}/${path}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!got.ok) throw new Error(`GitHub answered ${got.status} for ${e.path}.`);
      entries.set(e.path.slice(base.length), new Uint8Array(await got.arrayBuffer()));
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(RAW_PARALLEL, wanted.length) }, worker));
  } catch {
    return null;
  }
  return entries;
}

// The whole repo as one tarball, cut down to the linked folder; the fallback when the file list can't be read.
async function skillEntriesFromTarball(src: GithubSource): Promise<Map<string, Uint8Array> | string> {
  const url = `https://codeload.github.com/${src.owner}/${src.repo}/tar.gz/${encodeURIComponent(src.ref ?? "HEAD")}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch {
    return "GitHub could not be reached. Check the connection and try again.";
  }
  if (res.status === 404) return "That repo or branch was not found. Private repos are not supported yet.";
  if (!res.ok) return `GitHub answered ${res.status}. Try again in a moment.`;
  const bytes = await readCapped(res, MAX_DOWNLOAD);
  if (!bytes) return "That repo is larger than 50 MB and GitHub would not list its files. Try again in a few minutes.";
  const archive = new Bun.Archive(bytes);
  const within = src.path ? `*/${src.path}/` : "*/";
  const markers = await archive.files(`${within}**/SKILL.md`);
  const entries = new Map<string, Uint8Array>();
  if (!markers.size) return entries;
  const dirs = [...markers.keys()].map((p) => p.slice(0, -"SKILL.md".length));
  const base = src.path ? `${src.path}/` : "";
  for (const [path, file] of await archive.files(dirs.map((d) => `${d}**`))) {
    // Tarball paths start with "<repo>-<commit>/".
    const rel = path.slice(path.indexOf("/") + 1);
    if (rel.startsWith(base)) entries.set(rel.slice(base.length), new Uint8Array(await file.arrayBuffer()));
  }
  return entries;
}

// Only SKILL.md folders are downloaded and kept in memory, from the repo or the folder that was linked.
export async function findOnGithub(input: unknown): Promise<{ stage: string; found: SkillFind[] } | string> {
  const src = typeof input === "string" ? parseGithubSource(input) : null;
  if (!src) return "Paste a GitHub repo, like owner/repo, or a link to a folder in it.";
  const listed = await skillEntriesFromTree(src);
  if (listed === "missing") return "That repo or branch was not found. Private repos are not supported yet.";
  if (listed === "large") return "The skills in that repo add up to more than 50 MB. Link one skill's folder instead.";
  const entries = listed ?? (await skillEntriesFromTarball(src));
  if (typeof entries === "string") return entries;
  if (!entries.size) return src.path ? `No SKILL.md was found under ${src.path}.` : "No SKILL.md was found in that repo.";
  const repo = `${src.owner}/${src.repo}`;
  const found = pickSkills(entries, src.path ? basename(src.path) : src.repo, src.path);
  if (!found.length) return "The skills there are too large or have no usable files.";
  return stage({ kind: "github", repo, ...(src.ref ? { ref: src.ref } : {}) }, found, await loadSkills());
}

// An uploaded .zip (or .tar.gz) holding one skill folder or several.
export async function findInArchive(bytes: Uint8Array, fileName: string): Promise<{ stage: string; found: SkillFind[] } | string> {
  if (bytes.byteLength > MAX_DOWNLOAD) return "The file is larger than 50 MB.";
  const entries = new Map<string, Uint8Array>();
  try {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      for (const [path, file] of await new Bun.Archive(bytes).files())
        entries.set(path.replace(/^\.\//, ""), new Uint8Array(await file.arrayBuffer()));
    } else {
      for (const [path, data] of readZip(bytes)) entries.set(path, data);
    }
  } catch (e) {
    return (e as Error).message || "The file could not be read as a zip.";
  }
  const found = pickSkills(entries, slugSkill(fileName.replace(/\.(zip|tar\.gz|tgz)$/i, "")) || "skill");
  if (!found.length) return "No SKILL.md was found in that file.";
  return stage({ kind: "zip", file: fileName.slice(0, 120) }, found, await loadSkills());
}

async function readTree(dir: string, into: Map<string, Uint8Array>, prefix = "", depth = 0): Promise<void> {
  if (depth > 6 || into.size > MAX_SKILL_FILES) return;
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (IGNORED.test(rel)) continue;
    // stat follows links, so a skill folder that is itself a symlink reads like any other.
    const info = await stat(full).catch(() => null);
    if (info?.isDirectory()) await readTree(full, into, rel, depth + 1);
    else if (info?.isFile() && info.size <= MAX_SKILL_BYTES) into.set(rel, new Uint8Array(await readFile(full)));
  }
}

// Skills already set up for Claude Code or Codex on this machine.
export async function findLocal(home = homedir()): Promise<{ stage: string; found: SkillFind[] } | string> {
  const found: Found[] = [];
  for (const shown of LOCAL_ROOTS) {
    const dir = shown.replace(/^~/, home);
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (found.some((f) => f.name === name)) continue;
      const md = await stat(join(dir, name, "SKILL.md")).catch(() => null);
      if (!md?.isFile()) continue;
      const files = new Map<string, Uint8Array>();
      await readTree(join(dir, name), files);
      for (const f of pickSkills(files, name, `${shown}/${name}`)) if (!found.some((x) => x.name === f.name)) found.push(f);
    }
  }
  if (!found.length) return `No skills were found in ${LOCAL_ROOTS.join(", ")}.`;
  return stage({ kind: "import", from: "" }, found, await loadSkills());
}

// Installs the picked skills from a search; one already installed under the same name is replaced.
export function installFound(stageId: unknown, names: unknown): Promise<string | null> {
  return serial(async () => {
    const found = typeof stageId === "string" ? state.stages.get(stageId) : undefined;
    if (!found || Date.now() - found.at > STAGE_TTL) return "That search has expired. Look the skills up again.";
    const picked = Array.isArray(names) ? found.found.filter((f) => names.includes(f.name)) : [];
    if (!picked.length) return "Pick at least one skill to install.";
    const taken = picked.find((f) => isBuiltin(f.name));
    if (taken) return `${taken.name} is built into Satgas and cannot be replaced.`;
    const index = { ...(await loadSkills()) };
    await mkdir(root(), { recursive: true });
    for (const f of picked) {
      const tmp = join(root(), `.${f.name}.${crypto.randomUUID()}.tmp`);
      for (const [rel, data] of f.files) {
        await mkdir(join(tmp, rel, ".."), { recursive: true });
        await writeFile(join(tmp, rel), data);
      }
      await rm(join(root(), f.name), { recursive: true, force: true });
      await rename(tmp, join(root(), f.name));
      const source: SkillSource =
        found.source.kind === "github"
          ? { ...found.source, ...(f.path ? { path: f.path } : {}) }
          : found.source.kind === "import"
            ? { kind: "import", from: f.path }
            : found.source;
      index[f.name] = { enabled: index[f.name]?.enabled ?? true, source, installedAt: Date.now() };
    }
    await saveIndex(index);
    state.stages.delete(stageId as string);
    return null;
  });
}
