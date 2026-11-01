import { expect, test } from "bun:test";
import { decodePath, serveWeb } from "../../src/server/web";

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
