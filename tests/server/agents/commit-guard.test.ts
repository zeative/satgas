import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitGuardEnv } from "../../../src/server/agents/commit-guard";
import { config } from "../../../src/server/config";

const original = config.dataDir;
let root = "";
let repo = "";
let env: Record<string, string> = {};
const clean = { ...process.env };
for (const k of Object.keys(clean)) if (k.startsWith("GIT_")) delete clean[k];

function git(args: string[], cwd = repo) {
  const r = Bun.spawnSync(["git", "-c", "user.name=T", "-c", "user.email=t@example.com", ...args], {
    cwd,
    env: { ...clean, ...env },
    stderr: "pipe",
    stdout: "pipe",
  });
  return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString() };
}
const message = () => git(["log", "-1", "--format=%B"]).out;
let n = 0;
const commit = (text: string) =>
  Bun.spawnSync(["sh", "-c", 'git add -A && printf "%s" "$MSG" | git -c user.name=T -c user.email=t@example.com commit -q -F -'], {
    cwd: repo,
    env: { ...clean, ...env, MSG: text },
    stderr: "pipe",
  });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "satgas-guard-"));
  config.dataDir = root;
  env = await commitGuardEnv({});
});
afterAll(async () => {
  config.dataDir = original;
  await rm(root, { recursive: true, force: true });
});
beforeEach(async () => {
  repo = join(root, `repo${++n}`);
  await mkdir(repo, { recursive: true });
  git(["init", "-q"]);
});

test("a commit with no credit gets Satgas Agent, whatever the model wrote", async () => {
  await Bun.write(join(repo, "a.txt"), "a");
  commit("feat: add a");
  expect(message()).toContain("feat: add a");
  expect(message()).toContain("Co-Authored-By: Satgas Agent <noreply@satgas.id>");
});

test("an AI tool's own lines go, a person's stay, and the credit never doubles", async () => {
  await Bun.write(join(repo, "a.txt"), "a");
  commit(
    "fix: thing\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nCo-authored-by: Codex <codex@openai.com>\nCo-authored-by: qwen-coder <x@y.z>\nCo-Authored-By: Jane Doe <jane@google.com>\nCo-Authored-By: Satgas Agent <noreply@satgas.id>",
  );
  const m = message();
  expect(m).not.toMatch(/claude|anthropic|codex|openai|qwen/i);
  expect(m).toContain("Co-Authored-By: Jane Doe <jane@google.com>");
  expect(m.match(/Satgas Agent/g)).toHaveLength(1);
});

test("skipping the hooks with --no-verify does not get around the credit, as a real agent tried", async () => {
  await Bun.write(join(repo, "a.txt"), "a");
  const r = Bun.spawnSync(
    [
      "sh",
      "-c",
      'git add -A && git -c user.name=T -c user.email=t@example.com commit -q --no-verify -m "docs: a" -m "Co-Authored-By: Claude <noreply@anthropic.com>"',
    ],
    { cwd: repo, env: { ...clean, ...env }, stderr: "pipe" },
  );
  expect(r.exitCode).toBe(0);
  expect(message()).not.toMatch(/claude|anthropic/i);
  expect(message()).toContain("Co-Authored-By: Satgas Agent <noreply@satgas.id>");
  expect(git(["rev-list", "--count", "HEAD"]).out.trim()).toBe("1");
});

test("the repository's own hooks still run, and can still refuse a commit", async () => {
  const hook = join(repo, ".git/hooks/commit-msg");
  await Bun.write(hook, '#!/bin/sh\ngrep -q "Satgas Agent" "$1" && touch ran\ngrep -q forbidden "$1" && exit 1\nexit 0\n');
  await chmod(hook, 0o755);
  await Bun.write(join(repo, "a.txt"), "a");
  commit("feat: allowed");
  expect(await Bun.file(join(repo, "ran")).exists()).toBe(true);
  await Bun.write(join(repo, "b.txt"), "b");
  const refused = commit("forbidden change");
  expect(refused.exitCode).not.toBe(0);
  expect(message()).toContain("feat: allowed");
});

test("a repository with its own hooks folder, like husky, keeps it", async () => {
  await mkdir(join(repo, ".husky"), { recursive: true });
  await Bun.write(join(repo, ".husky/pre-commit"), "#!/bin/sh\ntouch husky-ran\n");
  await chmod(join(repo, ".husky/pre-commit"), 0o755);
  Bun.spawnSync(["git", "config", "core.hooksPath", ".husky"], { cwd: repo, env: clean });
  await Bun.write(join(repo, "a.txt"), "a");
  commit("feat: a");
  expect(await Bun.file(join(repo, "husky-ran")).exists()).toBe(true);
  expect(message()).toContain("Satgas Agent");
});

test("config the environment already passes to git keeps its place", async () => {
  expect(await commitGuardEnv({ GIT_CONFIG_COUNT: "2" })).toMatchObject({ GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_2: "core.hooksPath" });
});
