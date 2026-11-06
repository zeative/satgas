import "../../../helpers/browser";
import { expect, test } from "bun:test";

const { shortPath } = await import("../../../../src/web/features/missions/act-label");

test("shortens a path inside the board's folder", () => {
  expect(shortPath("/data/workspaces/a/src/app.ts", "/data/workspaces/a")).toBe("src/app.ts");
  expect(shortPath("/data/other/app.ts", "/data/workspaces/a")).toBe("/data/other/app.ts");
});

test("macOS reports /tmp as /private/tmp, which must not leave a stray word behind", () => {
  expect(shortPath("/private/tmp/data/a/launch-email.md", "/tmp/data/a")).toBe("launch-email.md");
  expect(shortPath("/tmp/data/a/launch-email.md", "/private/tmp/data/a")).toBe("launch-email.md");
  expect(shortPath("/private/tmp/data/a/x.md", "/private/tmp/data/a")).toBe("x.md");
});
