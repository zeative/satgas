import { expect, test } from "bun:test";
import { bare } from "../../../../src/web/features/team/command";

test("a command shown on the card drops the cd into the workspace", () => {
  expect(bare("cd /tmp/satgas-step && du -sh .")).toBe("du -sh .");
  expect(bare('cd "/tmp/my dir"; ls -la')).toBe("ls -la");
  expect(bare("ls -la")).toBe("ls -la");
  expect(bare("cd /tmp")).toBe("cd /tmp");
});
