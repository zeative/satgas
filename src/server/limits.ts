import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type LimitsReport, type LimitWindow, readLimits } from "../shared/usage";
import { config } from "./config";

const file = () => join(config.dataDir, "limits.json");
const hot = globalThis as typeof globalThis & {
  __satgasLimits?: { at: number | null; status: string | null; windows: Record<string, LimitWindow> };
};

async function state() {
  if (!hot.__satgasLimits) {
    const saved = await readFile(file(), "utf8").then(JSON.parse, () => null);
    hot.__satgasLimits ??= saved ?? { at: null, status: null, windows: {} };
  }
  return hot.__satgasLimits as NonNullable<typeof hot.__satgasLimits>;
}

// The CLI says where the person's plan stands with each call; the last word is kept, windows it did not mention included.
export async function noteLimits(info: unknown, now = Date.now()) {
  const seen = readLimits(info, now);
  if (!seen.windows.length) return;
  const s = await state();
  s.at = now;
  s.status = seen.status;
  for (const w of seen.windows) s.windows[w.name] = w;
  await mkdir(config.dataDir, { recursive: true }).catch(() => {});
  await writeFile(file(), JSON.stringify(s), { mode: 0o600 }).catch(() => {});
}

export async function limitsReport(now = Date.now()): Promise<LimitsReport> {
  const s = await state();
  return { at: s.at, status: s.status, windows: Object.values(s.windows).filter((w) => w.resetsAt > now) };
}
