import { create } from "zustand";
import { t } from "@/i18n";
import type { Settings } from "../../shared/settings";

interface SettingsState {
  settings: Settings | null;
  error: string | null;
}

export const useSettings = create<SettingsState>(() => ({ settings: null, error: null }));

// One request at a time, so the server applies saves in the order they were made and a read never overtakes a write.
let queue: Promise<unknown> = Promise.resolve();
const inOrder = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
};
// Only the newest request's answer may replace what is on screen; older ones would undo a newer change.
let latest = 0;

export function loadSettings(): Promise<void> {
  const ticket = ++latest;
  return inOrder(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error(String(res.status));
      const settings = (await res.json()) as Settings;
      if (ticket === latest) useSettings.setState({ settings, error: null });
    } catch {
      if (ticket === latest) useSettings.setState({ error: t.integrations.loadFailed });
    }
  });
}

// Applies at once; a refused save reads the server's settings back and returns its reason.
export function saveSettings(next: Settings): Promise<string | null> {
  const ticket = ++latest;
  useSettings.setState({ settings: next });
  return inOrder(async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? t.integrations.saveFailed(res.status));
      if (ticket === latest) useSettings.setState({ settings: data as Settings });
      return null;
    } catch (e) {
      // A newer request settles the screen itself; restoring a snapshot here could undo it.
      if (ticket === latest) void loadSettings();
      return (e as Error).message;
    }
  });
}
