import { describe, expect, test } from "bun:test";
import type { NodeState } from "../../../../src/shared/types";
import { changesOf, foldersHolding, treeOf } from "../../../../src/web/features/workspace/file-tree";

describe("treeOf", () => {
  test("puts things in name order, numbers naturally, ignoring case", () => {
    const root = treeOf(["b.ts", "A.ts", "f10.ts", "f2.ts", "zed/x.ts", "Apps/y.ts"]);
    expect(root.dirs.map((d) => d.name)).toEqual(["Apps", "zed"]);
    expect(root.files).toEqual(["A.ts", "b.ts", "f2.ts", "f10.ts"]);
  });

  test("folds a chain of lone folders into one row that keeps the deepest path", () => {
    const root = treeOf(["app/(terminal)/s/page.tsx", "app/(terminal)/s/x.ts"]);
    expect(root.dirs).toHaveLength(1);
    expect(root.dirs[0]).toMatchObject({ name: "app/(terminal)/s", path: "app/(terminal)/s" });
    expect(root.dirs[0]?.files).toEqual(["app/(terminal)/s/page.tsx", "app/(terminal)/s/x.ts"]);
  });

  test("stops folding where a folder holds more than one thing", () => {
    const root = treeOf(["app/page.tsx", "app/api/zapi/route.ts"]);
    expect(root.dirs[0]?.name).toBe("app");
    expect(root.dirs[0]?.dirs[0]).toMatchObject({ name: "api/zapi", path: "app/api/zapi" });
  });

  test("keeps an empty folder", () => {
    expect(treeOf(["empty/"]).dirs[0]).toMatchObject({ name: "empty", dirs: [], files: [] });
  });
});

test("changesOf skips what was undone and a new file stays new through later edits", () => {
  const nodes = [
    {
      changes: {
        files: [
          { path: "a.ts", change: "added" },
          { path: "gone.ts", change: "added" },
        ],
        reverted: ["gone.ts"],
      },
    },
    {
      changes: {
        files: [
          { path: "a.ts", change: "modified" },
          { path: "b.ts", change: "modified" },
        ],
      },
    },
    { changes: { files: [{ path: "b.ts", change: "deleted" }] } },
  ] as unknown as NodeState[];
  expect([...changesOf(nodes)]).toEqual([
    ["a.ts", "added"],
    ["b.ts", "deleted"],
  ]);
});

test("foldersHolding names every folder above a changed file", () => {
  expect([...foldersHolding(["app/api/route.ts", "root.ts"])]).toEqual(["app", "app/api"]);
});
