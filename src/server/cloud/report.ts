// What a cloud instance tells its control plane: counts, ids and model names, never a prompt, a file or a reply. The
// control plane answers with the plan's state, which decides whether new work may start. Contract: docs/cloud-mode.md.
import { createHmac } from "node:crypto";
import type { Usage } from "../../shared/types";

export type CloudEvent =
  | { type: "round.started"; run: string; round: number }
  | { type: "lead.planned"; run: string; round: number; tasks: number; usage?: Usage }
  | {
      type: "task.finished";
      run: string;
      round: number;
      task: string;
      agent: string;
      status: "done" | "failed" | "cancelled";
      ms: number;
      usage?: Usage;
    };

export interface Quota {
  // When set, new rounds are refused with this message; everything already on the boards stays.
  blocked: string | null;
}

export interface Reporter {
  report(e: CloudEvent): void;
  quota(): Quota;
  flush(): Promise<void>;
  stop(): void;
  // Events dropped because the queue was full while the control plane could not be reached.
  dropped(): number;
}

const MAX_QUEUE = 1000;
const BATCH = 100;

export const signBody = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const quotaOf = (json: unknown): Quota | null => {
  const q = (json as { quota?: { blocked?: unknown; message?: unknown } } | null)?.quota;
  if (!q || typeof q.blocked !== "boolean") return null;
  return { blocked: q.blocked ? (typeof q.message === "string" && q.message.trim()) || "Your plan's limit is reached." : null };
};

export function createReporter(opts: {
  url: string;
  instance: string;
  secret: string;
  every?: number;
  fetch?: typeof fetch;
  now?: () => number;
}): Reporter {
  const send = opts.fetch ?? fetch;
  const base = `${opts.url.replace(/\/+$/, "")}/v1/instances/${encodeURIComponent(opts.instance)}`;
  const queue: (CloudEvent & { at: number })[] = [];
  let lost = 0;
  let state: Quota = { blocked: null };
  let failures = 0;
  let wait = 0;
  let busy: Promise<void> | null = null;

  const post = async (events: (CloudEvent & { at: number })[]) => {
    const body = JSON.stringify({ v: 1, events, dropped: lost });
    const res = await send(`${base}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-satgas-instance": opts.instance,
        "x-satgas-signature": signBody(opts.secret, body),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`control plane answered ${res.status}`);
    const q = quotaOf(await res.json().catch(() => null));
    if (q) state = q;
  };

  const flush = async () => {
    if (busy) return busy;
    busy = (async () => {
      while (queue.length) {
        const batch = queue.slice(0, BATCH);
        try {
          await post(batch);
        } catch {
          // Kept for the next try; a control plane that is down must not lose the counts or slow the work.
          failures++;
          wait = Math.min(2 ** failures, 30);
          return;
        }
        queue.splice(0, batch.length);
        failures = 0;
        lost = 0;
      }
    })().finally(() => {
      busy = null;
    });
    return busy;
  };

  let ticks = 0;
  const timer = setInterval(() => {
    if (wait > 0 && ++ticks < wait) return;
    ticks = 0;
    wait = 0;
    void flush();
  }, opts.every ?? 10_000);
  timer.unref?.();

  return {
    report(e) {
      queue.push({ ...e, at: (opts.now ?? Date.now)() });
      if (queue.length > MAX_QUEUE) {
        queue.splice(0, queue.length - MAX_QUEUE);
        lost++;
      }
    },
    quota: () => state,
    flush,
    stop: () => clearInterval(timer),
    dropped: () => lost,
  };
}

// Asks the plan's state outright, at start and now and then, so a block lifts without waiting for an event.
export async function fetchQuota(url: string, instance: string, secret: string, send: typeof fetch = fetch): Promise<Quota | null> {
  const path = `/v1/instances/${encodeURIComponent(instance)}/quota`;
  const res = await send(`${url.replace(/\/+$/, "")}${path}`, {
    headers: { "x-satgas-instance": instance, "x-satgas-signature": signBody(secret, path) },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  return quotaOf(await res.json().catch(() => null));
}
