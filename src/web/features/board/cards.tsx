import { Handle, type Node, type NodeProps, NodeResizer, Position, type ReactFlowState, useStore } from "@xyflow/react";
import { ExternalLink, Lock, Maximize2, RotateCw } from "lucide-react";
import { memo, useContext, useDeferredValue, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Card } from "../../../shared/board";
import { FullDetail, keyedSrc, useBoard } from "./context";
import { PALETTE } from "./palette";
import { savedStrokePath } from "./stroke";
import { parseTable, tableText } from "./table-text";

export type CardNodeType = Node<{ card: Card; editing: boolean; solo: boolean }, "card">;

export const EXPANDABLE = new Set<Card["kind"]>(["doc", "table", "image", "preview", "code", "files"]);
const handle = "satgas-handle size-2.5 border-2 border-background bg-muted-foreground";

const PAPER = "bg-[oklch(0.95_0.07_95)] text-[oklch(0.25_0.03_85)] shadow-sm dark:bg-[oklch(0.38_0.06_90)] dark:text-[oklch(0.96_0.02_95)]";

// The surface each kind sits on: paper for notes, nothing for free text, shapes and ink, a quiet panel for frames.
function shellOf(card: Card): string {
  if (card.kind === "note") return card.color ? `${PALETTE[card.color].note} shadow-sm` : PAPER;
  if (card.kind === "text" || card.kind === "shape" || card.kind === "drawing") return "";
  if (card.kind === "frame") return "rounded-xl border bg-muted/25";
  return "border bg-card text-card-foreground shadow-sm";
}

const BARE = new Set<Card["kind"]>(["drawing", "frame"]);
// Kinds whose content is costly to draw; below DETAIL_ZOOM they become placeholders, and they keep layout to themselves.
const HEAVY = new Set<Card["kind"]>(["doc", "table", "code", "preview", "files"]);
// Below this zoom body text is a few pixels tall and unreadable anyway.
export const DETAIL_ZOOM = 0.4;
const isFar = (s: ReactFlowState) => s.transform[2] < DETAIL_ZOOM;
// Person-made docs, tables and code are edited in place; agent-made ones mirror files and open to read.
export const editableCard = (card: Card) =>
  card.kind === "note" ||
  card.kind === "text" ||
  card.kind === "shape" ||
  card.kind === "frame" ||
  (!card.from && (card.kind === "doc" || card.kind === "table" || card.kind === "code"));

