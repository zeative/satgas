// Satgas's one hook, registered on Claude Code and Codex for every worker. It runs the tools from Integrations → Tools:
// before a shell command (rewrite or block it), after a file edit (format, scan) and before the agent finishes (check).
// It runs as its own short process per call, so it imports nothing from the server.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { guardCheck, patchedFiles, type Tool, usesRedirect } from "../../shared/tools";

type Event = "command" | "edit" | "finish";
const LIMIT: Record<Event, number> = { command: 10_000, edit: 30_000, finish: 240_000 };
// Enough of a failure for the agent to act on, without flooding its context.
const TAIL = 2500;

interface Ran {
  code: number;
  out: string;
  err: string;
}

async function run(cmd: string[], cwd: string, env: Record<string, string>, ms: number): Promise<Ran> {
  try {
    const proc = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), ms);
    const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    clearTimeout(timer);
    return { code: await proc.exited, out, err };
  } catch (e) {
    return { code: 127, out: "", err: (e as Error).message };
  }
}

const sh = (line: string, cwd: string, env: Record<string, string>, ms: number) => run(["sh", "-c", line], cwd, env, ms);
const clean = (s: string) => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strips terminal colour codes from tool output.
  const plain = s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
  return plain.length > TAIL ? `…${plain.slice(-TAIL)}` : plain;
};
const installed = (t: Tool) => !t.needs || !!Bun.which(t.needs);

// The nearest file named one of `names`, from `dir` up to `root`.
function findUp(dir: string, root: string, names: string[]): string | null {
  let d = dir;
  for (;;) {
    for (const n of names) if (existsSync(join(d, n))) return join(d, n);
    if (d === root || dirname(d) === d) return null;
    d = dirname(d);
  }
}

const JS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".json",
  ".jsonc",
  ".css",
  ".scss",
  ".md",
  ".mdx",
  ".html",
  ".vue",
  ".svelte",
  ".yaml",
  ".yml",
  ".graphql",
]);
const PRETTIER = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.json5",
  ".prettierrc.toml",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
];

// The formatter the project already uses for this file, run from its own install; nothing is ever downloaded.
export function formatterFor(file: string, root: string): string[] | null {
  const ext = extname(file);
  const dir = dirname(file);
  if (JS.has(ext)) {
    const biome = findUp(dir, root, ["biome.json", "biome.jsonc"]);
    const prettier = findUp(dir, root, PRETTIER);
    const bin = (name: string) => findUp(dir, root, [`node_modules/.bin/${name}`]);
    if (biome && bin("biome")) return [bin("biome") as string, "format", "--write", file];
    if (prettier && bin("prettier")) return [bin("prettier") as string, "--write", file];
    return null;
  }
  if (ext === ".py") return Bun.which("ruff") ? ["ruff", "format", file] : Bun.which("black") ? ["black", "-q", file] : null;
  if (ext === ".go") return Bun.which("gofmt") ? ["gofmt", "-w", file] : null;
  if (ext === ".rs") return Bun.which("rustfmt") ? ["rustfmt", "--edition", "2021", file] : null;
  return null;
}

// The project's typecheck, as its own scripts or toolchain run it; null when there is none to run.
export function checkFor(root: string): string[] | null {
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    let scripts: Record<string, string> = {};
    try {
      scripts = JSON.parse(readFileSync(pkg, "utf8")).scripts ?? {};
    } catch {}
    const script = ["typecheck", "type-check", "check-types", "tsc"].find((s) => scripts[s]);
    if (script) {
      const runner =
        existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))
          ? "bun"
          : existsSync(join(root, "pnpm-lock.yaml"))
            ? "pnpm"
            : existsSync(join(root, "yarn.lock"))
              ? "yarn"
              : "npm";
      return [runner, "run", script];
    }
    const tsc = join(root, "node_modules/.bin/tsc");
    if (existsSync(join(root, "tsconfig.json")) && existsSync(tsc)) return [tsc, "--noEmit"];
  }
  if (existsSync(join(root, "go.mod")) && Bun.which("go")) return ["go", "build", "./..."];
  if (existsSync(join(root, "Cargo.toml")) && Bun.which("cargo")) return ["cargo", "check", "--quiet"];
  return null;
}

// Every tool before a shell command, in order; each sees the command as the one before left it.
export async function onCommand(tools: Tool[], command: string, cwd: string, home: string): Promise<{ block?: string; command: string }> {
  let current = command;
  for (const t of tools) {
    if (t.builtin === "guard") {
      const why = guardCheck(current, cwd, home);
      if (why) return { block: `Satgas blocked this command: ${why}.`, command: current };
      continue;
    }
    if (!t.command || (t.screenOnly && usesRedirect(current))) continue;
    const r = await sh(t.command, cwd, { SATGAS_COMMAND: current }, LIMIT.command);
    if (r.code === 2) return { block: `${t.name} blocked this command: ${clean(r.err || r.out) || "no reason given"}.`, command: current };
    const next = r.out.trim();
    if (r.code === 0 && next) current = next;
  }
  return { command: current };
}

