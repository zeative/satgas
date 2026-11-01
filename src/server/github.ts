import { config } from "./config";

const TTL = 60 * 60 * 1000;
// Offline or a private repo answers with nothing; try again sooner than a success would.
const RETRY = 5 * 60 * 1000;

let cache: { at: number; stars: number | null } | undefined;
let inflight: Promise<number | null> | undefined;

// The repo's public star count, cached so the home page never waits on GitHub; null when it cannot be known.
export function repoStars(): Promise<number | null> {
  if (cache && Date.now() - cache.at < (cache.stars === null ? RETRY : TTL)) return Promise.resolve(cache.stars);
  inflight ??= fetchStars()
    .then((stars) => {
      cache = { at: Date.now(), stars };
      return stars;
    })
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

async function fetchStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${config.repo}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "satgas" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: unknown };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}
