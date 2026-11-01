import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveWorkFile } from "../../src/server/files";

let root: string;
let outside: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "satgas-files-"));
  outside = await mkdtemp(join(tmpdir(), "satgas-outside-"));
  await Bun.write(join(root, "site/index.html"), "<h1>ok</h1>");
  await Bun.write(join(outside, "secret.txt"), "secret");
  await symlink(outside, join(root, "escape"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

test("serves files inside the working folder in a sandbox", async () => {
  const res = await serveWorkFile(root, "site/index.html");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-security-policy")).toContain("sandbox");
});

test("refuses traversal and symlinks that lead outside the folder", async () => {
  expect((await serveWorkFile(root, "../secret.txt")).status).toBe(404);
  expect((await serveWorkFile(root, "escape/secret.txt")).status).toBe(404);
  expect((await serveWorkFile(root, "missing.txt")).status).toBe(404);
});
