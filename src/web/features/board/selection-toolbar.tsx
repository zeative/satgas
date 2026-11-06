import { NodeToolbar, Position } from "@xyflow/react";
import { Copy, Frame, Group, Lock, LockOpen, MessageSquareText, MoreHorizontal, Sparkles, Trash2, Ungroup } from "lucide-react";
import { memo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isMac, t } from "@/i18n";
import { sendPrompt } from "@/stores/runs";
import type { Card } from "../../../shared/board";
import type { BoardActions } from "./board-actions";
import type { CardStyle } from "./edit";
import { StylePanel } from "./style-panel";

interface Props {
  cards: Card[];
  runId: string;
  actions: BoardActions;
  onComment: (card: Card) => void;
  // Opens the full right-click menu for the selection, from the toolbar's own spot.
  onMore: (ids: string[], x: number, y: number) => void;
  onStyle: (cards: Card[], style: CardStyle) => void;
}

// The few things done most to what is selected, floating above it; everything else stays one click away under More.
export const SelectionToolbar = memo(function SelectionToolbar({ cards, runId, actions, onComment, onMore, onStyle }: Props) {
  if (!cards.length) return null;
  const ids = cards.map((c) => c.id);
  const one = cards.length === 1 ? cards[0] : undefined;
  const locked = cards.every((c) => c.locked);
  const anyLocked = cards.some((c) => c.locked);
  const grouped = cards.length > 1 && !!cards[0]?.group && cards.every((c) => c.group === cards[0]?.group);
  const mod = isMac ? "⌘" : "Ctrl+";
  const fillable = one?.kind === "table" && !one.from && !one.locked;

  return (
    <NodeToolbar nodeId={ids} isVisible position={Position.Top} offset={40}>
      <div
        role="toolbar"
        aria-label={t.selectionBar.label}
        data-board-chrome
        className="nodrag flex items-center gap-0.5 rounded-xl border bg-card p-1 text-card-foreground shadow-sm"
      >
        {fillable && one && (
          <>
            <Tool
              label={t.selectionBar.fill}
              onClick={() =>
                void sendPrompt(runId, t.selectionBar.fillPrompt, [], [one.id]).then(
                  () => toast.success(t.widget.button.sent),
                  (e: Error) => toast.error(e.message),
                )
              }
            >
              <Sparkles />
            </Tool>
            <Divider />
          </>
        )}
        <StylePanel cards={cards} onStyle={(style) => onStyle(cards, style)} />
        {one && one.kind !== "drawing" && !(one.kind === "widget" && one.widget === "comment") && (
          <Tool label={t.selectionBar.comment} onClick={() => onComment(one)}>
            <MessageSquareText />
          </Tool>
        )}
        {cards.length > 1 &&
          (grouped ? (
            <Tool label={t.boardMenu.ungroup} hint={`⇧${mod}G`} onClick={() => actions.ungroup(ids)}>
              <Ungroup />
            </Tool>
          ) : (
            <Tool label={t.boardMenu.group} hint={`${mod}G`} onClick={() => actions.group(ids)}>
              <Group />
            </Tool>
          ))}
        {cards.length > 1 && (
          <Tool label={t.boardMenu.wrapFrame} onClick={() => actions.wrapFrame(ids)}>
            <Frame />
          </Tool>
        )}
        <Tool label={t.boardMenu.duplicate} hint={`${mod}D`} onClick={() => actions.duplicate(ids)}>
          <Copy />
        </Tool>
        <Tool label={locked ? t.boardMenu.unlock : t.boardMenu.lock} hint={`⇧${mod}L`} onClick={() => actions.setLocked(ids, !locked)}>
          {locked ? <LockOpen /> : <Lock />}
        </Tool>
        <Tool label={t.boardMenu.delete} hint="⌫" disabled={anyLocked} onClick={() => actions.remove(ids)}>
          <Trash2 />
        </Tool>
        <Divider />
        <Tool
          label={t.selectionBar.more}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMore(ids, r.left, r.bottom + 4);
          }}
        >
          <MoreHorizontal />
        </Tool>
      </div>
    </NodeToolbar>
  );
});

function Tool({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="size-8 rounded-lg text-muted-foreground hover:text-foreground [&_svg]:size-4"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label}
        {hint && <span className="ms-2 font-mono text-muted-foreground">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />;
