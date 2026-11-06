// Tools: programs Satgas runs around every agent's work (before a shell command, after a file edit, before it finishes),
// or simply tells the agents about. Shared by server and client.
import type { Text } from "./catalog";
import { splitArgs } from "./settings";

export type ToolWhen = "command" | "edit" | "finish" | "available";
export const TOOL_WHENS: ToolWhen[] = ["command", "edit", "finish", "available"];

// Built-ins run inside Satgas's own hook, so they need nothing installed.
export type Builtin = "guard" | "format" | "check";

export interface ToolDef {
  id: string;
  name: string;
  by: string;
  when: ToolWhen;
  desc: Text;
  about: Text;
  // A shell line, run with $SATGAS_COMMAND (before a command) or $SATGAS_FILE (after an edit) set.
  command?: string;
  // It shortens output, so it only fits commands whose output ends on the agent's screen.
  screenOnly?: boolean;
  builtin?: Builtin;
  // The program it runs; without it on PATH the tool stays off and its card shows how to install it.
  needs?: string;
  install?: string;
  site?: string;
  logo?: { src: string; icon?: boolean };
  // Told to every agent, for tools they use themselves.
  note?: string;
}

// What Integrations stores. Catalog tools keep only their id and switch, so they follow the catalog as it improves.
export interface ToolSetting {
  id: string;
  enabled: boolean;
  catalogId?: string;
  name?: string;
  when?: ToolWhen;
  command?: string;
  needs?: string;
  note?: string;
}

// A stored tool with its catalog entry filled in: what the hook and the page work with.
export interface Tool {
  id: string;
  enabled: boolean;
  catalogId?: string;
  name: string;
  when: ToolWhen;
  command?: string;
  screenOnly?: boolean;
  builtin?: Builtin;
  needs?: string;
  note?: string;
}

