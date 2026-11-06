import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { t } from "@/i18n";
import { revertFiles } from "@/stores/runs";
import { baseName } from "./file-tree";

const tw = t.workspace;
const SHOWN = 3;

const nameThem = (paths: string[]) => {
  const names = paths.slice(0, SHOWN).map(baseName).join(", ");
  return paths.length > SHOWN ? tw.undoMore(names, paths.length - SHOWN) : names;
};

interface Asked {
  node: string;
  paths: string[];
  // Files changed again after the task: their later edits go too, so that takes a second yes.
  since?: string[];
}

// Every way to undo a task's files goes through here: it asks first, and asks again if later work would be lost.
export function useRevert(runId: string) {
  const [asked, setAsked] = useState<Asked | null>(null);
  // The dialog keeps its words while it animates away, instead of blanking as it closes.
  const lastAsked = useRef<Asked>({ node: "", paths: [] });
  if (asked) lastAsked.current = asked;
  const words = lastAsked.current;
  const confirm = async () => {
    if (!asked) return;
    const r = await revertFiles(runId, asked.node, asked.paths, !!asked.since);
    if (r.changedSince.length && !r.reverted.length) {
      setAsked({ ...asked, since: r.changedSince });
      return;
    }
    toast.success(tw.undone(r.reverted.length));
    setAsked(null);
  };
  const dialog = (
    <ConfirmDialog
      open={!!asked}
      onOpenChange={(open) => !open && setAsked(null)}
      title={words.since ? tw.undoTitle : tw.undoAskTitle(words.paths.length)}
      desc={words.since ? tw.undoText(nameThem(words.since)) : tw.undoAskText(nameThem(words.paths))}
      confirmText={words.since ? tw.undoAnyway : tw.undoAskConfirm}
      destructive
      handleConfirm={confirm}
    />
  );
  return { revert: (node: string, paths: string[]) => setAsked({ node, paths }), dialog };
}
