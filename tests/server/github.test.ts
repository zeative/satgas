import { afterAll, expect, test } from "bun:test";
import { repoStars } from "../../src/server/github";

const realFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

test("reads the public star count once and serves it from cache", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ stargazers_count: 42 });
  }) as unknown as typeof fetch;
  expect(await repoStars()).toBe(42);
  expect(await repoStars()).toBe(42);
  expect(calls).toBe(1);
});
