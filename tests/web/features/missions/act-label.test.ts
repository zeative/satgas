import "../../../helpers/browser";
import { expect, test } from "bun:test";

const { commandPart, shortPath } = await import("../../../../src/web/features/missions/act-label");

test("shortens a path inside the board's folder", () => {
  expect(shortPath("/data/workspaces/a/src/app.ts", "/data/workspaces/a")).toBe("src/app.ts");
  expect(shortPath("/data/other/app.ts", "/data/workspaces/a")).toBe("/data/other/app.ts");
});

test("macOS reports /tmp as /private/tmp, which must not leave a stray word behind", () => {
  expect(shortPath("/private/tmp/data/a/launch-email.md", "/tmp/data/a")).toBe("launch-email.md");
  expect(shortPath("/tmp/data/a/launch-email.md", "/private/tmp/data/a")).toBe("launch-email.md");
  expect(shortPath("/private/tmp/data/a/x.md", "/private/tmp/data/a")).toBe("x.md");
});

test("a command row skips moving to its folder, so rows stop reading the same", () => {
  expect(commandPart("cd /tmp/data/a && bun run build")).toBe("bun run build");
  expect(commandPart('cd "/tmp/my data" ; ls -la')).toBe("ls -la");
  expect(commandPart("cd assets/photos && ls | cat -n; ffmpeg -v 0")).toBe("ls | cat -n; ffmpeg -v 0");
});

test("a command that does nothing but move, or moves later, stays whole", () => {
  expect(commandPart("cd /tmp/data/a")).toBe("cd /tmp/data/a");
  expect(commandPart("bun i && cd web")).toBe("bun i && cd web");
});
