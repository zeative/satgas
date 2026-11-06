import { create } from "zustand";
import { t } from "@/i18n";
import type { UpdateInfo } from "../../shared/updates";

interface UpdatesState {
  info: UpdateInfo | null;
  checking: boolean;
  // The version being installed, from Update until the new server answers.
  target: string | null;
  error: string | null;
}

export const useUpdates = create<UpdatesState>(() => ({ info: null, checking: false, target: null, error: null }));

async function read(check: boolean): Promise<UpdateInfo> {
  const res = await fetch(`/api/update${check ? "?check=1" : ""}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as UpdateInfo;
}

// A failed read keeps what is known: no notice is better than a false one.
export async function loadUpdates(check = false) {
  useUpdates.setState({ checking: true });
  try {
    useUpdates.setState({ info: await read(check), checking: false });
  } catch {
    useUpdates.setState({ checking: false });
  }
}

const POLL = 1500;
const PATIENCE = 5 * 60 * 1000;

// The server goes away while it restarts, so failed reads are expected until the new version answers.
async function follow(target: string) {
  const deadline = Date.now() + PATIENCE;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL));
    const info = await read(false).catch(() => null);
    if (!info) continue;
    useUpdates.setState({ info });
    if (info.current === target) return window.location.reload();
    if (info.stage === "idle" && info.error) return useUpdates.setState({ target: null, error: info.error });
  }
  useUpdates.setState({ target: null, error: t.update.tooLong });
}

export async function installUpdate() {
  const target = useUpdates.getState().info?.latest;
  if (!target) return;
  useUpdates.setState({ target, error: null });
  const res = await fetch("/api/update", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
  if (!res?.ok) {
    const body = res ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
    return useUpdates.setState({ target: null, error: body?.error ?? t.update.failed });
  }
  await follow(target);
}
