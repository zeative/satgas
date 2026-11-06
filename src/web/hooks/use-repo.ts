import { useEffect, useState } from "react";

export interface Repo {
  url: string;
  stars: number | null;
}

// Fetched once per page load and shared by every caller: the star count barely moves.
let cache: Promise<Repo | null> | undefined;
let known: Repo | null | undefined;

function load(): Promise<Repo | null> {
  cache ??= fetch("/api/repo")
    .then((r) => (r.ok ? (r.json() as Promise<Repo>) : null))
    .catch(() => null)
    .then((r) => {
      known = r;
      return r;
    });
  return cache;
}

// Where Satgas's source lives and its public star count; null until known or when the server cannot say.
export function useRepo(): Repo | null {
  const [repo, setRepo] = useState<Repo | null>(known ?? null);
  useEffect(() => {
    if (known !== undefined) return;
    let live = true;
    void load().then((r) => {
      if (live) setRepo(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return repo;
}
