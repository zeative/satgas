export type Outcome = "done" | "failed" | "skipped" | "cancelled";

interface Options {
  concurrency: number;
  signal: AbortSignal;
  // Resolves on success, rejects on failure.
  run: (id: string) => Promise<void>;
  onSkip: (id: string, blockedBy: string) => void;
}

// Runs a DAG with bounded parallelism; a failed node skips its whole downstream branch, siblings keep going.
// Nodes sharing a lane never run at the same time.
export async function schedule(nodes: { id: string; dependsOn: string[]; lane?: string }[], opts: Options): Promise<Map<string, Outcome>> {
  const laneOf = new Map(nodes.map((n) => [n.id, n.lane]));
  const outcome = new Map<string, Outcome>();
  let waiting = [...nodes];
  const running = new Map<string, Promise<void>>();

  const settle = (id: string, result: Outcome) => {
    outcome.set(id, result);
    running.delete(id);
  };

  while (waiting.length || running.size) {
    if (opts.signal.aborted) {
      for (const n of waiting) outcome.set(n.id, "cancelled");
      waiting = [];
    }

    // Skipping can cascade, so repeat until no waiting node has a broken dependency.
    let skipped = true;
    while (skipped) {
      skipped = false;
      for (const n of waiting) {
        const blocker = n.dependsOn.find((d) => {
          const o = outcome.get(d);
          return o !== undefined && o !== "done";
        });
        if (blocker) {
          outcome.set(n.id, "skipped");
          opts.onSkip(n.id, blocker);
          skipped = true;
        }
      }
      waiting = waiting.filter((n) => !outcome.has(n.id));
    }

    for (const n of waiting) {
      if (running.size >= opts.concurrency) break;
      if (!n.dependsOn.every((d) => outcome.get(d) === "done")) continue;
      if (n.lane && [...running.keys()].some((id) => laneOf.get(id) === n.lane)) continue;
      running.set(
        n.id,
        opts.run(n.id).then(
          () => settle(n.id, "done"),
          () => settle(n.id, opts.signal.aborted ? "cancelled" : "failed"),
        ),
      );
    }
    waiting = waiting.filter((n) => !running.has(n.id));

    if (!running.size) break;
    await Promise.race(running.values());
  }
  return outcome;
}
