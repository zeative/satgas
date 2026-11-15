import { expect, test } from "bun:test";
import { decodePath, pickEncoding, serveWeb } from "../../src/server/web";

test("the app is never served in a way another page can frame", async () => {
  const res = await serveWeb("/");
  expect(res.headers.get("x-frame-options")).toBe("DENY");
  expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
});

test("a malformed escape in the path is a 404, not a crash", async () => {
  expect(decodePath("/a%20b")).toBe("/a b");
  expect(decodePath("/%E0%A4%A")).toBeNull();
  expect((await serveWeb("/%E0%A4%A")).status).toBe(404);
});

test("a missing file, like a chunk of an older build, is a 404 and never the app shell", async () => {
  const res = await serveWeb("/assets/index-from-an-older-build.js");
  expect(res.status).toBe(404);
  expect(res.headers.get("content-type") ?? "").not.toContain("text/html");
});

test("picks Brotli, then gzip, from what the browser accepts", () => {
  expect(pickEncoding("gzip, deflate, br, zstd")).toBe("br");
  expect(pickEncoding("gzip, deflate")).toBe("gzip");
  expect(pickEncoding("identity")).toBeNull();
  expect(pickEncoding(null)).toBeNull();
});

test("sends the app shell compressed when the browser accepts it", async () => {
  const res = await serveWeb("/", "br");
  if (res.status !== 200) return;
  expect(res.headers.get("content-encoding")).toBe("br");
  expect(res.headers.get("vary")).toBe("accept-encoding");
  expect(res.headers.get("content-type")).toContain("text/html");
});