export const CardNode = memo(function CardNode({ data, selected, width, height }: NodeProps<CardNodeType>) {
  const { card, editing, solo } = data;
  const { commit, expand, runId, fileKey } = useBoard();
  // A boolean selector, so panning re-renders nothing and zooming only re-renders when the threshold is crossed.
  // Deferred, starting as a placeholder: crossing the threshold or scrolling a card into view fills detail in the
  // background, interruptibly, instead of blocking the pan or zoom.
  const zoomedOut = useDeferredValue(useStore(isFar), true);
  const fullDetail = useContext(FullDetail);
  const far = zoomedOut && !fullDetail;
  // While resizing, a live page must not swallow the pointer, or the resize sticks once the cursor crosses it.
  const [resizing, setResizing] = useState(false);
  const opensInTab = (card.kind === "preview" || card.kind === "image") && card.src;
  const quick = solo && !editing && (EXPANDABLE.has(card.kind) || opensInTab);
  const lockShown = selected && card.locked;

  return (
    <>
      {card.kind !== "drawing" && (
        <NodeResizer
          isVisible={solo && !editing && !card.locked}
          minWidth={120}
          minHeight={80}
          lineClassName="border-foreground/30!"
          handleClassName="size-2! rounded-[2px]! border-foreground/50! bg-background!"
          onResizeStart={() => setResizing(true)}
          onResizeEnd={(_, p) => {
            setResizing(false);
            commit([{ op: "patch", id: card.id, patch: { x: p.x, y: p.y, w: p.width, h: p.height } }]);
          }}
        />
      )}

      {/* A label above the card; while selected it gains quick open actions. Everything else lives in the right-click menu. */}
      {(card.title || quick || lockShown) && (
        <div className="absolute -top-8 left-0 flex h-7 max-w-full items-center gap-0.5">
          {lockShown && (
            <span title={t.boardMenu.locked} className="flex shrink-0 px-0.5 text-muted-foreground">
              <Lock aria-hidden="true" className="size-3" />
              <span className="sr-only">{t.boardMenu.locked}</span>
            </span>
          )}
          {card.title && <span className="card-handle truncate px-0.5 text-xs text-muted-foreground">{card.title}</span>}
          {quick && (
            <span className="nodrag flex shrink-0 items-center rounded-md border bg-card p-0.5 shadow-sm">
              {EXPANDABLE.has(card.kind) && (
                <BarButton label={t.board.expand} onClick={() => expand(card)}>
                  <Maximize2 />
                </BarButton>
              )}
              {opensInTab && (
                <BarButton label={t.board.open} onClick={() => window.open(keyedSrc(card.src, runId, fileKey), "_blank", "noopener")}>
                  <ExternalLink />
                </BarButton>
              )}
            </span>
          )}
        </div>
      )}

      <div
        className={cn(
          "size-full overflow-hidden rounded-lg",
          shellOf(card),
          card.kind === "drawing" && "pointer-events-none",
          card.kind === "frame" && "overflow-visible",
          HEAVY.has(card.kind) && "[contain:content]",
          far && "shadow-none",
          selected && card.kind !== "drawing" && "ring-2 ring-foreground/35",
        )}
      >
        {far && HEAVY.has(card.kind) ? (
          <FarBody card={card} />
        ) : (
          // Only a shape draws from its size, and only it gets the live one, so other bodies stay memoized through a resize.
          <CardBody
            card={card}
            active={selected && !resizing}
            editing={editing}
            w={card.kind === "shape" ? width : undefined}
            h={card.kind === "shape" ? height : undefined}
          />
        )}
      </div>

      {!BARE.has(card.kind) && (
        <>
          <Handle type="target" position={Position.Left} className={handle} />
          <Handle type="source" position={Position.Right} className={handle} />
        </>
      )}
    </>
  );
});

// What a heavy card shows from far away: its frame and a hint of text, in a couple of elements.
function FarBody({ card }: { card: Card }) {
  if (card.kind === "preview")
    return (
      <div aria-hidden="true" className="flex size-full flex-col">
        <div className="h-8 shrink-0 border-b bg-muted/40" />
        <div className="flex-1 bg-muted/30" />
      </div>
    );
  return (
    <div aria-hidden="true" className="size-full p-4">
      <div className="satgas-far-lines size-full w-5/6" />
    </div>
  );
}

function BarButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

interface BodyProps {
  card: Card;
  active?: boolean;
  // `large` renders the same card inside the expanded dialog, with room to read.
  large?: boolean;
  editing?: boolean;
  // The size on screen mid-resize, ahead of the saved one.
  w?: number;
  h?: number;
}

