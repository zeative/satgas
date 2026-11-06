import type { Node } from "@xyflow/react";
import { MessageCircleQuestionMark, Undo2 } from "lucide-react";
import { memo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { unqueuePrompt, useRuns } from "@/stores/runs";
import { memberIdOf } from "../../../shared/team";
import type { Run } from "../../../shared/types";
import { ApprovalCard, SecretCard } from "../missions/chat-panel";
import { SetupLine } from "../missions/setup-line";

export const INBOX_ID = "inbox";
export const INBOX_W = 320;

export type InboxNodeType = Node<Record<string, never>, "inbox">;

// What the board waits on the person for, read live from the run.
export function waiting(run: Run) {
  const round = run.rounds?.length ?? 0;
  const questions = run.status === "asking" ? (run.asks?.[round]?.questions.length ?? 0) : 0;
  const setups = Object.entries(run.setups ?? {}).filter(
    ([, rec]) => rec.pending.some((p) => p.state === "waiting") || rec.keys.length > 0,
  );
  const secrets = (run.secrets ?? []).filter((a) => a.state === "waiting");
  const held = run.nodes.filter((n) => n.held);
  const queue = run.queue ?? [];
  return { questions, setups, secrets, held, queue, any: questions + setups.length + secrets.length + held.length + queue.length > 0 };
}

// Beside the lead while something needs the person: questions, setup to allow, secrets, held tasks, and what runs next.
// Each answer works here as in the chat, so nothing the team waits on hides behind a closed panel.
export const InboxNode = memo(function InboxNode() {
  const run = useRuns((s) => s.run);
  if (!run) return null;
  const w = waiting(run);
  const blocking = w.questions + w.setups.length + w.secrets.length + w.held.length;
  const name = (nodeId: string) => {
    const n = run.nodes.find((x) => x.id === nodeId);
    return n ? (run.team?.find((m) => m.id === memberIdOf(n))?.name ?? n.role) : nodeId;
  };
  return (
    <div
      style={{ width: INBOX_W }}
      className="nodrag nowheel flex flex-col gap-2 rounded-xl border bg-card p-2.5 text-card-foreground shadow-sm"
    >
      <p className="px-0.5 text-xs font-medium text-muted-foreground">{blocking ? t.inbox.title : t.inbox.upNext}</p>
      {w.questions > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-signal/50 px-3 py-2.5 text-xs">
          <MessageCircleQuestionMark className="size-3.5 shrink-0 text-signal-ink" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t.inbox.questions(w.questions)}</span>
          <Button type="button" size="sm" className="h-7" onClick={() => window.dispatchEvent(new Event("satgas:open-chat"))}>
            {t.inbox.answer}
          </Button>
        </div>
      )}
      {w.setups.map(([round, rec]) => (
        <SetupLine key={round} runId={run.id} round={Number(round)} rec={rec} />
      ))}
      {w.secrets.map((a) => (
        <SecretCard key={a.id} runId={run.id} ask={a} who={name(a.nodeId)} />
      ))}
      {w.held.map((n) => (
        <ApprovalCard key={n.id} runId={run.id} task={n} who={name(n.id)} />
      ))}
      {w.queue.length > 0 && (
        <div className="flex flex-col gap-1">
          {blocking > 0 && <p className="px-0.5 pt-1 text-xs text-muted-foreground">{t.inbox.upNext}</p>}
          <ul className="flex flex-col gap-1">
            {w.queue.map((q) => (
              <li key={q.id} className="group/q flex items-start gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
                <span className="line-clamp-3 min-w-0 flex-1 break-words">{q.prompt}</span>
                {!q.heard?.length && (
                  <button
                    type="button"
                    aria-label={t.inbox.remove}
                    title={t.inbox.remove}
                    onClick={() => void unqueuePrompt(run.id, q.id).catch((e: Error) => toast.error(e.message))}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Undo2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
