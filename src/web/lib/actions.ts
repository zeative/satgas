import type { NavigateFn } from "@tanstack/react-router";
import { toast } from "sonner";
import { finalTasks, joinReports } from "@/features/missions/rounds";
import { t } from "@/i18n";
import { dropDraft } from "@/lib/drafts";
import { cancelRun, createRun, deleteRun, forkBoard, handleSummary, mergeBack } from "@/stores/runs";
import type { Run } from "../../shared/types";
import { copyText } from "./clipboard";

// Every mission action goes through here, so the page, the menu and the command palette behave identically.

let navigate: NavigateFn = async () => {};

// main.tsx binds the router here; importing it directly closes an import cycle through the route tree.
export function bindNavigate(fn: NavigateFn) {
  navigate = fn;
}

export const isLiveRun = (run: Run) => run.status === "planning" || run.status === "running";

// Live work, or questions waiting on the person; either can be stopped.
export const canStop = (run: Run) => isLiveRun(run) || run.status === "asking";

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
    await copyText(finalReport(run));
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
export async function deleteMission(run: Pick<Run, "id">, { stay = false } = {}) {
  await deleteRun(run.id);
  void dropDraft(`board:${run.id}`);
  if (!stay) void navigate({ to: "/" });
  toast.success(t.missionDeleted);
}

// A copy of the board and its folder opens right away, so the person keeps working in it.
export async function forkMission(run: Run) {
  try {
    const fork = await forkBoard(run.id);
    handleSummary(fork);
    openMission(fork.id);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

// Brings a fork's changes into the board it came from and says what came over and what was left.
export async function mergeMission(run: Run) {
  try {
    const r = await mergeBack(run.id);
    const merged = t.fork.merged(r.applied.length, r.cards);
    if (r.conflicts.length)
      toast.warning(merged, { description: `${t.fork.conflicts(r.conflicts.length)}: ${r.conflicts.slice(0, 6).join(", ")}` });
    else toast.success(merged);
  } catch (e) {
    toast.error((e as Error).message);
  }
}
