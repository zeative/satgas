import { CircleAlert, CircleCheck, CircleDashed, CircleSlash, CircleStop, LoaderCircle, type LucideIcon } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { NodeStatus, RunStatus } from "../../shared/types";

type Status = NodeStatus | RunStatus;

// Each status has its own shape, so it never relies on color alone. Live work wears the signal color.
const look: Record<Status, { icon: LucideIcon; className: string }> = {
  pending: { icon: CircleDashed, className: "text-muted-foreground" },
  planning: { icon: LoaderCircle, className: "animate-spin text-signal-ink motion-reduce:animate-none" },
  running: { icon: LoaderCircle, className: "animate-spin text-signal-ink motion-reduce:animate-none" },
  done: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-500" },
  failed: { icon: CircleAlert, className: "text-destructive" },
  skipped: { icon: CircleSlash, className: "text-muted-foreground" },
  cancelled: { icon: CircleStop, className: "text-muted-foreground" },
};

export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const { icon: Icon, className: tone } = look[status];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", tone, className)} />;
}

export function statusLabel(status: Status): string {
  return status in t.run ? t.run[status as RunStatus] : t.node[status as NodeStatus];
}

export function StatusBadge({ status, children, className }: { status: Status; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
      <StatusIcon status={status} className="size-3.5" />
      <span className={cn("font-medium", (status === "running" || status === "planning") && "satgas-shimmer")}>{statusLabel(status)}</span>
      {children}
    </span>
  );
}