// Memoized on the card itself, so dragging or selecting a card never redraws its content.
export const CardBody = memo(function CardBody({ card, active = false, large = false, editing = false, w, h }: BodyProps) {
  const { runId, fileKey } = useBoard();
  switch (card.kind) {
    case "note":
      return <EditableText card={card} editing={editing} className="p-3 text-sm leading-6" placeholder={t.board.noteHint} />;
    case "text":
      return (
        <EditableText
          card={card}
          editing={editing}
          className="px-1 py-0.5 text-xl leading-snug font-medium"
          placeholder={t.board.textHint}
        />
      );
    case "shape":
      return <ShapeBody card={card} editing={editing} w={w ?? card.w} h={h ?? card.h} />;
    case "frame":
      return (
        <EditableText
          card={card}
          editing={editing}
          className="h-8 truncate px-3 text-xs leading-8 font-medium text-muted-foreground"
          placeholder={t.board.frameName}
          singleLine
        />
      );
    case "doc":
      return card.from || large ? (
        <div className={cn("nowheel size-full overflow-auto", large ? "p-6" : "p-4")}>
          <Markdown text={card.text ?? ""} />
        </div>
      ) : (
        <EditableText
          card={card}
          editing={editing}
          className="nowheel overflow-auto p-4 text-sm leading-6"
          placeholder={t.board.textHint}
          display={(text) => <Markdown text={text} />}
        />
      );
    case "table":
      return card.from || large ? (
        <TableBody rows={card.rows ?? []} />
      ) : (
        <EditableText
          card={card}
          editing={editing}
          className="nowheel overflow-auto p-3 font-mono text-xs leading-5"
          placeholder={t.board.tableHint}
          value={tableText(card.rows ?? [])}
          toPatch={(text) => ({ rows: parseTable(text) })}
          display={() => <TableBody rows={card.rows ?? []} />}
        />
      );
    case "image":
      return card.src ? (
        <img
          src={keyedSrc(card.src, runId, fileKey)}
          alt={card.title ?? ""}
          draggable={false}
          loading="lazy"
          decoding="async"
          className="size-full bg-muted/40 object-contain"
        />
      ) : null;
    case "preview":
      return <PreviewBody card={card} interactive={active || large} />;
    case "code":
      return card.from || large ? (
        <pre className="nowheel size-full overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre">
          <code>{card.text}</code>
        </pre>
      ) : (
        <EditableText
          card={card}
          editing={editing}
          className="nowheel overflow-auto p-3 font-mono text-xs leading-5 whitespace-pre"
          placeholder="// …"
        />
      );
    case "files":
      return (
        <ul className="nowheel flex size-full flex-col gap-1 overflow-auto p-3 text-xs">
          {(card.files ?? []).map((f) => (
            <li key={f.path} className="flex items-center gap-2">
              <span
                className={cn(
                  "w-14 shrink-0 text-muted-foreground",
                  f.change === "added" && "text-emerald-600 dark:text-emerald-500",
                  f.change === "deleted" && "text-destructive",
                )}
              >
                {t.board.change[f.change]}
              </span>
              <span className="truncate font-mono" title={f.path}>
                {f.path}
              </span>
            </li>
          ))}
        </ul>
      );
    case "drawing":
      return (
        <svg
          width={card.w}
          height={card.h}
          className={cn("pointer-events-none overflow-visible", PALETTE[card.color ?? "ink"].ink, card.highlight && "opacity-40")}
          aria-hidden="true"
        >
          <path
            d={savedStrokePath(card.points ?? NO_POINTS, card.size, card.highlight)}
            fill="currentColor"
            className="pointer-events-auto"
          />
        </svg>
      );
  }
});

const NO_POINTS: number[] = [];

interface EditableProps {
  card: Card;
  editing: boolean;
  className?: string;
  placeholder: string;
  singleLine?: boolean;
  // Defaults to the card's text; tables pass their rows as lines and read them back.
  value?: string;
  toPatch?: (text: string) => Partial<Card>;
  display?: (text: string) => React.ReactNode;
}

