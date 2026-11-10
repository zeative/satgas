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

test("answers a byte range the way a video player asks for it", async () => {
  await Bun.write(join(root, "clip.mp4"), "0123456789");
  const part = await serveWorkFile(root, "clip.mp4", "bytes=2-5");
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe("bytes 2-5/10");
  expect(part.headers.get("content-type")).toBe("video/mp4");
  expect(part.headers.get("content-security-policy")).toContain("sandbox");
  expect(await part.text()).toBe("2345");
  expect(await (await serveWorkFile(root, "clip.mp4", "bytes=8-")).text()).toBe("89");
  expect(await (await serveWorkFile(root, "clip.mp4", "bytes=-3")).text()).toBe("789");
  expect(await (await serveWorkFile(root, "clip.mp4", "bytes=7-99")).text()).toBe("789");
});

test("a range past the end is refused, and one it cannot read gets the whole file", async () => {
  await Bun.write(join(root, "short.mp4"), "abc");
  const past = await serveWorkFile(root, "short.mp4", "bytes=9-");
  expect(past.status).toBe(416);
  expect(past.headers.get("content-range")).toBe("bytes */3");
  const odd = await serveWorkFile(root, "short.mp4", "bytes=0-1,2-2");
  expect(odd.status).toBe(200);
  expect(odd.headers.get("accept-ranges")).toBe("bytes");
  expect(await odd.text()).toBe("abc");
});

test("refuses traversal and symlinks that lead outside the folder", async () => {
  expect((await serveWorkFile(root, "../secret.txt")).status).toBe(404);
  expect((await serveWorkFile(root, "escape/secret.txt")).status).toBe(404);
  expect((await serveWorkFile(root, "missing.txt")).status).toBe(404);
});
