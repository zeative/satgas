import { expect, test } from "bun:test";
import {
  cleanCommands,
  cleanEntry,
  describeForLead,
  describeForTasks,
  hasMemoryFor,
  looksSecret,
  type MemoryEntry,
  rulesFor,
} from "../../src/shared/memory";

const base = { id: "a1", source: { by: "person" as const }, createdAt: 1 };
const entry = (over: Partial<MemoryEntry>): MemoryEntry => ({
  id: "x",
  kind: "memory",
  type: "about",
  text: "t",
  enabled: true,
  source: { by: "lead" },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

test("entries are bounded, typed, and never hold a secret", () => {
  expect(cleanEntry({ kind: "memory", type: "preference", text: "  Replies   in Indonesian " }, base, 5)).toEqual({
    id: "a1",
    kind: "memory",
    type: "preference",
    text: "Replies in Indonesian",
    enabled: true,
    source: { by: "person" },
    createdAt: 1,
    updatedAt: 5,
  });
  expect(cleanEntry({ kind: "rule", text: "Commits in English", scope: "/srv/app", type: "about" }, base)).toMatchObject({
    kind: "rule",
    scope: "/srv/app",
  });
  expect((cleanEntry({ kind: "rule", text: "x", type: "about" }, base) as MemoryEntry).type).toBeUndefined();
  expect(cleanEntry({ kind: "x", text: "a" }, base)).toBe("Say whether it is a memory or a rule.");
  expect(cleanEntry({ kind: "memory", text: " " }, base)).toBe("Write what to remember.");
  for (const secret of ["My key is sk-proj-abcdefghijklmnop1234", "token: hunter2hunter2", "ghp_abcdefghijklmnopqrstuvwxyz0123"])
    expect(looksSecret(secret)).toBe(true);
  expect(looksSecret("Deploys go to the VPS at /srv/satgas with Dokploy")).toBe(false);
});

test("the lead's commands are cut to what is well formed", () => {
  expect(
    cleanCommands([
      { op: "rule", text: "No emoji in the UI", why: "they said so" },
      { op: "remember", type: "weird", text: "Works at Nodewave" },
      { op: "forget", id: "b2" },
      { op: "remember", text: "" },
      { op: "fly" },
    ]),
  ).toEqual([
    { op: "rule", text: "No emoji in the UI", why: "they said so", scope: undefined, replaces: undefined },
    { op: "remember", type: "about", text: "Works at Nodewave", why: undefined, replaces: undefined },
    { op: "forget", id: "b2" },
  ]);
  expect(cleanCommands("nope")).toEqual([]);
});

test("rules apply by folder; the lead sees ids, tasks see the rules and what shapes the work", () => {
  const entries = [
    entry({ id: "r1", kind: "rule", type: undefined, text: "Commits in English", why: "repo is public" }),
    entry({ id: "r2", kind: "rule", type: undefined, text: "Use bun", scope: "/work/app" }),
    entry({ id: "r3", kind: "rule", type: undefined, text: "Off rule", enabled: false }),
    entry({ id: "m1", type: "preference", text: "Replies in Indonesian" }),
    entry({ id: "m2", type: "reference", text: "VPS is Hostinger" }),
  ];
  expect(rulesFor(entries, "/work/app/web").map((e) => e.id)).toEqual(["r1", "r2"]);
  expect(rulesFor(entries, "/work/application").map((e) => e.id)).toEqual(["r1"]);
  const lead = describeForLead(entries, "/work/app");
  expect(lead).toContain("[m2] (reference) VPS is Hostinger");
  expect(lead).toContain("[r1] Commits in English (why: repo is public)");
  expect(lead).not.toContain("Off rule");
  const tasks = describeForTasks(entries, "/elsewhere");
  expect(tasks.rules).toBe("- Commits in English (why: repo is public)");
  expect(tasks.person).toBe("- Replies in Indonesian");
});

test("empty or switched-off memory counts as nothing to read, even though the lead's text always says something", () => {
  const note = { id: "a", kind: "memory", text: "Prefers Bun", enabled: true } as MemoryEntry;
  expect(hasMemoryFor([], "/work")).toBe(false);
  expect(hasMemoryFor([{ ...note, enabled: false }], "/work")).toBe(false);
  expect(hasMemoryFor([note], "/work")).toBe(true);
});
