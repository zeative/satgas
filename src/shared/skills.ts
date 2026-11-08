// A skill is a folder with a SKILL.md: a name, a one-line description of when to use it, and instructions.
export type SkillSource =
  | { kind: "builtin" }
  | { kind: "github"; repo: string; path?: string; ref?: string }
  | { kind: "own" }
  | { kind: "import"; from: string }
  | { kind: "zip"; file: string };

export interface Skill {
  name: string;
  description: string;
  enabled: boolean;
  source: SkillSource;
  installedAt: number;
  files: number;
  // Built-in skills that come as one bundle; the Skills page shows the bundle and lists its skills on demand.
  pack?: PackId;
  // A built-in skill the person may switch off, and the repo it came from.
  optional?: boolean;
  repo?: string;
}

export const PACKS = {
  "agent-skills": { repo: "addyosmani/agent-skills", by: "Addy Osmani" },
} as const;
export type PackId = keyof typeof PACKS;

// A skill found in a repo, an archive or a local folder, not installed yet.
export interface SkillFind {
  name: string;
  description: string;
  // Where it sits in its source, for telling apart two skills with similar names.
  path: string;
  files: number;
  installed: boolean;
}

// The Agent Skills naming rule: lowercase words joined by single hyphens, at most 64 characters.
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const validSkillName = (name: string) => name.length <= 64 && SKILL_NAME.test(name);

export const slugSkill = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");

export const MAX_DESCRIPTION = 1024;

// The YAML front matter SKILL.md files use, read without a YAML library: plain, quoted and block (| or >) values.
export function readSkillFile(md: string): { name?: string; description?: string; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(md);
  if (!m) return { body: md };
  const fields: Record<string, string> = {};
  const lines = (m[1] ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(lines[i] ?? "");
    if (!kv) continue;
    const key = kv[1] ?? "";
    let value = (kv[2] ?? "").trim();
    const block = /^([|>])[+-]?$/.exec(value);
    if (block) {
      const taken: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1] ?? "") || !(lines[i + 1] ?? "").trim()))
        taken.push((lines[++i] ?? "").trim());
      value = (block[1] === "|" ? taken.join("\n") : taken.join(" ")).trim();
    } else if (/^"(.*)"$/.test(value)) {
      value = value
        .slice(1, -1)
        .replace(/\\(["\\])/g, "$1")
        .replace(/\\n/g, "\n");
    } else if (/^'(.*)'$/.test(value)) {
      value = value.slice(1, -1).replace(/''/g, "'");
    }
    fields[key] = value;
  }
  return { name: fields.name, description: fields.description, body: m[2] ?? "" };
}

// A SKILL.md written from the Skills form; the description is quoted so a colon or a quote never breaks the YAML.
export function writeSkillFile(name: string, description: string, body: string): string {
  const desc = JSON.stringify(description.replace(/\s+/g, " ").trim());
  return `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body.trim()}\n`;
}

// owner/repo, a repo URL, or a link to a folder or a SKILL.md inside it.
export function parseGithubSource(input: string): { owner: string; repo: string; ref?: string; path?: string } | null {
  const text = input.trim().replace(/[?#].*$/, "");
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(text);
  if (short?.[1] && short[2]) return { owner: short[1], repo: short[2].replace(/\.git$/, "") };
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)((?:\/[^/]+)*))?\/?$/.exec(
    text,
  );
  if (!m?.[1] || !m[2]) return null;
  const path = (m[4] ?? "")
    .split("/")
    .filter(Boolean)
    .join("/")
    .replace(/(^|\/)SKILL\.md$/i, "");
  return { owner: m[1], repo: m[2], ...(m[3] ? { ref: m[3] } : {}), ...(path ? { path } : {}) };
}

// A skill may ship sources.json: the outside sources its script takes real material from. The skill's page lists them.
export const SOURCE_CATEGORIES = [
  "backgrounds",
  "patterns",
  "icons",
  "logos",
  "type",
  "illustrations",
  "photos",
  "colour",
  "motion",
  "components",
  "references",
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];
export interface MaterialSource {
  id: string;
  name: string;
  url: string;
  category: SourceCategory;
  gives: string;
  license: string;
  // generate: agents make a file from it; download: agents fetch its files; reference: agents study it.
  use: "generate" | "download" | "reference";
  icon?: string;
  needsKey?: string;
}

// Only well-formed entries with a known category and an https link; a skill's own file is never trusted blindly.
export function readSources(text: string): { checked?: string; sources: MaterialSource[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = (data as { sources?: unknown })?.sources;
  if (!Array.isArray(list)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const sources = list.flatMap((raw): MaterialSource[] => {
    const r = raw as Record<string, unknown>;
    const category = str(r.category) as SourceCategory;
    const use = str(r.use);
    if (!str(r.id) || !str(r.name) || !/^https:\/\//.test(str(r.url)) || !SOURCE_CATEGORIES.includes(category)) return [];
    if (use !== "generate" && use !== "download" && use !== "reference") return [];
    const icon = str(r.icon);
    return [
      {
        id: str(r.id),
        name: str(r.name),
        url: str(r.url),
        category,
        gives: str(r.gives),
        license: str(r.license),
        use,
        // Only the app's own bundled pictures, so a skill cannot make the page load from anywhere.
        ...(/^\/sources\/[\w.-]+\.(png|svg)$/.test(icon) ? { icon } : {}),
        ...(str(r.needsKey) ? { needsKey: str(r.needsKey) } : {}),
      },
    ];
  });
  const checked = str((data as { checked?: unknown }).checked);
  return { ...(checked ? { checked } : {}), sources };
}
