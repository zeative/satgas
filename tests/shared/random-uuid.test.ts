import { afterEach, expect, test } from "bun:test";
import { Glob } from "bun";
import { randomUuid } from "../../src/shared/random-uuid";

const HOME = "src/shared/random-uuid.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const real = crypto.randomUUID;

afterEach(() => {
  crypto.randomUUID = real;
});

test("makes a v4 uuid", () => {
  expect(randomUuid()).toMatch(UUID);
});

test("still works where the browser has no randomUUID, as on plain http", () => {
  crypto.randomUUID = undefined as unknown as typeof crypto.randomUUID;
  const a = randomUuid();
  expect(a).toMatch(UUID);
  expect(randomUuid()).not.toBe(a);
});

// It blanks the whole app on plain http and never shows on localhost.
test("code the browser loads never calls crypto.randomUUID directly", async () => {
  const strays: string[] = [];
  for (const pattern of ["src/web/**/*.{ts,tsx}", "src/shared/**/*.ts"]) {
    for await (const path of new Glob(pattern).scan(".")) {
      if (path !== HOME && (await Bun.file(path).text()).includes("crypto.randomUUID")) strays.push(path);
    }
  }
  expect(strays).toEqual([]);
});
