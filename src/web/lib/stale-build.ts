// After an update the server only has the new build, so a tab still running the old one fails to load its next
// piece of code. Loading the page again picks up the new build; the guard keeps a real failure from looping.
const STALE =
  /dynamically imported module|importing a module script failed|error loading dynamically imported|not a valid javascript mime type|failed to fetch dynamically/i;
const KEY = "satgas:reloaded-for-build";
const WINDOW_MS = 30_000;

export const isStaleBuild = (error: unknown) => STALE.test(error instanceof Error ? error.message : String(error));

export function reloadForNewBuild(storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage, now = Date.now()): boolean {
  const last = Number(storage.getItem(KEY)) || 0;
  if (now - last < WINDOW_MS) return false;
  storage.setItem(KEY, String(now));
  window.location.reload();
  return true;
}
