import "../../helpers/browser";
import { afterAll, beforeEach, expect, test } from "bun:test";
import type { ProviderStatus } from "../../../src/shared/types";

const { loadProviders, useProviders } = await import("../../../src/web/stores/providers");

interface Call {
  url: string;
  answer: (status: number, body: unknown) => void;
}
let calls: Call[] = [];
// Every test file shares one process, so the real fetch comes back afterwards.
const realFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});
globalThis.fetch = ((url: string) =>
  new Promise<Response>((resolve) => {
    calls.push({ url: String(url), answer: (status, body) => resolve(new Response(JSON.stringify(body), { status })) });
  })) as unknown as typeof fetch;

const status = (kind: string): ProviderStatus[] => [{ kind, state: "ok", models: [] } as unknown as ProviderStatus];

beforeEach(() => {
  calls = [];
  useProviders.setState({ statuses: null, checking: false, error: null });
});

test("callers asking at once share one request", async () => {
  const a = loadProviders();
  const b = loadProviders();
  expect(calls.length).toBe(1);
  calls[0]?.answer(200, status("claude"));
  await Promise.all([a, b]);
  expect(useProviders.getState()).toMatchObject({ checking: false, statuses: status("claude") });
});

test("a refresh runs its own check, and the cached answer arriving later does not replace it", async () => {
  const cached = loadProviders();
  const fresh = loadProviders(true);
  expect(calls.map((c) => c.url)).toEqual(["/api/providers", "/api/providers?refresh=1"]);
  calls[1]?.answer(200, status("fresh"));
  await fresh;
  calls[0]?.answer(200, status("cached"));
  await cached;
  expect(useProviders.getState().statuses).toEqual(status("fresh"));
  expect(useProviders.getState().checking).toBe(false);
});

test("checking stays on until the newest request finishes", async () => {
  const cached = loadProviders();
  const fresh = loadProviders(true);
  calls[0]?.answer(200, status("cached"));
  await cached;
  expect(useProviders.getState().checking).toBe(true);
  calls[1]?.answer(200, status("fresh"));
  await fresh;
  expect(useProviders.getState().checking).toBe(false);
});

test("a failed check is reported instead of checking forever", async () => {
  const done = loadProviders();
  calls[0]?.answer(500, {});
  await done;
  expect(useProviders.getState()).toMatchObject({ checking: false, statuses: null, error: "Could not check the providers" });
});

test("a refresh after a change never reuses a check that started before it", async () => {
  const before = loadProviders(true);
  const after = loadProviders(true);
  expect(calls.length).toBe(2);
  calls[0]?.answer(200, status("old key"));
  calls[1]?.answer(200, status("new key"));
  await Promise.all([before, after]);
  expect(useProviders.getState().statuses).toEqual(status("new key"));
});