// Every tool after a file edit; problems come back for the agent to fix, formatting stays silent.
export async function onEdit(tools: Tool[], files: string[], cwd: string): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const t of tools) {
      if (t.builtin === "format") {
        const cmd = formatterFor(file, cwd);
        if (cmd) await run(cmd, cwd, {}, LIMIT.edit);
        continue;
      }
      if (!t.command) continue;
      const r = await sh(t.command, cwd, { SATGAS_FILE: file }, LIMIT.edit);
      if (r.code !== 0) problems.push(`${t.name} on ${file}:\n${clean(`${r.out}\n${r.err}`)}`);
    }
  }
  return problems;
}

// Every tool before the agent finishes; what fails comes back, and the agent keeps working.
export async function onFinish(tools: Tool[], cwd: string): Promise<string[]> {
  const problems: string[] = [];
  for (const t of tools) {
    const r =
      t.builtin === "check"
        ? await (async () => {
            const cmd = checkFor(cwd);
            return cmd ? { ...(await run(cmd, cwd, {}, LIMIT.finish)), label: cmd.join(" ") } : null;
          })()
        : t.command
          ? { ...(await sh(t.command, cwd, {}, LIMIT.finish)), label: t.command }
          : null;
    if (r && r.code !== 0) problems.push(`${t.name} (\`${r.label}\`) failed:\n${clean(`${r.out}\n${r.err}`)}`);
  }
  return problems;
}

// The files an edit touched: Claude names one, Codex sends its whole patch.
function editedFiles(input: Record<string, unknown>, cwd: string): string[] {
  const one = input.file_path ?? input.notebook_path;
  const files = typeof one === "string" ? [one] : patchedFiles(String(input.command ?? input.patch ?? input.input ?? ""));
  return files.map((f) => (isAbsolute(f) ? f : resolve(cwd, f)));
}

const say = (out: unknown) => {
  process.stdout.write(JSON.stringify(out));
};

export async function runHook(event: string): Promise<void> {
  if (event !== "command" && event !== "edit" && event !== "finish") return;
  let tools: Tool[] = [];
  let payload: Record<string, any> = {};
  try {
    tools = JSON.parse(process.env.SATGAS_TOOLS ?? "[]");
    payload = JSON.parse(await Bun.stdin.text());
  } catch {
    // A hook that cannot read its input steps aside; it must never stop the agent's work.
    return;
  }
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const state = process.env.SATGAS_TOOLS_STATE;
  const mine = tools.filter((t) => t.enabled && t.when === event && installed(t));
  const input: Record<string, unknown> = payload.tool_input ?? {};

  if (event === "command") {
    const command = typeof input.command === "string" ? input.command : "";
    if (!command || !mine.length) return;
    const r = await onCommand(mine, command, cwd, process.env.SATGAS_HOME || process.env.HOME || "/");
    if (r.block)
      return say({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: r.block } });
    // Codex applies a rewrite only alongside "allow"; Claude Code takes it without one, so its own permission rules
    // still judge the rewritten command.
    const allow = process.env.SATGAS_AGENT === "codex" ? { permissionDecision: "allow" } : {};
    if (r.command !== command)
      say({ hookSpecificOutput: { hookEventName: "PreToolUse", ...allow, updatedInput: { ...input, command: r.command } } });
    return;
  }

  if (event === "edit") {
    // Remembered so the finish check only runs for agents that changed something.
    if (state) {
      mkdirSync(state, { recursive: true });
      writeFileSync(join(state, "edited"), "1");
    }
    if (!mine.length) return;
    const problems = await onEdit(mine, editedFiles(input, cwd), cwd);
    if (problems.length)
      say({ decision: "block", reason: `Satgas tools found problems in the file you just wrote:\n\n${problems.join("\n\n")}` });
    return;
  }

  // One extra round at most: a second stop is let through, so an agent can never loop on errors it cannot fix.
  if (payload.stop_hook_active || !mine.length) return;
  if (state && !existsSync(join(state, "edited"))) return;
  const problems = await onFinish(mine, cwd);
  if (problems.length)
    say({
      decision: "block",
      reason: `Before you finish, Satgas checked the project and it fails:\n\n${problems.join("\n\n")}\n\nFix what your changes broke, then finish. If these errors were there before you started, leave them and say so in your report.`,
    });
}

if (import.meta.main) await runHook(process.argv[2] ?? "");
