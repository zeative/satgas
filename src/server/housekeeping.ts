import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { StorageReport } from "../shared/housekeeping";
import { config } from "./config";
import { getRun, listRunIds, ownWorkspace } from "./store";

// What an agent's work can make again with one install or build. Never `dist` or `build`: they may be the result itself.
const REMAKEABLE = new Set(["node_modules", ".next", ".nuxt", ".turbo", ".svelte-kit", ".parcel-cache", "__pycache__", ".venv"]);
const DEPTH = 6;
const LIVE = new Set(["planning", "running"]);

async function sizeOf(path: string): Promise<number> {
  try {
    const proc = Bun.spawn(["du", "-sk", path], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return (Number.parseInt(out, 10) || 0) * 1024;
  } catch {
    return 0;
  }
}

// Real folders only: a worktree links its node_modules, and following that link would reach the person's own project.
export async function remakeable(dir: string, depth = DEPTH): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const path = join(dir, e.name);
    if (REMAKEABLE.has(e.name)) found.push(path);
    else if (depth > 0 && e.name !== ".git") found.push(...(await remakeable(path, depth - 1)));
  }
  return found;
}

async function inTurns<T, R>(items: T[], job: (item: T) => Promise<R>, width = 4): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await job(items[i] as T);
      }
    }),
  );
  return out;
}

const KINDS: Record<string, string> = {
  workspaces: "workspaces",
  forks: "forks",
  worktrees: "worktrees",
  history: "history",
  runs: "runs",
  uploads: "uploads",
  secrets: "secrets",
  skills: "skills",
  "skills-builtin": "skills",
  "skills-plugin": "skills",
};

const hot = globalThis as typeof globalThis & { __satgasStorage?: { at: number; report: Promise<StorageReport> } };

// Walks the disk, so one answer serves for a minute unless the page asks again.
export function storageReport(refresh = false): Promise<StorageReport> {
  const cached = hot.__satgasStorage;
  if (!refresh && cached && Date.now() - cached.at < 60_000) return cached.report;
  const report = measure();
  hot.__satgasStorage = { at: Date.now(), report };
  report.catch(() => {
    hot.__satgasStorage = undefined;
  });
  return report;
}

async function measure(): Promise<StorageReport> {
  const names = (await readdir(config.dataDir, { withFileTypes: true }).catch(() => [])).map((e) => e.name);
  const sizes = await inTurns(names, (n) => sizeOf(join(config.dataDir, n)));
  const kinds = new Map<string, number>();
  names.forEach((n, i) => {
    const kind = KINDS[n] ?? "other";
    kinds.set(kind, (kinds.get(kind) ?? 0) + (sizes[i] ?? 0));
  });
  const runs = listRunIds().flatMap((id) => getRun(id) ?? []);
  const own = runs.filter((r) => ownWorkspace(r.cwd));
  const boards = await inTurns(own, async (r) => {
    const parts = await remakeable(r.cwd);
    const cleanable = (await Promise.all(parts.map(sizeOf))).reduce((a, b) => a + b, 0);
    return {
      id: r.id,
      title: r.title ?? r.prompt.slice(0, 80),
      bytes: await sizeOf(r.cwd),
      cleanable,
      live: LIVE.has(r.status),
    };
  });
  return {
    dataDir: config.dataDir,
    total: sizes.reduce((a: number, b) => a + (b ?? 0), 0),
    kinds: [...kinds].map(([kind, bytes]) => ({ kind, bytes })).sort((a, b) => b.bytes - a.bytes),
    boards: boards.sort((a, b) => b.bytes - a.bytes),
    ownFolders: runs.length - own.length,
  };
}

// Only a board's own finished workspace, and only what can be made again. Returns why not, or the bytes it freed.
export async function cleanBoard(id: string): Promise<string | number> {
  const run = getRun(id);
  if (!run) return "Board not found.";
  if (!ownWorkspace(run.cwd)) return "This board works in your own folder, so Satgas leaves it alone.";
  if (LIVE.has(run.status)) return "This board is working right now. Clean it when it is done.";
  const parts = await remakeable(run.cwd);
  const freed = (await Promise.all(parts.map(sizeOf))).reduce((a, b) => a + b, 0);
  await Promise.all(parts.map((p) => rm(p, { recursive: true, force: true })));
  hot.__satgasStorage = undefined;
  return freed;
}
