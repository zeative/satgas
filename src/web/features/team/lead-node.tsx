import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { RunStatus } from "../../../shared/types";
import { Badge, Face } from "./face";

export type LeadNodeData = {
  status: RunStatus;
  // What the lead said about the plan, shown beside them while the team works.
  says?: string;
  startedAt?: number;
  endedAt?: number;
};
export type LeadNodeType = Node<LeadNodeData, "lead">;

// Every board's lead is the same person: the Claude session that runs the board.
const LEAD_SEED = "Lead";
const hidden = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";

export const LeadNode = memo(function LeadNode({ data, selected }: NodeProps<LeadNodeType>) {
  const { status, says, startedAt } = data;
  const busy = status === "planning" || status === "running";
  const now = useNow(busy);
  // A follow-up round keeps the last round's end time until this one ends, so a busy lead counts from its start alone.
  const elapsed = busy && startedAt ? fmtElapsed(now - startedAt) : null;
  const doing =
    status === "planning" ? t.team.planning : status === "asking" ? t.team.asking : status === "running" ? t.team.watching : t.team.resting;
  return (
    <div className="relative flex w-60 flex-col items-center text-center">
      <Face
        seed={LEAD_SEED}
        state={status === "planning" ? "working" : "lead"}
        size={80}
        className={cn(selected && "ring-2 ring-muted-foreground/60 ring-offset-2 ring-offset-background")}
      >
        <Badge className="size-[26px] bg-white shadow-xs ring-1 ring-foreground/10">
          <img src="/brands/claude.svg" alt="Claude" className="size-3.5" draggable={false} />
        </Badge>
      </Face>
      <div className="mt-2 text-sm font-medium">{t.team.lead}</div>
      <div className="max-w-full truncate text-xs text-muted-foreground">
        <span className={cn(status === "planning" && "satgas-shimmer")}>{doing}</span>
        {elapsed ? <span className="tabular-nums"> · {elapsed}</span> : null}
      </div>
      {says && status === "running" ? (
        <div className="absolute top-2 left-[calc(50%+56px)] w-56 rounded-xl rounded-tl-sm border bg-card px-3 py-2 text-start text-xs leading-[18px] text-card-foreground shadow-xs">
          <p className="line-clamp-3">{says}</p>
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className={hidden} isConnectable={false} />
    </div>
  );
});
