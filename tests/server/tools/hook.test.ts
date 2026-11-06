import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFor, formatterFor, onCommand, onEdit, onFinish } from "../../../src/server/tools/hook";
import { resolveTool, type Tool } from "../../../src/shared/tools";

let dir = "";
const HOOK = join(import.meta.dir, "../../../src/server/tools/hook.ts");
const tool = (t: Partial<Tool>): Tool => ({ id: t.name ?? "t", enabled: true, name: "t", when: "command", ...t });
const guard = tool({ name: "Command guard", builtin: "guard" });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-hook-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

// The hook as the agents run it: one process, the payload on stdin, the tools in its environment.
async function hook(event: string, payload: object, tools: Tool[], agent = "claude") {
  const proc = Bun.spawn([process.execPath, HOOK, event], {
    stdin: new Blob([JSON.stringify(payload)]),
    stdout: "pipe",
    env: {
      ...process.env,
      SATGAS_TOOLS: JSON.stringify(tools),
      SATGAS_TOOLS_STATE: join(dir, "state"),
      SATGAS_HOME: "/home/me",
      SATGAS_AGENT: agent,
    },
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out ? JSON.parse(out) : null;
}

describe("before a shell command", () => {
  test("RTK only shortens output that ends on the agent's screen, never what a file or program reads", async () => {
    const bin = join(dir, "fake-rtk");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "rtk"), '#!/bin/sh\nprintf "rtk %s" "$2"\n');
    await chmod(join(bin, "rtk"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    const rtk = resolveTool({ id: "rtk", catalogId: "rtk", enabled: true });
    if (!rtk) throw new Error("RTK left the catalog");
    const after = async (command: string) => (await onCommand([rtk], command, dir, "/home/me")).command;
    try {
      for (const shown of ["git status", "git diff 2>&1", "ls 2>/dev/null", "git status >/dev/null", "git status || true"])
        expect(await after(shown)).toBe(`rtk ${shown}`);
      for (const kept of ['wc -c < "/tmp/secret"', "git diff > patch.diff", "git log >> log.txt", "git diff | wc -l", "git diff | tee out"])
        expect(await after(kept)).toBe(kept);
    } finally {
      process.env.PATH = path;
    }
  });

  test("tools rewrite in turn, and the guard sees the rewritten command", async () => {
    const wrap = tool({ name: "wrap", command: 'printf "time %s" "$SATGAS_COMMAND"' });
    expect(await onCommand([wrap], "ls", dir, "/home/me")).toEqual({ command: "time ls" });
    const silent = tool({ name: "quiet", command: "exit 1" });
    expect(await onCommand([silent, guard], "git status", dir, "/home/me")).toEqual({ command: "git status" });
    const r = await onCommand([guard], "git push --force", dir, "/home/me");
    expect(r.block).toContain("force push");
  });

  test("exit 2 blocks with the tool's reason", async () => {
    const policy = tool({ name: "Policy", command: "echo 'no deploys from agents' >&2; exit 2" });
    expect((await onCommand([policy], "vercel deploy", dir, "/home/me")).block).toBe(
      "Policy blocked this command: no deploys from agents.",
    );
  });

  test("answers Claude Code and Codex in their hook format", async () => {
    const deny = await hook("command", { cwd: dir, tool_input: { command: "rm -rf ~" } }, [guard]);
    expect(deny.hookSpecificOutput.permissionDecision).toBe("deny");
    const rewrite = await hook("command", { cwd: dir, tool_input: { command: "ls", description: "list" } }, [
      tool({ name: "w", command: 'printf "rtk %s" "$SATGAS_COMMAND"' }),
    ]);
    expect(rewrite).toEqual({
      hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { command: "rtk ls", description: "list" } },
    });
    // Codex applies a rewrite only when the hook also allows it.
    const codex = await hook(
      "command",
      { cwd: dir, tool_input: { command: "ls" } },
      [tool({ name: "w", command: 'printf "rtk %s" "$SATGAS_COMMAND"' })],
      "codex",
    );
    expect(codex.hookSpecificOutput).toEqual({
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: { command: "rtk ls" },
    });
    expect(await hook("command", { cwd: dir, tool_input: { command: "ls" } }, [guard])).toBeNull();
    // A tool whose program is missing never runs.
    expect(
      await hook("command", { cwd: dir, tool_input: { command: "ls" } }, [tool({ command: "echo x", needs: "satgas-no-such-bin" })]),
    ).toBeNull();
  });
});

describe("after an edit and before finishing", () => {
  test("a failing scan comes back for the agent; formatting stays silent", async () => {
    const file = join(dir, "a.ts");
    await writeFile(file, "const key = 1;\n");
    const scan = tool({ name: "scan", when: "edit", command: 'grep -q key "$SATGAS_FILE" && echo "found a key" && exit 1 || true' });
    const problems = await onEdit([scan, tool({ name: "fmt", when: "edit", builtin: "format" })], [file], dir);
    expect(problems).toEqual([`scan on ${file}:\nfound a key`]);
    const out = await hook("edit", { cwd: dir, tool_input: { file_path: "a.ts" } }, [scan]);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("found a key");
  });

  test("the finish check runs only after edits, and only once", async () => {
    const project = join(dir, "proj");
    await mkdir(project, { recursive: true });
    await writeFile(
      join(project, "package.json"),
      JSON.stringify({ scripts: { typecheck: "echo 'src/a.ts(1,1): error TS2322' && exit 1" } }),
    );
    await writeFile(join(project, "bun.lock"), "");
    const check = tool({ name: "Done check", when: "finish", builtin: "check" });
    expect(checkFor(project)).toEqual(["bun", "run", "typecheck"]);
    expect((await onFinish([check], project))[0]).toContain("error TS2322");

    await rm(join(dir, "state"), { recursive: true, force: true });
    expect(await hook("finish", { cwd: project, stop_hook_active: false }, [check])).toBeNull();
    await hook("edit", { cwd: project, tool_input: { file_path: "x.ts" } }, [check]);
    const out = await hook("finish", { cwd: project, stop_hook_active: false }, [check]);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("error TS2322");
    expect(await hook("finish", { cwd: project, stop_hook_active: true }, [check])).toBeNull();
  });

  test("finds the project's own formatter and never downloads one", async () => {
    const project = join(dir, "fmt");
    await mkdir(join(project, "node_modules/.bin"), { recursive: true });
    await mkdir(join(project, "src"), { recursive: true });
    const file = join(project, "src/a.ts");
    expect(formatterFor(file, project)).toBeNull();
    await writeFile(join(project, "biome.json"), "{}");
    expect(formatterFor(file, project)).toBeNull();
    const bin = join(project, "node_modules/.bin/biome");
    await writeFile(bin, "#!/bin/sh\n");
    await chmod(bin, 0o755);
    expect(formatterFor(file, project)).toEqual([bin, "format", "--write", file]);
    expect(formatterFor(join(project, "notes.txt"), project)).toBeNull();
  });
});
