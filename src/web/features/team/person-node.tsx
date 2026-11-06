import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo, useMemo } from "react";
import { RichText } from "@/components/rich-text";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useRuns } from "@/stores/runs";
import type { Member, PersonState } from "../../../shared/team";
import type { NodeState } from "../../../shared/types";
import { Face } from "./face";
import { tailOf } from "./tail";

export type PersonNodeData = {
  member: Member;
  task?: NodeState;
  state: PersonState;
  // The teammate this person's next task waits on.
  waitingFor?: string;
  // Hired for the request the team is on now.
  fresh: boolean;
};
export type PersonNodeType = Node<PersonNodeData, "person">;

// Edges attach out of sight: the face is what people look at, not the connectors.
const hidden = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

export const PersonNode = memo(function PersonNode({ data, selected }: NodeProps<PersonNodeType>) {
  const { member, task, state, waitingFor, fresh } = data;
  return (
    <div className="flex w-48 flex-col items-center text-center">
      <Handle type="target" position={Position.Top} className={hidden} isConnectable={false} />
      <Face
        seed={member.id}
        state={state}
        className={cn("transition-shadow", selected && "ring-2 ring-muted-foreground/60 ring-offset-2 ring-offset-background")}
      />
      <div className={cn("mt-2 max-w-full truncate text-sm font-medium", state === "idle" && "text-muted-foreground")}>{member.name}</div>
      <div className="max-w-full truncate text-xs text-muted-foreground">
        {member.role !== member.name ? member.role : null}
        {fresh ? `${member.role !== member.name ? " · " : ""}${t.team.newHire}` : state === "idle" ? ` · ${t.team.idle}` : null}
      </div>
      {task && state !== "idle" && <TaskCard task={task} state={state} waitingFor={waitingFor} />}
      {/* Where a question to or from a teammate leaves and lands: over the head, after the lead's line so that stays the default. */}
      <Handle type="source" id="talk-s" position={Position.Top} className={hidden} isConnectable={false} />
      <Handle type="target" id="talk-t" position={Position.Top} className={hidden} isConnectable={false} />
    </div>
  );
});

function TaskCard({ task, state, waitingFor }: { task: NodeState; state: PersonState; waitingFor?: string }) {
  const live = state === "working";
  const now = useNow(live);
  const elapsed = task.startedAt ? fmtElapsed((live ? now : (task.endedAt ?? task.startedAt)) - task.startedAt) : null;
  return (
    <div
      className={cn(
        "mt-3 w-full rounded-lg border bg-card px-3 py-2.5 text-start text-xs text-card-foreground shadow-xs",
        state === "waiting" && "border-dashed bg-transparent shadow-none",
        state === "failed" && "border-destructive/50",
      )}
    >
      <div className="line-clamp-2 text-foreground">{task.title}</div>
      {live && <Doing taskId={task.id} />}
      {state === "failed" && task.error ? (
        <p className="mt-1 line-clamp-2 text-destructive">
          <RichText text={task.error} />
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2 text-muted-foreground">
        {live ? (
          <Steps taskId={task.id} />
        ) : state === "waiting" ? (
          <span className="truncate">{waitingFor ? t.team.waitingFor(waitingFor) : t.team.waiting}</span>
        ) : (
          <span className={cn(state === "done" && "text-emerald-600 dark:text-emerald-500", state === "failed" && "text-destructive")}>
            {t.node[task.status]}
          </span>
        )}
        {elapsed && state !== "waiting" ? <span className="shrink-0 tabular-nums">{elapsed}</span> : null}
      </div>
    </div>
  );
}

// What they are doing this second, streamed from their log: the newest step's real command, file or words.
function Doing({ taskId }: { taskId: string }) {
  const lines = useRuns((s) => s.logs[taskId]);
  const now = useMemo(() => {
    for (let i = (lines?.length ?? 0) - 1; i >= 0; i--) {
      const l = lines?.[i];
      const item = l ? tailOf(l) : null;
      if (item) return item;
    }
    return null;
  }, [lines]);
  return (
    <div className="mt-1 h-4 overflow-hidden">
      {/* Keyed by the log line, so each new step rises in where the last one was. */}
      <div
        key={now?.seq ?? "thinking"}
        title={now?.text}
        className={cn("satgas-step-in truncate leading-4 satgas-shimmer", now?.code && "font-mono text-[11px]")}
      >
        {now?.text ?? t.team.doing.thinking}
      </div>
    </div>
  );
}

function Steps({ taskId }: { taskId: string }) {
  const n = useRuns((s) => s.logs[taskId]?.reduce((sum, l) => sum + (l.kind === "tool" ? 1 : 0), 0) ?? 0);
  return <span className="truncate text-signal-ink">{t.team.steps(n)}</span>;
}
