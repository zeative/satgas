import { create } from "zustand";
import { t } from "@/i18n";
import type { ProviderStatus } from "../../shared/types";

interface ProvidersState {
  statuses: ProviderStatus[] | null;
  checking: boolean;
  error: string | null;
}

export const useProviders = create<ProvidersState>(() => ({ statuses: null, checking: false, error: null }));

let inflight: { ticket: number; done: Promise<void> } | null = null;
let latest = 0;

// refresh re-runs every connection check on the server instead of reading its short cache.
// Plain reads share whatever request is running; a refresh always starts its own, since it may follow a change
// (a saved key) the running one predates. Only the newest request's answer lands.
export function loadProviders(refresh = false): Promise<void> {
  if (inflight && !refresh) return inflight.done;
  const ticket = ++latest;
  useProviders.setState({ checking: true });
  const done = (async () => {
    try {
      const res = await fetch(`/api/providers${refresh ? "?refresh=1" : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      const statuses = (await res.json()) as ProviderStatus[];
      if (ticket === latest) useProviders.setState({ statuses, checking: false, error: null });
    } catch {
      if (ticket === latest) useProviders.setState({ checking: false, error: t.integrations.providersFailed });
    } finally {
      if (inflight?.ticket === ticket) inflight = null;
    }
  })();
  inflight = { ticket, done };
  return done;
}
