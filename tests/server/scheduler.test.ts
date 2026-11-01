import { expect, test } from "bun:test";
import { schedule } from "../../src/server/scheduler";

const n = (id: string, dependsOn: string[] = []) => ({ id, dependsOn });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("respects dependencies and the concurrency limit", async () => {
  const order: string[] = [];
  let active = 0;
  let peak = 0;
  const outcome = await schedule([n("a"), n("b"), n("c"), n("d", ["a", "b", "c"])], {
    concurrency: 2,
    signal: new AbortController().signal,
    onSkip: () => {},
    run: async (id) => {
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      order.push(id);
      active--;
    },
  });
  expect(peak).toBe(2);
  expect(order.at(-1)).toBe("d");
  expect([...outcome.values()].every((o) => o === "done")).toBe(true);
});

test("a failure skips only its downstream branch", async () => {
  const skipped: string[] = [];
  const outcome = await schedule([n("a"), n("b"), n("a2", ["a"]), n("b2", ["b"])], {
    concurrency: 4,
    signal: new AbortController().signal,
    onSkip: (id) => skipped.push(id),
    run: async (id) => {
      if (id === "a") throw new Error("boom");
    },
  });
  expect(outcome.get("a")).toBe("failed");
  expect(outcome.get("a2")).toBe("skipped");
  expect(outcome.get("b2")).toBe("done");
  expect(skipped).toEqual(["a2"]);
});

test("abort cancels running and waiting nodes", async () => {
  const ctrl = new AbortController();
  const outcome = await schedule([n("a"), n("b", ["a"])], {
    concurrency: 1,
    signal: ctrl.signal,
    onSkip: () => {},
    run: (id) =>
      new Promise((_, reject) => {
        setTimeout(() => ctrl.abort(), 5);
        ctrl.signal.addEventListener("abort", () => reject(new Error(`${id} aborted`)));
      }),
  });
  expect(outcome.get("a")).toBe("cancelled");
  expect(outcome.get("b")).toBe("cancelled");
});