// Every entry was checked against its project's README (2026-11).
export const TOOL_CATALOG: ToolDef[] = [
  {
    id: "rtk",
    name: "RTK",
    by: "rtk-ai",
    when: "command",
    desc: {
      en: "Compacts command output, so agents read 60–90% fewer tokens",
      id: "Memadatkan output perintah, jadi agen membaca 60–90% lebih sedikit token",
    },
    about: {
      en: "Every shell command an agent runs goes through `rtk rewrite` first. Commands RTK knows (git, test runners, ls, grep, builds) come back as their compact version: failures only for tests, a grouped stat for git status. The agent reads the short output and stays on track for longer. Commands RTK does not know run unchanged, and so do commands that pipe or redirect, because a file or another program needs the real output.",
      id: "Setiap perintah shell yang dijalankan agen lewat `rtk rewrite` dulu. Perintah yang dikenal RTK (git, test runner, ls, grep, build) diganti versi ringkasnya: tes hanya menampilkan yang gagal, git status dikelompokkan. Agen membaca output pendek dan tetap fokus lebih lama. Perintah yang tidak dikenal berjalan apa adanya, begitu juga perintah dengan pipe atau redirect, karena file atau program lain butuh output aslinya.",
    },
    // rtk exits 1 when it has no rewrite and 2 or 3 for its own permission rules; all of those leave the command as it was.
    command: 'rtk rewrite "$SATGAS_COMMAND" 2>/dev/null || true',
    screenOnly: true,
    needs: "rtk",
    install: "brew install rtk",
    site: "https://github.com/rtk-ai/rtk",
    logo: { src: "/brands/rtk.jpg", icon: true },
  },
  {
    id: "guard",
    name: "Command guard",
    by: "Satgas",
    when: "command",
    builtin: "guard",
    desc: {
      en: "Blocks commands that destroy work, like rm -rf outside the project or force pushes",
      id: "Memblokir perintah yang merusak pekerjaan, seperti rm -rf di luar proyek atau force push",
    },
    about: {
      en: "Agents run without asking you first, so one wrong command can wipe uncommitted work. The guard reads every shell command before it runs and stops the ones that cannot be undone: deleting outside the project, `git push --force`, `git reset --hard`, `git clean -f`, dropping a database or table, sudo, and disk tools. The agent is told why and picks a safer way, or names it in its report for you.",
      id: "Agen bekerja tanpa bertanya dulu, jadi satu perintah salah bisa menghapus pekerjaan yang belum di-commit. Guard membaca setiap perintah shell sebelum dijalankan dan menghentikan yang tidak bisa dibatalkan: menghapus di luar proyek, `git push --force`, `git reset --hard`, `git clean -f`, drop database atau tabel, sudo, dan alat disk. Agen diberi tahu alasannya lalu memilih cara yang aman, atau menuliskannya di laporan untukmu.",
    },
  },
  {
    id: "format",
    name: "Auto-format",
    by: "Satgas",
    when: "edit",
    builtin: "format",
    desc: {
      en: "Formats every edited file with the project's own formatter",
      id: "Merapikan setiap file yang diedit dengan formatter milik proyek",
    },
    about: {
      en: "After an agent writes a file, Satgas finds the formatter the project already uses (a Biome or Prettier config with the package installed, Ruff for Python, gofmt for Go, rustfmt for Rust) and formats just that file. Code lands in house style without a review round. Projects without a formatter are left alone, and nothing is downloaded.",
      id: "Setelah agen menulis file, Satgas mencari formatter yang sudah dipakai proyek (config Biome atau Prettier yang paketnya terpasang, Ruff untuk Python, gofmt untuk Go, rustfmt untuk Rust) lalu merapikan file itu saja. Kode langsung sesuai gaya proyek tanpa putaran review. Proyek tanpa formatter dibiarkan, dan tidak ada yang diunduh.",
    },
  },
  {
    id: "check",
    name: "Done check",
    by: "Satgas",
    when: "finish",
    builtin: "check",
    desc: {
      en: "Runs the typecheck before an agent finishes and sends back what broke",
      id: "Menjalankan typecheck sebelum agen selesai dan mengembalikan yang rusak",
    },
    about: {
      en: "When an agent that changed files is about to finish, Satgas runs the project's typecheck: a `typecheck` script, `tsc --noEmit`, `go build` or `cargo check`. If it fails, the agent gets the errors and keeps working, once, so a broken build never reaches you as done. Errors that were already there before are named in its report instead.",
      id: "Saat agen yang mengubah file hendak selesai, Satgas menjalankan typecheck proyek: script `typecheck`, `tsc --noEmit`, `go build`, atau `cargo check`. Jika gagal, agen menerima error-nya dan lanjut bekerja, satu kali, jadi build yang rusak tidak pernah sampai ke kamu sebagai selesai. Error yang sudah ada sebelumnya disebutkan di laporannya.",
    },
  },
  {
    id: "gitleaks",
    name: "gitleaks",
    by: "Gitleaks",
    when: "edit",
    desc: {
      en: "Catches API keys and passwords the moment an agent writes them",
      id: "Menangkap API key dan password begitu agen menuliskannya",
    },
    about: {
      en: "Every file an agent writes is scanned with gitleaks' 150+ secret rules. When it finds a key, the agent is told which line and moves it into an environment variable before anything is committed. The scan shows the finding redacted, so the secret itself never lands in the log.",
      id: "Setiap file yang ditulis agen dipindai dengan 150+ aturan secret dari gitleaks. Jika ada key, agen diberi tahu barisnya dan memindahkannya ke environment variable sebelum apa pun di-commit. Temuan ditampilkan tersamar, jadi secret-nya tidak pernah masuk log.",
    },
    command: 'gitleaks dir "$SATGAS_FILE" --no-banner --redact --exit-code 1 2>&1',
    needs: "gitleaks",
    install: "brew install gitleaks",
    site: "https://github.com/gitleaks/gitleaks",
    logo: { src: "/brands/gitleaks.png", icon: true },
  },
  {
    id: "agent-browser",
    name: "agent-browser",
    by: "Vercel Labs",
    when: "available",
    desc: {
      en: "The agents' browser: compact page snapshots and batched steps, light enough for a VPS",
      id: "Browser untuk agen: snapshot halaman yang ringkas dan langkah yang digabung, cukup ringan untuk VPS",
    },
    about: {
      en: "Agents drive a headless browser from the shell instead of through a connector. A snapshot lists the page's elements with short refs (`@e1`), the agent acts on a ref, and several steps go in one `batch`, so a page check takes a few calls instead of dozens. It runs on macOS, Linux and Windows, which makes it the browser for Satgas on a VPS, and it can switch to the lighter Lightpanda engine.",
      id: "Agen mengendalikan browser headless lewat shell, bukan lewat connector. Snapshot mendaftar elemen halaman dengan ref pendek (`@e1`), agen bertindak pada ref itu, dan beberapa langkah digabung dalam satu `batch`, jadi memeriksa halaman cukup beberapa panggilan, bukan puluhan. Berjalan di macOS, Linux, dan Windows, jadi cocok untuk Satgas di VPS, dan bisa beralih ke mesin Lightpanda yang lebih ringan.",
    },
    needs: "agent-browser",
    install: "npm install -g agent-browser && agent-browser install",
    site: "https://github.com/vercel-labs/agent-browser",
    logo: { src: "/brands/vercel-labs.png", icon: true },
    note: 'agent-browser is your browser (`agent-browser`; no browser connector is needed). Run `agent-browser skills get core` once for its guide. The loop: `agent-browser open <url>`, `agent-browser snapshot -i` to list interactive elements with refs, then `click @e1` or `fill @e2 "text"`; take a new snapshot after the page changes, chain known steps with `agent-browser batch`, and save proof with `agent-browser screenshot <path>`. Run `agent-browser close` when your task is done, so no browser stays open.',
  },
  {
    id: "ast-grep",
    name: "ast-grep",
    by: "ast-grep",
    when: "available",
    desc: {
      en: "Lets agents search and rewrite code by its structure, not its text",
      id: "Agen bisa mencari dan mengubah kode berdasarkan strukturnya, bukan teks",
    },
    about: {
      en: "Agents are told ast-grep is installed and when to reach for it: renaming a function across a codebase, changing every call of an API, finding a pattern regardless of formatting. It matches syntax trees, so comments and strings with the same word are left alone, which sed cannot promise.",
      id: "Agen diberi tahu bahwa ast-grep terpasang dan kapan memakainya: rename fungsi di seluruh kode, mengubah semua pemanggilan sebuah API, mencari pola tanpa peduli format. Ia mencocokkan pohon sintaks, jadi komentar dan string dengan kata yang sama tidak ikut berubah, hal yang tidak bisa dijamin sed.",
    },
    needs: "ast-grep",
    install: "brew install ast-grep",
    site: "https://github.com/ast-grep/ast-grep",
    logo: { src: "/brands/ast-grep.png", icon: true },
    note: "ast-grep (`ast-grep run -p '<pattern>' -r '<rewrite>' -l <lang>`) for structural search and codemods: renames across files, changing every call of an API. Prefer it over sed for code.",
  },
];

