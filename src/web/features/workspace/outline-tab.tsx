import { Code, Files as FilesIcon, FileText, Frame, Image, MonitorPlay, Shapes, StickyNote, Table, Type } from "lucide-react";
import { useMemo, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Card, CardKind } from "../../../shared/board";
import type { Run } from "../../../shared/types";
import { focusOnBoard } from "../missions/chat-panel";
import { indentOf, ROW, RowIcon, TreeNote, TreeRow, TreeSection, useTreeKeys } from "./tree-row";

const tw = t.workspace;
const ICON: Partial<Record<CardKind, typeof Frame>> = {
  frame: Frame,
  note: StickyNote,
  doc: FileText,
  table: Table,
  image: Image,
  preview: MonitorPlay,
  code: Code,
  files: FilesIcon,
  text: Type,
  shape: Shapes,
};

const inside = (c: Card, f: Card) => c.id !== f.id && c.x >= f.x && c.y >= f.y && c.x + c.w <= f.x + f.w && c.y + c.h <= f.y + f.h;
const nameOf = (c: Card) =>
  c.title?.trim() ||
  c.text
    ?.replace(/[#*_`>[\]-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) ||
  (c.kind === "shape" ? t.board.shapeName[c.shape ?? "rect"] : undefined) ||
  tw.untitled;

// What is on the canvas as a list: frames with how much they hold, then the loose cards; a click flies there.
export function OutlineTab({ run }: { run: Run }) {
  const { frames, loose } = useMemo(() => {
    const cards = (run.board?.cards ?? []).filter((c) => c.kind !== "drawing");
    const frames = cards
      .filter((c) => c.kind === "frame")
      .map((f) => ({ card: f, holds: cards.filter((c) => c.kind !== "frame" && inside(c, f)).length }));
    const framed = new Set(cards.filter((c) => c.kind !== "frame" && frames.some((f) => inside(c, f.card))).map((c) => c.id));
    const byPlace = (a: Card, b: Card) => a.y - b.y || a.x - b.x;
    return {
      frames: frames.sort((a, b) => byPlace(a.card, b.card)),
      loose: cards.filter((c) => c.kind !== "frame" && !framed.has(c.id)).sort(byPlace),
    };
  }, [run.board?.cards]);

  const keys = useTreeKeys();
  if (!frames.length && !loose.length) return <TreeNote>{tw.outlineEmpty}</TreeNote>;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the rows inside; this only catches them as they bubble.
    <div ref={keys.ref} onKeyDown={keys.onKeyDown} className="group/tree flex flex-col py-1">
      {frames.length > 0 && (
        <Group title={tw.frames} items={frames}>
          {({ card, holds }) => <Row key={card.id} card={card} meta={tw.inFrame(holds)} />}
        </Group>
      )}
      {loose.length > 0 && (
        <Group title={tw.cards} items={loose}>
          {(c) => <Row key={c.id} card={c} />}
        </Group>
      )}
    </div>
  );
}

const PAGE = 40;

// A big board's outline grows by pages, so hundreds of rows only exist for someone who scrolled that far.
function Group<T>({ title, items, children }: { title: string; items: T[]; children: (item: T) => React.ReactNode }) {
  const [count, setCount] = useState(PAGE);
  const rest = items.length - count;
  return (
    <TreeSection title={title} count={items.length}>
      <ul className="flex flex-col">{items.slice(0, count).map(children)}</ul>
      {rest > 0 && (
        <button
          type="button"
          data-row={1}
          onClick={() => setCount((n) => n + PAGE)}
          className={cn(ROW, "text-xs text-muted-foreground")}
          style={{ paddingInlineStart: indentOf(1) }}
        >
          {t.chat.madeMore(rest)}
        </button>
      )}
    </TreeSection>
  );
}

function Row({ card, meta }: { card: Card; meta?: string }) {
  const Icon = ICON[card.kind] ?? Shapes;
  return (
    <TreeRow
      depth={1}
      inset={false}
      icon={
        <RowIcon>
          <Icon />
        </RowIcon>
      }
      label={nameOf(card)}
      title={nameOf(card)}
      end={meta && <span className="text-[11px] text-muted-foreground tabular-nums">{meta}</span>}
      onClick={() => focusOnBoard(card.id)}
    />
  );
}