// Shows the card's content and, while the card is being edited, the same content as a field that saves on blur.
function EditableText({ card, editing, className, placeholder, singleLine, value, toPatch, display }: EditableProps) {
  const { commit, setEditingId, hasCard } = useBoard();
  const current = value ?? card.text ?? "";
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(current);
  // The text editing started from: a save only happens when the person changed it, so another tab's edit isn't undone.
  const base = useRef(current);

  // Seeded once per edit; a change from another tab while typing must not replace the draft or reselect it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `current` is read only when editing begins.
  useEffect(() => {
    if (!editing) return;
    base.current = current;
    setDraft(current);
    field.current?.focus();
    field.current?.select();
  }, [editing]);

  const save = (text: string) => {
    if (text === base.current) return;
    base.current = text;
    if (hasCard(card.id)) commit([{ op: "patch", id: card.id, patch: toPatch ? toPatch(text) : { text } }]);
    else toast.error(t.board.editLost);
  };
  // Unmounting mid-edit (scrolled off screen, zoomed to a placeholder, deleted in another tab) keeps the words or says why not.
  const unmount = useRef({ editing, draft, save });
  unmount.current = { editing, draft, save };
  useEffect(
    () => () => {
      const { editing, draft, save } = unmount.current;
      if (editing) save(draft);
    },
    [],
  );

  if (editing) {
    return (
      <textarea
        ref={field}
        value={draft}
        rows={singleLine ? 1 : undefined}
        aria-label={t.board.kind[card.kind]}
        className={cn("nodrag nowheel size-full resize-none bg-transparent outline-none", className)}
        onChange={(e) => setDraft(singleLine ? e.target.value.replace(/\n/g, " ") : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (singleLine && e.key === "Enter")) e.currentTarget.blur();
          e.stopPropagation();
        }}
        onBlur={() => {
          setEditingId(null);
          save(draft);
        }}
      />
    );
  }
  if (current && display) return <div className={cn("size-full", className)}>{display(current)}</div>;
  return (
    <p className={cn("size-full overflow-hidden whitespace-pre-wrap", className, !current && "opacity-50")}>{current || placeholder}</p>
  );
}

// A shape is its outline in the card's color with an editable label in the middle.
function ShapeBody({ card, editing, w, h }: { card: Card; editing: boolean; w: number; h: number }) {
  const fill = PALETTE[card.color ?? "blue"].shape;
  return (
    <div className="relative size-full">
      <svg width={w} height={h} className="absolute inset-0 overflow-visible" aria-hidden="true">
        {(card.shape ?? "rect") === "rect" && <rect x="1" y="1" width={w - 2} height={h - 2} rx="10" className={fill} strokeWidth="1.5" />}
        {card.shape === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} className={fill} strokeWidth="1.5" />}
        {card.shape === "diamond" && (
          <path
            d={`M${w / 2} 1 L${w - 1} ${h / 2} L${w / 2} ${h - 1} L1 ${h / 2}Z`}
            className={fill}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
        {card.shape === "triangle" && (
          <path d={`M${w / 2} 1 L${w - 1} ${h - 1} L1 ${h - 1}Z`} className={fill} strokeWidth="1.5" strokeLinejoin="round" />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <EditableText card={card} editing={editing} className="h-auto max-h-full text-center text-sm leading-5" placeholder="" />
      </div>
    </div>
  );
}

function TableBody({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="nowheel size-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        {head && (
          <thead className="sticky top-0 bg-muted">
            <tr>
              {head.map((cell, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their position.
                <th key={i} className="border-b px-2.5 py-1.5 text-start font-medium whitespace-nowrap">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are parsed from immutable data and never reorder.
            <tr key={r} className="border-b last:border-0">
              {row.map((cell, c) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells have no identity beyond their position.
                <td key={c} className="px-2.5 py-1.5 align-top tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The page runs sandboxed in an opaque origin; it only takes clicks while its card is selected, so the board stays draggable.
function PreviewBody({ card, interactive }: { card: Card; interactive: boolean }) {
  const [nonce, setNonce] = useState(0);
  const { runId, fileKey } = useBoard();
  return (
    <div className="flex size-full flex-col">
      <div className="card-handle flex h-8 shrink-0 items-center gap-2 border-b bg-muted/40 px-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{card.src?.split("/files/")[1] ?? card.src}</span>
        <Button
          variant="ghost"
          size="icon"
          className="nodrag size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          aria-label={t.board.reload}
          title={t.board.reload}
          onClick={() => setNonce((n) => n + 1)}
        >
          <RotateCw />
        </Button>
      </div>
      <iframe
        key={nonce}
        src={keyedSrc(card.src, runId, fileKey)}
        title={card.title ?? card.src ?? "preview"}
        sandbox="allow-scripts allow-forms"
        loading="lazy"
        className={cn("nodrag nowheel min-h-0 w-full flex-1 bg-white", !interactive && "pointer-events-none")}
      />
    </div>
  );
}
