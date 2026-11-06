import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanEntry, MEMORY_MAX, type MemoryCommand, type MemoryEntry, type MemoryRecord, type MemoryStore } from "../shared/memory";
import { config } from "./config";
import { appendLog, getRun, patchRun } from "./store";

const file = () => join(config.dataDir, "memory.json");

// Survives `bun --hot` reloads, so saves stay in order and nothing loaded is read twice.
const g = globalThis as typeof globalThis & { __satgasMemory?: { store: MemoryStore; loaded: boolean; saving: Promise<unknown> } };
g.__satgasMemory ??= { store: { entries: [], auto: true }, loaded: false, saving: Promise.resolve() };
const state = g.__satgasMemory;

export async function loadMemory() {
  if (state.loaded) return;
  state.loaded = true;
  const f = Bun.file(file());
  if (!(await f.exists())) return;
  try {
    const data = (await f.json()) as Partial<MemoryStore>;
    const entries = (Array.isArray(data.entries) ? data.entries : []).flatMap((e) => {
      const clean = cleanEntry(e, e as MemoryEntry, (e as MemoryEntry).updatedAt);
      return typeof clean === "string" ? [] : [clean];
    });
    state.store = { entries, auto: data.auto !== false };
  } catch (e) {
    console.error(`Could not read ${file()}: ${(e as Error).message}`);
  }
}

// Written whole to a temp file and renamed; what someone is like is personal, so only this user may read it.
function save() {
  const next = state.saving.then(async () => {
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    const tmp = `${file()}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(state.store, null, 2), { mode: 0o600 });
      await rename(tmp, file());
    } catch (e) {
      await rm(tmp, { force: true }).catch(() => {});
      console.error(`Could not save memory: ${(e as Error).message}`);
    }
  });
  state.saving = next;
  return next;
}

export const getMemory = () => state.store;
const newId = () => crypto.randomUUID().slice(0, 8);

export async function setAuto(auto: boolean) {
  state.store = { ...state.store, auto };
  await save();
}

// The person's own entry from the Memory page, new or edited.
export async function putEntry(input: unknown, id?: string): Promise<MemoryEntry | string> {
  const before = id ? state.store.entries.find((e) => e.id === id) : undefined;
  if (id && !before) return "That entry no longer exists.";
  if (!id && state.store.entries.length >= MEMORY_MAX) return `Memory holds up to ${MEMORY_MAX} entries; delete some first.`;
  const entry = cleanEntry(input, before ?? { id: newId(), source: { by: "person" }, createdAt: Date.now() });
  if (typeof entry === "string") return entry;
  state.store = {
    ...state.store,
    entries: before ? state.store.entries.map((e) => (e.id === id ? entry : e)) : [entry, ...state.store.entries],
  };
  await save();
  return entry;
}

export async function deleteEntry(id: string): Promise<boolean> {
  if (!state.store.entries.some((e) => e.id === id)) return false;
  state.store = { ...state.store, entries: state.store.entries.filter((e) => e.id !== id) };
  await save();
  return true;
}

const same = (a: string, b: string) =>
  a
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim() ===
  b
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// What the lead decided to remember, update or forget in one round; each change is shown in the chat with an undo.
export async function applyMemory(runId: string, round: number, commands: MemoryCommand[]): Promise<void> {
  const run = getRun(runId);
  if (!run || run.noMemory || !state.store.auto || !commands.length) return;
  const record: MemoryRecord = { changes: [] };
  let entries = [...state.store.entries];
  const now = Date.now();
  for (const c of commands) {
    if (c.op === "forget") {
      const gone = entries.find((e) => e.id === c.id);
      if (!gone) continue;
      entries = entries.filter((e) => e.id !== c.id);
      record.changes.push({ op: "removed", id: gone.id, kind: gone.kind, text: gone.text, before: gone });
      continue;
    }
    const kind = c.op === "rule" ? "rule" : "memory";
    // An entry that says the same thing is refreshed rather than saved twice.
    const old = entries.find((e) => e.id === c.replaces) ?? entries.find((e) => e.kind === kind && same(e.text, c.text));
    const entry = cleanEntry(
      { kind, text: c.text, why: c.why, ...(c.op === "rule" ? { scope: c.scope } : { type: c.type }), enabled: old?.enabled ?? true },
      old ?? { id: newId(), source: { by: "lead", boardId: runId, round }, createdAt: now },
      now,
    );
    if (typeof entry === "string") continue;
    if (old) {
      if (old.text === entry.text && old.why === entry.why && old.scope === entry.scope && old.type === entry.type) continue;
      entries = entries.map((e) => (e.id === old.id ? entry : e));
      record.changes.push({ op: "updated", id: entry.id, kind, text: entry.text, before: old });
    } else {
      if (entries.length >= MEMORY_MAX) break;
      entries = [entry, ...entries];
      record.changes.push({ op: "added", id: entry.id, kind, text: entry.text });
    }
  }
  if (!record.changes.length) return;
  state.store = { ...state.store, entries };
  await save();
  patchRun(runId, { memories: { ...getRun(runId)?.memories, [round]: record } });
  // Every change is in the lead's activity too, so it shows wherever the lead's work is read.
  const verb = {
    added: { memory: "Remembered", rule: "Added rule" },
    updated: { memory: "Updated memory", rule: "Updated rule" },
    removed: { memory: "Forgot", rule: "Removed rule" },
  };
  for (const c of record.changes) appendLog(runId, "planner", { kind: "info", text: `${verb[c.op][c.kind]}: ${c.text}` });
}

// Puts memory back as it was before one round's changes.
export async function undoMemory(runId: string, round: number): Promise<string | null> {
  const run = getRun(runId);
  const record = run?.memories?.[round];
  if (!record) return "Nothing was remembered in that round.";
  if (record.undone) return "Already undone.";
  let entries = [...state.store.entries];
  for (const c of [...record.changes].reverse()) {
    if (c.op === "added") entries = entries.filter((e) => e.id !== c.id || e.source.by === "person");
    else if (c.before) {
      const restored = c.before;
      entries = entries.some((e) => e.id === c.id) ? entries.map((e) => (e.id === c.id ? restored : e)) : [restored, ...entries];
    }
  }
  state.store = { ...state.store, entries };
  await save();
  patchRun(runId, { memories: { ...run.memories, [round]: { ...record, undone: true } } });
  appendLog(runId, "planner", { kind: "info", text: "Undid what this round remembered" });
  return null;
}