// Whether a command's input or output involves a file or another program. Joining stderr, discarding output and `||` do not.
export function usesRedirect(command: string): boolean {
  const kept = command
    .replace(/\|\|/g, "")
    .replace(/[0-9]*>&[0-9]+/g, "")
    .replace(/(&|[0-9]*)>>?\s*\/dev\/null/g, "");
  return /[<>|]/.test(kept);
}

export const toolDef = new Map(TOOL_CATALOG.map((d) => [d.id, d]));

// On by default: RTK and agent-browser only act when installed, and the guard costs nothing.
export const DEFAULT_TOOLS: ToolSetting[] = [
  { id: "rtk", catalogId: "rtk", enabled: true },
  { id: "guard", catalogId: "guard", enabled: true },
  { id: "agent-browser", catalogId: "agent-browser", enabled: true },
];

export function resolveTool(s: ToolSetting): Tool | null {
  const def = s.catalogId ? toolDef.get(s.catalogId) : undefined;
  if (def)
    return {
      id: s.id,
      enabled: s.enabled,
      catalogId: def.id,
      name: def.name,
      when: def.when,
      command: def.command,
      builtin: def.builtin,
      needs: def.needs,
      screenOnly: def.screenOnly,
      note: def.note,
    };
  if (!s.name || !s.when) return null;
  return { id: s.id, enabled: s.enabled, name: s.name, when: s.when, command: s.command, needs: s.needs, note: s.note };
}

const MAX_TOOLS = 30;
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v.trim() : null);
const PROGRAM = /^[A-Za-z0-9._+-]{1,60}$/;

