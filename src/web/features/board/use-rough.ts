import { useEffect, useState } from "react";

type Rough = typeof import("./rough").roughPaths;

let loaded: Rough | null = null;
let loading: Promise<Rough> | null = null;

// The sketchy line library loads the first time a card asks for it; most boards never do.
export function useRough(): Rough | null {
  const [rough, setRough] = useState<Rough | null>(() => loaded);
  useEffect(() => {
    if (rough) return;
    let live = true;
    loading ??= import("./rough").then((m) => {
      loaded = m.roughPaths;
      return loaded;
    });
    void loading.then((r) => {
      // Stored behind a function: a function handed straight to setState would be called as an updater.
      if (live) setRough(() => r);
    });
    return () => {
      live = false;
    };
  }, [rough]);
  return rough;
}
