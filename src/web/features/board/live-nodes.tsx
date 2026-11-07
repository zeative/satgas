import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import {
  BookOpen,
  Eye,
  FilePen,
  Globe,
  ImageIcon,
  type LucideIcon,
  MessageSquare,
  Plug,
  Search,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { memo } from "react";
import { t } from "@/i18n";
import { avatarInk } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { MiniFace } from "../team/face";
import type { Tail } from "../team/tail";
import { SLOT_H, SLOT_PAD, SLOT_W, STEP_H, type Step } from "./live";

export type SlotNodeType = Node<{ title: string; who: { id: string; name: string } | null; steps: Step[] }, "slot">;
export type CursorNodeType = Node<{ who: { id: string; name: string }; now: Tail | null; typing: boolean }, "cursor">;

// Where a running task's work will land, showing the work as it happens: its latest steps, newest at the bottom.
export const SlotNode = memo(function SlotNode({ data }: NodeProps<SlotNodeType>) {
  const { title, who, steps } = data;
  return (
    <>
      <div className="absolute -top-7 left-0 flex h-6 max-w-full items-center gap-2 text-[11px] text-muted-foreground">
        {who && (
          <span className="flex shrink-0 items-center gap-2 ps-0.5">
            <MiniFace seed={who.id} className="size-3.5" />
            {who.name}
            <span aria-hidden="true">·</span>
          </span>
        )}
        <span className="truncate">{title}</span>
      </div>
      {/* As tall as what it holds, up to the spot kept for the work, so a task that just started is not an empty box;
          when it is full the oldest step gives way, never the newest. */}
      <div
        className="satgas-card satgas-slot flex flex-col justify-end overflow-hidden rounded-xl bg-card px-3"
        style={{ width: SLOT_W, maxHeight: SLOT_H, paddingBlock: SLOT_PAD }}
        aria-busy="true"
      >
        {steps.length ? (
          <ol className="flex flex-col">
            {steps.map((s, i) => {
              const Icon = STEP_ICON[s.kind] ?? Wrench;
              const now = i === steps.length - 1;
              return (
                <li key={s.seq} className="satgas-step-in flex min-w-0 flex-col">
                  <span
                    className={cn("flex min-w-0 items-center gap-2.5 text-xs", now ? "text-foreground" : "text-muted-foreground")}
                    style={{ height: STEP_H }}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className={cn("truncate", s.code && "font-mono text-[11px]", now && "satgas-shimmer")}>{s.text}</span>
                  </span>
                  {/* The newest step's latest output, like the bottom of a terminal. */}
                  {now && s.out && (
                    <pre
                      className={cn(
                        "mb-1 ms-6 overflow-hidden rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px] leading-4 whitespace-pre text-muted-foreground",
                        s.failed && "text-destructive",
                      )}
                    >
                      {s.out}
                    </pre>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <span className="satgas-shimmer h-7 text-xs leading-7">{t.team.doing.thinking}</span>
        )}
      </div>
      <Handle type="target" position={Position.Left} isConnectable={false} className="invisible" />
    </>
  );
});

// One icon per kind of step, as in the chat's activity rows.
const STEP_ICON: Partial<Record<Step["kind"], LucideIcon>> = {
  command: SquareTerminal,
  edit: FilePen,
  read: Eye,
  image: ImageIcon,
  search: Search,
  web: Globe,
  mcp: Plug,
  skill: BookOpen,
  text: MessageSquare,
};

// A teammate's pointer on the board, on the card they touch this moment, tagged with their name in their own colour.
export const CursorNode = memo(function CursorNode({ data }: NodeProps<CursorNodeType>) {
  const { who, typing } = data;
  const ink = avatarInk(who.id);
  return (
    // While writing, the pointer runs along the line it is writing; otherwise it rests where its last step put it.
    <div
      className={cn(
        "pointer-events-none flex items-start gap-0.5 text-xs leading-none font-medium text-[#0d0d0e]",
        typing && "satgas-cursor-type",
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="size-4 shrink-0">
        <path d="M2 1.5 14 7.2 8.4 8.6 6 14.5Z" fill={ink} stroke="#0d0d0e" strokeWidth="1" />
      </svg>
      <span className="mt-3 rounded px-2 py-1 whitespace-nowrap" style={{ background: ink }}>
        {who.name}
      </span>
    </div>
  );
});