// Tools arrive from the browser, so every field is checked and bounded; the list or a message for the person.
export function sanitizeTools(v: unknown): ToolSetting[] | string {
  if (!Array.isArray(v) || v.length > MAX_TOOLS) return `Up to ${MAX_TOOLS} tools are supported.`;
  const out: ToolSetting[] = [];
  const ids = new Set<string>();
  for (const raw of v) {
    const t = raw as Record<string, unknown>;
    if (!t || typeof t !== "object") return "A tool entry is malformed.";
    const id = str(t.id, 64);
    if (!id || ids.has(id)) return "A tool is missing its id.";
    ids.add(id);
    const enabled = t.enabled !== false;
    if (typeof t.catalogId === "string") {
      if (!toolDef.has(t.catalogId)) continue;
      out.push({ id, enabled, catalogId: t.catalogId });
      continue;
    }
    const name = str(t.name, 40);
    if (!name) return "Every tool needs a name.";
    if (!TOOL_WHENS.includes(t.when as ToolWhen)) return `"${name}" needs to say when it runs.`;
    const when = t.when as ToolWhen;
    const command = str(t.command ?? "", 2000) ?? null;
    if (command === null) return `"${name}": the command is too long.`;
    if (when !== "available" && !command) return `"${name}" needs a command to run.`;
    const needs = str(t.needs ?? "", 60);
    if (needs === null || (needs && !PROGRAM.test(needs))) return `"${name}": the program it needs is one name, like rtk.`;
    if (when === "available" && !needs) return `"${name}" needs the program agents should use.`;
    const note = str(t.note ?? "", 500);
    if (note === null) return `"${name}": the note for agents is too long.`;
    out.push({
      id,
      enabled,
      name,
      when,
      ...(command ? { command } : {}),
      ...(needs ? { needs } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
}

// Shell control operators split one line into the commands it runs; quotes are respected well enough for a guard.
function segments(line: string): string[][] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ";" || ch === "|" || ch === "&" || ch === "\n" || ch === "(" || ch === ")" || ch === "`") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => splitArgs(p.trim())).filter((a) => a.length > 0);
}

const TMP = ["/tmp", "/private/tmp", "/var/folders", "/private/var/folders"];
const within = (path: string, dir: string) => path === dir || path.startsWith(dir.endsWith("/") ? dir : `${dir}/`);

function normalize(path: string, cwd: string, home: string): string {
  let p = path.replace(/^~(?=\/|$)/, home).replace(/^\$\{?HOME\}?(?=\/|$)/, home);
  if (!p.startsWith("/")) p = `${cwd}/${p}`;
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

// Why Satgas will not run this command, or null when it may. cwd is the project; anything that cannot be undone and
// reaches past it, or rewrites what other people share, is stopped.
export function guardCheck(line: string, cwd: string, home: string): string | null {
  const project = normalize(cwd, "/", home);
  if (/:\s*\(\s*\)\s*\{/.test(line)) return "that is a fork bomb";
  if (/\b(drop\s+(database|schema|table)|truncate\s+table)\b/i.test(line))
    return "it drops or empties a database table; ask the person to do it, or name it in your report";
  for (const args of segments(line)) {
    // Leading variable assignments and wrappers like env or command still run the same program.
    while (args.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0] as string) || args[0] === "env" || args[0] === "command")) args.shift();
    const [bin, ...rest] = args;
    if (!bin) continue;
    const prog = bin.split("/").pop() as string;
    if (prog === "sudo" || prog === "doas") return "it needs administrator rights, which only the person can grant";
    if (["mkfs", "fdisk", "diskutil", "shutdown", "reboot", "halt", "poweroff"].includes(prog) || prog.startsWith("mkfs."))
      return `\`${prog}\` acts on the whole machine`;
    if (prog === "dd" && rest.some((a) => /^of=\/dev\//.test(a))) return "it writes straight to a disk device";
    if (prog === "rm") {
      const flags = rest.filter((a) => a.startsWith("-"));
      const recursive = flags.some((f) => f === "--recursive" || (/^-[a-zA-Z]+$/.test(f) && /[rR]/.test(f)));
      if (!recursive) continue;
      for (const target of rest.filter((a) => !a.startsWith("-"))) {
        const abs = normalize(target, project, home);
        if (abs === "/" || abs === home || within(project, abs))
          return `\`rm -r ${target}\` would delete the project itself or what holds it`;
        if (!within(abs, project) && !TMP.some((t) => within(abs, t)))
          return `\`rm -r ${target}\` deletes outside the project; only files inside ${project} may go`;
      }
    }
    if (
      (prog === "chmod" || prog === "chown") &&
      rest.some((a) => /^-[a-zA-Z]*R/.test(a)) &&
      rest.some((a) => normalize(a, project, home) === "/")
    )
      return "it changes permissions across the whole disk";
    if (prog === "git") {
      const sub = rest.find((a) => !a.startsWith("-"));
      const opts = rest.slice(rest.indexOf(sub as string) + 1);
      if (sub === "push" && opts.some((a) => a === "--force" || a === "--mirror" || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+/.test(a)))
        return "a force push rewrites history other people share; use --force-with-lease, or name it in your report";
      if (sub === "reset" && opts.includes("--hard")) return "`git reset --hard` throws away uncommitted work; commit or stash it instead";
      if (sub === "clean" && opts.some((a) => a === "--force" || /^-[a-zA-Z]*f/.test(a)))
        return "`git clean -f` deletes untracked files for good; remove the ones you made by name";
      if ((sub === "checkout" || sub === "restore") && opts.includes(".") && !opts.includes("--staged"))
        return `\`git ${sub} .\` discards every uncommitted change; restore only the files you changed`;
    }
  }
  return null;
}

// The files a Codex apply_patch call touched, from its patch headers.
export function patchedFiles(patch: string): string[] {
  const out: string[] = [];
  for (const m of patch.matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm)) out.push((m[1] as string).trim());
  for (const m of patch.matchAll(/^\*\*\* Move to: (.+)$/gm)) out.push((m[1] as string).trim());
  return out;
}
