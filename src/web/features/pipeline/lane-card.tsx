import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { memo, useMemo } from "react";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, t } from "@/i18n";
import { avatarTint, avatarUri } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import type { Column, LaneTask } from "../../../shared/pipeline";
import { tailOf } from "../team/tail";

export type CardKind = Column | "fail" | "ask";

// A small face; a working one wears the same amber sweep as on the canvas, a finished one a green check.
export function LaneFace({ seed, kind }: { seed: string; kind: CardKind }) {
  const working = kind === "work";
  return (
    <span className="relative row-span-2 mt-px size-5 shrink-0 self-start rounded-full">
      {working && <span className="satgas-face-ring on-card" aria-hidden="true" />}
      <img
        src={avatarUri(seed)}
        alt=""
        draggable={false}
        className={cn("absolute rounded-full", working ? "inset-0.5 size-4" : "inset-0 size-5", kind === "done" && "opacity-60 grayscale")}
        style={{ background: avatarTint(seed) }}
      />
      {kind === "done" && (
        <span className="absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-emerald-600 ring-[1.5px] ring-background dark:bg-emerald-500">
          <Check className="size-2 text-white" strokeWidth={4} />
        </span>
      )}
    </span>
  );
}

interface Props {
  boardId: string;
  task: LaneTask;
  kind: CardKind;
  name: string;
  // The lead's own cards (planning, asking) have no task to open.
  lead?: { title: string; sub: string };
}

const shell = (kind: CardKind) =>
  cn(
    "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-lg border px-2.5 py-2 text-start text-[13px] leading-[18px] transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    kind === "next" || kind === "done" ? "bg-transparent" : "bg-card shadow-xs hover:border-foreground/20",
    kind === "next" && "border-dashed border-foreground/15 hover:border-foreground/30",
    kind === "done" && "hover:bg-card/60",
    // A failure stops in red and a question waits in amber, on a thin edge so neither shouts.
    kind === "fail" && "shadow-[inset_2px_0_0_var(--destructive)]",
    kind === "ask" && "shadow-[inset_2px_0_0_var(--signal)]",
  );

export const LaneCard = memo(function LaneCard({ boardId, task, kind, name, lead }: Props) {
  const title = lead?.title ?? task.title;
  const body = (
    <>
      <LaneFace seed={task.member} kind={kind} />
      <span className={cn("col-span-2 truncate font-medium", kind === "done" && "font-normal text-muted-foreground")}>{title}</span>
      <Sub task={task} kind={kind} name={name} lead={lead} />
    </>
  );
  if (lead)
    return (
      <Link to="/boards/$boardId" params={{ boardId }} data-flip={task.id} className={shell(kind)}>
        {body}
      </Link>
    );
  return (
    <Link to="/boards/$boardId" params={{ boardId }} search={{ task: task.id }} data-flip={task.id} title={title} className={shell(kind)}>
      {body}
    </Link>
  );
});

function Sub({ task, kind, name, lead }: { task: LaneTask; kind: CardKind; name: string; lead?: Props["lead"] }) {
  const line = "truncate text-xs text-muted-foreground";
  const meta = "text-[11px] text-muted-foreground tabular-nums";
  if (lead)
    return (
      <>
        <span className={cn(line, kind === "ask" ? "text-signal-ink" : "satgas-shimmer")}>{lead.sub}</span>
        <span className={meta}>{kind === "ask" ? t.pipeline.asking : t.pipeline.planning}</span>
      </>
    );
  // A running task waiting on the person for a secret.
  if (kind === "ask" && task.needs)
    return (
      <>
        <span className={cn(line, "text-signal-ink")}>
          <span className="text-foreground/80">{name}</span> · {t.secret.needs(task.needs)}
        </span>
        <span className={meta}>{t.pipeline.columns.need}</span>
      </>
    );
  if (kind === "work") return <Working task={task} name={name} />;
  if (kind === "next")
    return (
      <span className={cn(line, "col-span-2")}>
        <span className="text-foreground/80">{name}</span>
        {task.waitFor ? ` · ${t.pipeline.after(task.waitFor)}` : null}
      </span>
    );
  if (kind === "fail")
    return (
      <>
        <span className={cn(line, "text-destructive")}>{task.error ?? t.node.failed}</span>
        <span className={meta}>{t.pipeline.failed}</span>
      </>
    );
  const took = task.startedAt && task.endedAt ? fmtElapsed(task.endedAt - task.startedAt) : null;
  return (
    <>
      <span className={line}>{name}</span>
      <span className={meta}>{took}</span>
    </>
  );
}

// Ticks on its own, so a running clock re-renders one card and not the page.
function Working({ task, name }: { task: LaneTask; name: string }) {
  const now = useNow(true);
  const step = useMemo(() => (task.last ? tailOf(task.last) : null), [task.last]);
  return (
    <>
      <span className="truncate text-xs text-muted-foreground">
        <span className="text-foreground/80">{name}</span>{" "}
        <span key={step?.seq ?? "thinking"} className={cn("satgas-shimmer", step?.code && "font-mono text-[11px]")}>
          {step?.text ?? t.team.doing.thinking}
        </span>
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{task.startedAt ? fmtElapsed(now - task.startedAt) : null}</span>
    </>
  );
}
