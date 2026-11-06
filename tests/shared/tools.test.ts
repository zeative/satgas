import { describe, expect, test } from "bun:test";
import { DEFAULT_TOOLS, guardCheck, patchedFiles, resolveTool, sanitizeTools, TOOL_CATALOG } from "../../src/shared/tools";

const CWD = "/work/app";
const HOME = "/home/me";
const blocked = (cmd: string) => guardCheck(cmd, CWD, HOME);

describe("the command guard", () => {
  test("lets everyday work through", () => {
    for (const cmd of [
      "git status",
      "git push origin main",
      "git push --force-with-lease",
      "rm -rf node_modules dist",
      "rm -rf ./build && bun run build",
      "rm -rf /tmp/satgas-scratch",
      "rm file.txt ../notes.txt",
      "git checkout -b feature",
      "git restore --staged .",
      "echo 'drop it like it is hot'",
      "chmod -R 755 src",
    ])
      expect({ cmd, why: blocked(cmd) }).toEqual({ cmd, why: null });
  });

  test("stops what cannot be undone, wherever it hides in the line", () => {
    for (const cmd of [
      "rm -rf /",
      "rm -rf ~",
      "rm -rf ~/Documents",
      "rm -rf $HOME/projects",
      "rm -fr ..",
      "rm -r -f ../other-project",
      "cd src && rm -rf /etc/hosts",
      "rm -rf /work",
      "git push --force",
      "git push -f origin main",
      "git push origin +main",
      "git reset --hard HEAD~3",
      "git clean -fdx",
      "git checkout .",
      "psql -c 'DROP TABLE users'",
      "sudo rm file",
      "FOO=1 sudo make install",
      "dd if=/dev/zero of=/dev/disk2",
      "mkfs.ext4 /dev/sdb1",
      "chmod -R 777 /",
      ":(){ :|:& };:",
    ])
      expect({ cmd, why: typeof blocked(cmd) }).toEqual({ cmd, why: "string" });
  });
});

describe("stored tools", () => {
  test("catalog entries keep only their id and switch, custom ones are checked field by field", () => {
    expect(sanitizeTools([{ id: "a", catalogId: "rtk", enabled: false, command: "rm -rf /" }])).toEqual([
      { id: "a", catalogId: "rtk", enabled: false },
    ]);
    expect(sanitizeTools([{ id: "a", catalogId: "gone" }])).toEqual([]);
    expect(sanitizeTools([{ id: "b", name: "Lint", when: "edit", command: "eslint $SATGAS_FILE", needs: "eslint" }])).toEqual([
      { id: "b", enabled: true, name: "Lint", when: "edit", command: "eslint $SATGAS_FILE", needs: "eslint" },
    ]);
    expect(sanitizeTools([{ id: "c", name: "Lint", when: "edit" }])).toBeString();
    expect(sanitizeTools([{ id: "c", name: "jq", when: "available" }])).toBeString();
    expect(sanitizeTools([{ id: "c", name: "x", when: "edit", command: "x", needs: "two words" }])).toBeString();
    expect(sanitizeTools([{ id: "d", name: "x", when: "sometimes", command: "x" }])).toBeString();
    expect(sanitizeTools("nope")).toBeString();
  });

  test("RTK, the guard and agent-browser are on by default, and every catalog tool resolves", () => {
    expect(DEFAULT_TOOLS.map((t) => [t.catalogId, t.enabled])).toEqual([
      ["rtk", true],
      ["guard", true],
      ["agent-browser", true],
    ]);
    for (const def of TOOL_CATALOG) {
      const tool = resolveTool({ id: def.id, catalogId: def.id, enabled: true });
      expect(tool?.when).toBe(def.when);
      expect(!!(tool?.command || tool?.builtin || def.when === "available")).toBe(true);
    }
  });
});

test("a Codex patch names the files it touched", () => {
  const patch =
    "*** Begin Patch\n*** Add File: src/a.ts\n+x\n*** Update File: b.ts\n*** Move to: c.ts\n@@\n-y\n*** Delete File: d.ts\n*** End Patch";
  expect(patchedFiles(patch)).toEqual(["src/a.ts", "b.ts", "c.ts"]);
});
