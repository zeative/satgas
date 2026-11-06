import { t } from "@/i18n";
import { stripBlocks } from "../../../shared/board-blocks";
import type { LogLine } from "../../../shared/types";
import { classify, isHanded } from "../missions/activity";
import { bare } from "./command";

const base = (s: string) => s.split(/[\\/]/).filter(Boolean).at(-1) ?? s;
const host = (s: string) => {
  try {
    return new URL(s).host || s;
  } catch {
    return s;
  }
};

export type Tail = { seq: number; text: string; code: boolean };

// One log line as the person reads it on the card: the real command, file or words, not a category.
export function tailOf(line: LogLine): Tail | null {
  if (line.kind === "text") {
    const words = stripBlocks(line.text)
      .split("\n")
      .map((l) => l.replace(/[*_`#>]+/g, "").trim())
      .find(Boolean);
    return words ? { seq: line.seq, text: words, code: false } : null;
  }
  if (line.kind !== "tool") return null;
  const act = classify(line.text);
  // What a task was handed is not what it is doing now.
  if (isHanded(act.kind)) return null;
  const d = t.team.doing;
  if (act.kind === "command") return { seq: line.seq, text: `$ ${bare(act.detail)}`, code: true };
  if (act.kind === "edit") return { seq: line.seq, text: d.edit(base(act.detail)), code: false };
  if (act.kind === "read" || act.kind === "image") return { seq: line.seq, text: d.read(base(act.detail)), code: false };
  if (act.kind === "search") return { seq: line.seq, text: act.detail ? `${d.search} · ${act.detail}` : d.search, code: false };
  if (act.kind === "web") return { seq: line.seq, text: act.detail ? `${d.web} · ${host(act.detail)}` : d.web, code: false };
  if (act.kind === "skill") return { seq: line.seq, text: d.skill(act.detail), code: false };
  if (act.kind === "mcp") return { seq: line.seq, text: d.mcp(`${act.server ?? ""} · ${act.tool}`.replace(/^ · /, "")), code: false };
  return { seq: line.seq, text: d.other(act.tool), code: false };
}
