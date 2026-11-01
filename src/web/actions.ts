import { sinks } from "../shared/graph";
import type { Run } from "../shared/types";
import { t } from "./i18n";
import { cancelRun, createRun, deleteRun, openRun } from "./state";
import { confirmRequest, toast } from "./ui";

// Every mutation the UI offers goes through here, so menus, the palette and shortcuts behave identically.

export const isLiveRun = (run: Run) => run.status === "planning" || run.status === "running";

export function finalReport(run: Run): string {
  return sinks(run.nodes)
    .map((n) => n.output?.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export async function runAgain(run: Run) {
  try {
    const next = await createRun(run.prompt, run.cwd);
    openRun(next.id);
  } catch (e) {
    toast((e as Error).message, "hazard");
  }
}

export async function copyReport(run: Run) {
  try {
    await navigator.clipboard.writeText(finalReport(run));
    toast(t.reportCopied);
  } catch {
    toast(t.copyFailed, "hazard");
  }
}

export async function cancelMission(run: Run) {
  try {
    await cancelRun(run.id);
  } catch (e) {
    toast((e as Error).message, "hazard");
  }
}

export function requestDelete(run: Run) {
  confirmRequest.value = {
    title: t.confirmDeleteTitle,
    text: t.confirmDeleteText,
    confirmLabel: t.deleteMission,
    pendingLabel: t.deleting,
    cancelLabel: t.keepMission,
    danger: true,
    onConfirm: async () => {
      await deleteRun(run.id);
      openRun(null);
      toast(t.missionDeleted);
    },
  };
}
