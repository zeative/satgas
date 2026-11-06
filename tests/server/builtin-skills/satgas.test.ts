import { describe, expect, test } from "bun:test";
import { BUILTIN } from "../../../src/server/builtin-skills";
import { blockUnit, splitBlocks } from "../../../src/shared/board-blocks";
import { readSkillFile, validSkillName } from "../../../src/shared/skills";

const files = BUILTIN.satgas ?? {};
let n = 0;
const idFor = (key: string) => `${key}-${n++}`;

describe("the built-in satgas skill", () => {
  test("has a valid SKILL.md with a name and a description agents can match on", () => {
    const meta = readSkillFile(files["SKILL.md"] ?? "");
    expect(meta.name).toBe("satgas");
    expect(validSkillName(meta.name ?? "")).toBe(true);
    expect(meta.description?.length).toBeGreaterThan(100);
    expect(meta.description?.length).toBeLessThanOrEqual(1024);
  });

  test("links only to reference files it ships", () => {
    for (const [path, text] of Object.entries(files))
      for (const [, target] of text.matchAll(/\]\(((?:reference\/)?[\w-]+\.md)\)/g)) {
        const from = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
        const resolved = target?.startsWith("reference/") ? target : `${from}${target}`;
        expect(Object.keys(files)).toContain(resolved);
      }
  });

  // The examples teach agents the format, so each one must come out of Satgas's own parser as the cards it promises.
  test("every board example parses into a framed layout with working connectors", () => {
    let boards = 0;
    for (const [path, text] of Object.entries(files)) {
      for (const block of splitBlocks(text).blocks) {
        const unit = blockUnit(block, idFor);
        if (block.kind !== "board") continue;
        boards++;
        expect({ path, title: block.title, kind: unit.anchor.kind }).toEqual({ path, title: block.title, kind: "frame" });
        expect(unit.children.length).toBeGreaterThan(1);
        const ids = new Set(unit.children.map((c) => c.id));
        for (const l of unit.links) expect(ids.has(l.source) && ids.has(l.target)).toBe(true);
        // A promised link that silently vanished would mean an example points at an id that doesn't exist.
        const declared = (JSON.parse(block.body).links ?? []).length;
        expect(unit.links.length).toBe(declared);
      }
    }
    expect(boards).toBeGreaterThanOrEqual(6);
  });

  test("its simple block examples become the cards they describe", () => {
    const kinds = splitBlocks(files["SKILL.md"] ?? "").blocks.map((b) => blockUnit(b, idFor).anchor.kind);
    expect(kinds).toEqual(expect.arrayContaining(["table", "doc", "note", "code", "frame"]));
  });
});
