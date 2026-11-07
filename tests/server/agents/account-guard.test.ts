import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACCOUNT_CLIS, accountGuardEnv } from "../../../src/server/agents/account-guard";
import { config } from "../../../src/server/config";

const original = config.dataDir;
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "satgas-account-guard-"));
  (config as { dataDir: string }).dataDir = root;
});

afterAll(async () => {
  (config as { dataDir: string }).dataDir = original;
  await rm(root, { recursive: true, force: true });
});

const run = (command: string, env: Record<string, string>) => {
  const r = Bun.spawnSync(["/bin/sh", "-c", command], { env, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, err: r.stderr.toString(), out: r.stdout.toString() };
};

test("every account CLI is stopped, with a reason that says where to connect", async () => {
  const { set } = await accountGuardEnv(false, "/usr/bin:/bin");
  for (const name of ACCOUNT_CLIS) {
    const r = run(`${name} anything`, set);
    expect(r.code).toBe(1);
    expect(r.err).toContain("Integrations");
  }
  // macOS checks each new executable the first time it runs, which takes a moment per file.
}, 60_000);

test("local tools still run, and no GitHub sign-in or token reaches an agent", async () => {
  const { set, unset } = await accountGuardEnv(false, "/usr/bin:/bin");
  expect(run("echo hi", set).out).toBe("hi\n");
  expect(set.GH_CONFIG_DIR).toBeTruthy();
  expect(unset).toContain("GH_TOKEN");
  expect(unset).toContain("GITHUB_TOKEN");
  expect(unset).toContain("VERCEL_TOKEN");
});

test("a watched pull request keeps the GitHub CLI and its sign-in, and nothing else", async () => {
  const { set, unset } = await accountGuardEnv(true, "/usr/bin:/bin");
  expect(set.GH_CONFIG_DIR).toBeUndefined();
  expect(unset).not.toContain("GH_TOKEN");
  expect(unset).toContain("VERCEL_TOKEN");
  expect(run("command -v gh", set).out).not.toContain("account-guard");
  expect(run("vercel whoami", set).code).toBe(1);
});
