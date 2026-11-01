import { type Node, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { BaseHandle } from "@/components/flow/base-handle";
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from "@/components/flow/base-node";
import { StatusIcon } from "@/components/status";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { NodeState } from "../../../shared/types";

export type TaskNodeData = { task: NodeState; code: string };
export type TaskNodeType = Node<TaskNodeData, "task">;

const handle = "size-2 border-0 bg-muted-foreground/40";

export const TaskNode = memo(function TaskNode({ data }: NodeProps<TaskNodeType>) {
  const { task, code } = data;
  const live = task.status === "running";
  const now = useNow(live);
  const elapsed = task.startedAt ? fmtElapsed((live ? now : (task.endedAt ?? task.startedAt)) - task.startedAt) : null;
  const idle = task.status === "pending" || task.status === "skipped" || task.status === "cancelled";

  return (
    <div className={cn("relative w-60", (task.status === "skipped" || task.status === "cancelled") && "opacity-60")}>
      {live && <span className="satgas-running" aria-hidden="true" />}
      <BaseNode className={cn("w-60 rounded-lg", idle && "border-dashed", task.status === "failed" && "border-destructive/50")}>
        <BaseNodeHeader className="mb-0 px-3 pt-3 pb-0">
          <StatusIcon status={task.status} />
          <BaseNodeHeaderTitle className={cn("truncate text-sm font-medium", idle && "text-muted-foreground", live && "satgas-shimmer")}>
            {task.title}
          </BaseNodeHeaderTitle>
          <span className="font-mono text-xs text-muted-foreground">{code}</span>
        </BaseNodeHeader>
        <BaseNodeContent className="gap-1 px-3 pt-2 pb-3 text-xs text-muted-foreground">
          {task.status === "failed" && task.error ? (
            <p className="line-clamp-2 text-destructive">{task.error}</p>
          ) : (
            <p className="truncate">{task.role}</p>
          )}
          <div className="flex items-center justify-between">
            <span>{t.agent[task.agent]}</span>
            <span className="tabular-nums">{elapsed ?? t.node[task.status]}</span>
          </div>
        </BaseNodeContent>
      </BaseNode>
      <BaseHandle type="target" position={Position.Left} className={handle} />
      <BaseHandle type="source" position={Position.Right} className={handle} />
    </div>
  );
});
