import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Run } from "../shared/types";
import { listRuns } from "./store";

// The faces other boards' apps already set. Told to each task, so a design picks its own type instead of whatever the
// last build chose: a short list of good fonts becomes the next default as fast as the old one did.
const RECENT = 12;
const family = (css: string, token: string) =>
  new RegExp(`--font-${token}\\s*:\\s*([^;]+);`)
    .exec(css)?.[1]
    ?.split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "");
const named = (f: string | undefined): f is string => !!f && !f.startsWith("var(") && !/^(ui-|system-ui|sans-serif|serif)/.test(f);

// An app may live in a folder of the board, so each app's own stylesheet is read; most boards have none.
function stylesheets(run: Pick<Run, "cwd" | "apps">): string[] {
  const dirs = new Set([".", ...Object.values(run.apps ?? {}).map((a) => a.dir)]);
  return [...dirs].map((d) => join(run.cwd, d, "src", "index.css")).filter((p) => existsSync(p));
}

export function displayFaces(run: Pick<Run, "cwd" | "apps">): string[] {
  return stylesheets(run)
    .map((p) => family(readFileSync(p, "utf8"), "display"))
    .filter(named);
}

export function recentFonts(exceptRun?: string, tokens = ["display", "sans"]): string[] {
  const seen = new Set<string>();
  for (const run of listRuns().slice(0, RECENT + 1)) {
    if (run.id === exceptRun) continue;
    for (const path of stylesheets(run)) {
      const css = readFileSync(path, "utf8");
      for (const token of tokens) {
        const f = family(css, token);
        if (named(f)) seen.add(f);
      }
    }
  }
  return [...seen];
}

// The display face is what a person recognises first, so one another recent build already headlines with is sent back.
export function repeatedDisplay(run: Pick<Run, "id" | "cwd" | "apps" | "prompt">): string | null {
  const others = recentFonts(run.id, ["display"]).map((f) => f.toLowerCase());
  const face = displayFaces(run).find((f) => others.includes(f.toLowerCase()));
  if (!face || run.prompt.toLowerCase().includes(face.toLowerCase())) return null;
  return face;
}

export function fontsNote(fonts: string[]): string {
  return fonts.length
    ? `\n\nTypefaces other Satgas builds here already used: ${fonts.join(", ")}. A new design picks different faces, unless the person asks for one of these by name.`
    : "";
}
