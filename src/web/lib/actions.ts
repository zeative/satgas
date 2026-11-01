import type { NavigateFn } from "@tanstack/react-router";
import { toast } from "sonner";
import { finalTasks, joinReports } from "@/features/missions/rounds";
import { t } from "@/i18n";
import { cancelRun, createRun, deleteRun } from "@/stores/runs";
import type { Run } from "../../shared/types";

// Every mission action goes through here, so the page, the menu and the command palette behave identically.

let navigate: NavigateFn = async () => {};

// main.tsx binds the router here; importing it directly closes an import cycle through the route tree.
export function bindNavigate(fn: NavigateFn) {
  navigate = fn;
}

export const isLiveRun = (run: Run) => run.status === "planning" || run.status === "running";

export const finalReport = (run: Run): string => joinReports(finalTasks(run.nodes));

export function openMission(id: string) {
  void navigate({ to: "/boards/$boardId", params: { boardId: id } });
}

export async function runAgain(run: Run) {
  try {
    openMission((await createRun(run.prompt, run.cwd)).id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export async function copyReport(run: Run) {
  try {
    await navigator.clipboard.writeText(finalReport(run));
    toast.success(t.reportCopied);
  } catch {
    toast.error(t.copyFailed);
  }
}

// False when the cancel was refused, so a Stop button can come back instead of waiting forever.
export async function cancelMission(run: Run): Promise<boolean> {
  try {
    await cancelRun(run.id);
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  }
}

// Throws on failure so the confirm dialog can stay open and show the error.
export async function deleteMission(run: Run) {
  await deleteRun(run.id);
  void navigate({ to: "/" });
  toast.success(t.missionDeleted);
}
