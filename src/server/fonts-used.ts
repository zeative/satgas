import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

export function recentFonts(exceptRun?: string): string[] {
  const seen = new Set<string>();
  for (const run of listRuns().slice(0, RECENT + 1)) {
    if (run.id === exceptRun) continue;
    // Most boards have no app; reading a missing file would throw, so it is checked first.
    const path = join(run.cwd, "src", "index.css");
    const css = existsSync(path) ? readFileSync(path, "utf8") : "";
    for (const token of ["display", "sans"]) {
      const f = family(css, token);
      if (f && !f.startsWith("var(") && !/^(ui-|system-ui|sans-serif|serif)/.test(f)) seen.add(f);
    }
  }
  return [...seen];
}

export function fontsNote(fonts: string[]): string {
  return fonts.length
    ? `\n\nTypefaces other Satgas builds here already used: ${fonts.join(", ")}. A new design picks different faces, unless the person asks for one of these by name.`
    : "";
}
