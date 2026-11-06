import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../../src/server/config";
import { claimUploads, MAX_ATTACHMENT, pruneUploads, safeName, stageUpload } from "../../src/server/uploads";

let dir = "";
const original = config.dataDir;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "satgas-uploads-"));
  config.dataDir = dir;
});

afterAll(async () => {
  config.dataDir = original;
  await rm(dir, { recursive: true, force: true });
});

const upload = (name: string, body: string | Uint8Array<ArrayBuffer>) =>
  new Request("http://localhost/api/uploads", { method: "POST", headers: { "x-file-name": encodeURIComponent(name) }, body });

test("names stay plain file names, never paths or hidden files", () => {
  expect(safeName("../../etc/passwd")).toBe("passwd");
  expect(safeName(".env")).toBe("env");
  expect(safeName("Foto liburan (1).JPG")).toBe("Foto liburan -1-.JPG");
  expect(safeName("")).toBe("file");
});

test("staged files move into the workspace's attachments folder, renamed on clashes", async () => {
  const cwd = join(dir, "work");
  const a = await stageUpload(upload("brief.pdf", "one"));
  const b = await stageUpload(upload("brief.pdf", "two"));
  if (!("id" in a) || !("id" in b)) throw new Error("staging failed");
  const files = await claimUploads([a.id, b.id, "not-an-id", 42], cwd);
  expect(files).toEqual(["attachments/brief.pdf", "attachments/brief-2.pdf"]);
  expect(await Bun.file(join(cwd, "attachments", "brief-2.pdf")).text()).toBe("two");
  expect(await claimUploads([a.id], cwd)).toEqual([]);
});

test("empty and oversized files are refused", async () => {
  expect(await stageUpload(upload("empty.txt", ""))).toMatchObject({ status: 400 });
  expect(await stageUpload(upload("big.bin", new Uint8Array(MAX_ATTACHMENT + 1)))).toMatchObject({ status: 413 });
});

test("files staged for a prompt that was never sent are cleared after a day", async () => {
  const staged = await stageUpload(upload("old.txt", "x"));
  if (!("id" in staged)) throw new Error("staging failed");
  const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await utimes(join(dir, "uploads", staged.id), old, old);
  await pruneUploads();
  expect(await readdir(join(dir, "uploads"))).not.toContain(staged.id);
});
