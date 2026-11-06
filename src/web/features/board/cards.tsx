import { Handle, type Node, type NodeProps, NodeResizer, Position, type ReactFlowState, useStore } from "@xyflow/react";
import { Download, ExternalLink, Lock, Maximize2, Monitor, RotateCw, Smartphone } from "lucide-react";
import { lazy, memo, Suspense, useContext, useDeferredValue, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LinkedText } from "@/components/linked-text";
import { InlineText, Markdown } from "@/components/markdown";
import { openExternal } from "@/components/outbound-link";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { type Card, isPdf } from "../../../shared/board";
import { MiniFace } from "../team/face";
import { FullDetail, keyedSrc, useBoard } from "./context";
import { useShiftKey } from "./keys";
import { PALETTE } from "./palette";
import { savedStrokePath } from "./stroke";
import { TableEditor } from "./table-editor";
import { useRough } from "./use-rough";
import { WIDGET_ICON } from "./widget-icon";

export type CardNodeType = Node<{ card: Card; editing: boolean; solo: boolean; author?: { id: string; name: string } }, "card">;

// Most boards have no widgets, and those that do load them as soon as one comes into view.
export const loadWidgets = () => import("./widgets");
const WidgetBody = lazy(() => loadWidgets().then((m) => ({ default: m.WidgetBody })));

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
const HEAVY = new Set<Card["kind"]>(["doc", "table", "code", "preview", "files", "widget"]);
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
  const { card, editing, solo, author } = data;
  const { commit } = useBoard();
  // A boolean selector, so panning re-renders nothing and zooming only re-renders when the threshold is crossed.
  // Deferred, starting as a placeholder: crossing the threshold or scrolling a card into view fills detail in the
  // background, interruptibly, instead of blocking the pan or zoom.
  const zoomedOut = useDeferredValue(useStore(isFar), true);
  const fullDetail = useContext(FullDetail);
  const far = zoomedOut && !fullDetail;
  // While resizing, a live page must not swallow the pointer, or the resize sticks once the cursor crosses it.
  const [resizing, setResizing] = useState(false);
  const opensInTab = (card.kind === "preview" || card.kind === "image") && card.src;
  const hasQuick =
    !editing && (EXPANDABLE.has(card.kind) || !!opensInTab || ((card.kind === "doc" || card.kind === "table") && !!card.src));
  const quick = solo && hasQuick;
  const lockShown = selected && card.locked;

  return (
    <>
      {card.kind !== "drawing" && solo && !editing && !card.locked && (
        <CardResizer
          card={card}
          onStart={() => setResizing(true)}
          onEnd={(p) => {
            setResizing(false);
            commit([{ op: "patch", id: card.id, patch: p }]);
          }}
        />
      )}

      {/* A label above the card: what a widget is, or the card's title, and a lock when it is locked. Quick actions sit
          inside the card's corner. */}
      {(card.title || lockShown || card.widget || author) && (
        <div className="absolute -top-8 left-0 flex h-7 max-w-full items-center gap-1 text-xs text-muted-foreground">
          {lockShown && (
            <span title={t.boardMenu.locked} className="flex shrink-0 px-0.5">
              <Lock aria-hidden="true" className="size-3" />
              <span className="sr-only">{t.boardMenu.locked}</span>
            </span>
          )}
          {card.widget && <WidgetLabel widget={card.widget} />}
          {/* Who made it, in place of a thread back to them across the board. */}
          {author && (
            <span className="flex shrink-0 items-center gap-1 ps-0.5 text-foreground">
              <MiniFace seed={author.id} className="size-4" />
              {author.name}
              {card.title && (
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
              )}
            </span>
          )}
          {card.title && <span className="card-handle truncate px-0.5">{card.title}</span>}
        </div>
      )}

      <div
        className={cn(
          "group/card relative size-full overflow-hidden rounded-lg",
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
        {/* A preview carries its actions in its own header bar; every other card in its top corner, on hover or selected. */}
        {hasQuick && card.kind !== "preview" && !far && (
          <span
            className={cn(
              "nodrag absolute top-1.5 right-1.5 z-10 flex items-center rounded-md border bg-card/95 p-0.5 opacity-0 shadow-xs transition-opacity group-hover/card:opacity-100",
              quick && "opacity-100",
            )}
          >
            <QuickActions card={card} />
          </span>
        )}
      </div>

      {card.kind === "drawing" && !card.from ? null : BARE.has(card.kind) ? (
        // Frames and ink take no connectors from people, but an agent's frame hangs off its task, and React Flow only
        // draws an edge between handles. A person's ink has no edge at all, so a board full of strokes skips them.
        <>
          <Handle type="target" position={Position.Left} isConnectable={false} className="invisible" />
          <Handle type="source" position={Position.Right} isConnectable={false} className="invisible" />
        </>
      ) : (
        <>
          <Handle type="target" position={Position.Left} className={handle} />
          <Handle type="source" position={Position.Right} className={handle} />
        </>
      )}
    </>
  );
});

function WidgetLabel({ widget }: { widget: NonNullable<Card["widget"]> }) {
  const Icon = WIDGET_ICON[widget];
  return (
    <span className="card-handle flex shrink-0 items-center gap-1 px-0.5">
      <Icon aria-hidden="true" className="size-3" />
      {t.widget.kind[widget]}
    </span>
  );
}

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
      ) : editing ? (
        <TableEditor card={card} />
      ) : (card.rows ?? []).some((r) => r.some(Boolean)) ? (
        <TableBody rows={card.rows ?? []} />
      ) : (
        <p className="size-full p-3 text-xs opacity-50">{t.board.tableHint}</p>
      );
    case "image":
      return card.src ? <ImageBody card={card} src={keyedSrc(card.src, runId, fileKey) ?? card.src} /> : null;
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
              {f.change === "deleted" ? (
                <span className="truncate font-mono" title={f.path}>
                  {f.path}
                </span>
              ) : (
                <a
                  href={`/api/runs/${runId}/files/${f.path.split("/").map(encodeURIComponent).join("/")}`}
                  download={f.path.split("/").pop()}
                  title={f.path}
                  className="nodrag truncate font-mono underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {f.path}
                </a>
              )}
            </li>
          ))}
        </ul>
      );
    case "widget":
      return (
        <Suspense fallback={null}>
          <WidgetBody card={card} />
        </Suspense>
      );
    case "drawing":
      if (card.line) return <LineBody card={card} />;
      return (
        <svg
          width={card.w}
          height={card.h}
          style={card.opacity ? { opacity: card.opacity } : undefined}
          className={cn("pointer-events-none overflow-visible", PALETTE[card.color ?? "ink"].ink, card.highlight && "opacity-40")}
          aria-hidden="true"
        >
          <path
            d={savedStrokePath(card.points ?? NO_POINTS, { size: card.size, highlight: card.highlight, pressure: card.pressure })}
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
    // A text card grows to hold what was typed, rather than clipping it.
    const need = card.kind === "text" ? (field.current?.scrollHeight ?? 0) : 0;
    const grow = need > card.h ? { h: need } : {};
    if (hasCard(card.id)) commit([{ op: "patch", id: card.id, patch: { ...(toPatch ? toPatch(text) : { text }), ...grow } }]);
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
    <p className={cn("size-full overflow-hidden whitespace-pre-wrap", className, !current && "opacity-50")}>
      {current ? <LinkedText text={current} /> : placeholder}
    </p>
  );
}

// Smallest a kind may be resized to: a shape can be a small mark, a card needs room for what it holds.
const MIN_SIZE: Partial<Record<Card["kind"], [number, number]>> = { shape: [16, 16], text: [60, 32], note: [80, 60] };

// Mounted only for the one card being resized, so holding Shift re-renders that card and no other.
function CardResizer({ card, onStart, onEnd }: { card: Card; onStart: () => void; onEnd: (p: Pick<Card, "x" | "y" | "w" | "h">) => void }) {
  const shift = useShiftKey();
  const [minW, minH] = MIN_SIZE[card.kind] ?? [120, 80];
  return (
    <NodeResizer
      isVisible
      // A picture stretches only in proportion, like on any whiteboard; Shift keeps the proportion for anything else.
      keepAspectRatio={card.kind === "image" || shift}
      minWidth={minW}
      minHeight={minH}
      lineClassName="border-foreground/30!"
      handleClassName="size-2! rounded-[2px]! border-foreground/50! bg-background!"
      onResizeStart={onStart}
      onResizeEnd={(_, p) => onEnd({ x: p.x, y: p.y, w: p.width, h: p.height })}
    />
  );
}

// How a stroke of width `w` breaks up: long dashes, or round dots that need a round cap to show.
export const dashArray = (dash: Card["dash"], w: number) =>
  dash === "dashed" ? `${w * 4} ${w * 3}` : dash === "dotted" ? `0 ${w * 2.5}` : undefined;

// A shape is its outline in the card's color with an editable label in the middle; fill, stroke and dash are its own.
function ShapeBody({ card, editing, w, h }: { card: Card; editing: boolean; w: number; h: number }) {
  const color = PALETTE[card.color ?? "blue"];
  const sw = card.stroke ?? 1.5;
  const inset = sw / 2 + 0.5;
  const fill = card.fill ?? "soft";
  const look = {
    className: cn(color.shape, fill === "none" && "fill-transparent!"),
    style: { ...(fill === "solid" ? { fill: "currentColor" } : {}), ...(card.rough ? { stroke: "none" } : {}) },
    strokeWidth: sw,
    strokeDasharray: dashArray(card.dash, sw),
    strokeLinecap: card.dash === "dotted" ? ("round" as const) : undefined,
    strokeLinejoin: "round" as const,
  };
  return (
    <div className="relative size-full" style={card.opacity ? { opacity: card.opacity } : undefined}>
      <svg width={w} height={h} className={cn("absolute inset-0 overflow-visible", color.ink)} aria-hidden="true">
        {(card.shape ?? "rect") === "rect" && <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx="10" {...look} />}
        {card.shape === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - inset} ry={h / 2 - inset} {...look} />}
        {card.shape === "diamond" && (
          <path d={`M${w / 2} ${inset} L${w - inset} ${h / 2} L${w / 2} ${h - inset} L${inset} ${h / 2}Z`} {...look} />
        )}
        {card.shape === "triangle" && <path d={`M${w / 2} ${inset} L${w - inset} ${h - inset} L${inset} ${h - inset}Z`} {...look} />}
        {card.rough ? (
          <RoughOutline
            card={card}
            w={w}
            h={h}
            className={color.shape}
            style={{ fill: "none" }}
            strokeWidth={sw}
            dash={look.strokeDasharray}
          />
        ) : null}
      </svg>
      <div className={cn("absolute inset-0 flex items-center justify-center p-4", fill === "solid" && color.solidText)}>
        <EditableText card={card} editing={editing} className="h-auto max-h-full text-center text-sm leading-5" placeholder="" />
      </div>
    </div>
  );
}

// The hand-drawn strokes of a sketchy card; only such a card pulls the sketch library in.
function RoughOutline({
  card,
  w,
  h,
  dash,
  head,
  strokeWidth,
  className,
  stroke,
  style,
}: {
  card: Card;
  w: number;
  h: number;
  dash?: string;
  head?: string;
  strokeWidth: number;
  className?: string;
  stroke?: string;
  style?: React.CSSProperties;
}) {
  const rough = useRough();
  if (!rough) return null;
  return (
    <>
      {rough(card, w, h).map((d, i) => (
        <path
          key={d}
          d={d}
          className={className}
          stroke={stroke}
          style={style}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd={i === 0 ? head : undefined}
        />
      ))}
    </>
  );
}

// A straight line or arrow through its points; a wide invisible stroke under it makes a thin line easy to grab.
function LineBody({ card }: { card: Card }) {
  const pts = card.points ?? NO_POINTS;
  const sw = card.stroke ?? 2;
  const pairs: string[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) pairs.push(`${pts[i]},${pts[i + 1]}`);
  const list = pairs.join(" ");
  const head = `head-${card.id}`;
  return (
    <svg
      width={card.w}
      height={card.h}
      style={card.opacity ? { opacity: card.opacity } : undefined}
      className={cn("pointer-events-none overflow-visible", PALETTE[card.color ?? "ink"].ink)}
      aria-hidden="true"
    >
      {card.line === "arrow" && (
        <defs>
          <marker id={head} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M1 1 L9 5 L1 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
      )}
      <polyline points={list} fill="none" stroke="transparent" strokeWidth={Math.max(14, sw + 10)} className="pointer-events-auto" />
      {card.rough ? (
        <RoughOutline
          card={card}
          w={card.w}
          h={card.h}
          stroke="currentColor"
          style={{ fill: "none" }}
          strokeWidth={sw}
          dash={dashArray(card.dash, sw)}
          head={card.line === "arrow" ? `url(#${head})` : undefined}
        />
      ) : (
        <polyline
          points={list}
          fill="none"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashArray(card.dash, sw)}
          markerEnd={card.line === "arrow" ? `url(#${head})` : undefined}
        />
      )}
    </svg>
  );
}

// Dark muted is translucent, so the header lays it over the card to stay solid above scrolled rows; its rule is a shadow so it sticks too.
const HEAD_CELL =
  "sticky top-0 z-[1] px-2.5 py-1.5 text-start font-medium whitespace-nowrap shadow-[inset_0_-1px_0_var(--border)] [background:linear-gradient(var(--muted),var(--muted)),var(--card)]";

function TableBody({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows;
  return (
    <div className="nowheel size-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        {head && (
          <thead>
            <tr>
              {head.map((cell, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their position.
                <th key={i} className={HEAD_CELL}>
                  <InlineText text={cell} />
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
                  <InlineText text={cell} />
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
// Phones are where pages break; the card shows one at a common phone width, centred, next to the full width.
const PHONE_W = 390;

function PreviewBody({ card, interactive }: { card: Card; interactive: boolean }) {
  const [nonce, setNonce] = useState(0);
  const [phone, setPhone] = useState(false);
  const page = !isPdf(card.src ?? "");
  const { runId, fileKey } = useBoard();
  return (
    <div className="flex size-full flex-col">
      <div className="card-handle flex h-8 shrink-0 items-center gap-2 border-b bg-muted/40 px-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{card.src?.split("/files/")[1] ?? card.src}</span>
        <QuickActions card={card} />
        {page && (
          <BarButton label={phone ? t.board.desktop : t.board.mobile} onClick={() => setPhone((v) => !v)}>
            {phone ? <Monitor /> : <Smartphone />}
          </BarButton>
        )}
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
        // A PDF needs the browser's own viewer, which a sandboxed frame refuses; it carries no page script to contain.
        sandbox={isPdf(card.src ?? "") ? undefined : "allow-scripts allow-forms"}
        loading="lazy"
        style={phone ? { width: PHONE_W, maxWidth: "100%" } : undefined}
        className={cn("nodrag nowheel min-h-0 w-full flex-1 bg-white", phone && "mx-auto border-x", !interactive && "pointer-events-none")}
      />
    </div>
  );
}

// How far a card's shape may differ from its picture's before it is reshaped to match.
const RATIO_SLACK = 0.03;

// A picture in its own proportions: when the card's shape does not match the image (a card made before its size was
// known), the card takes the image's ratio once, keeping its width, so nothing is letterboxed or cropped.
function ImageBody({ card, src }: { card: Card; src: string }) {
  const { commit, hasCard } = useBoard();
  return (
    <img
      src={src}
      alt={card.title ?? ""}
      draggable={false}
      loading="lazy"
      decoding="async"
      onLoad={(e) => {
        const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget;
        if (!nw || !nh || card.locked || !hasCard(card.id)) return;
        const want = nw / nh;
        if (Math.abs(card.w / card.h - want) / want <= RATIO_SLACK) return;
        commit([{ op: "patch", id: card.id, patch: imageFit(card.w, want) }]);
      }}
      className="size-full bg-muted/40 object-contain"
    />
  );
}

// The card's width kept, its height from the ratio; a very tall picture narrows instead, so it stays on screen.
export function imageFit(width: number, ratio: number, maxHeight = 900): { w: number; h: number } {
  const h = Math.round(width / ratio);
  if (h <= maxHeight) return { w: Math.round(width), h: Math.max(40, h) };
  return { w: Math.max(80, Math.round(maxHeight * ratio)), h: maxHeight };
}

// Expand and open-in-tab, the same two buttons wherever a card shows them.
function QuickActions({ card }: { card: Card }) {
  const { expand, runId, fileKey } = useBoard();
  const opensInTab = (card.kind === "preview" || card.kind === "image") && card.src;
  return (
    <>
      {EXPANDABLE.has(card.kind) && (
        <BarButton label={t.board.expand} onClick={() => expand(card)}>
          <Maximize2 />
        </BarButton>
      )}
      {opensInTab && (
        <BarButton label={t.board.open} onClick={() => openExternal(keyedSrc(card.src, runId, fileKey))}>
          <ExternalLink />
        </BarButton>
      )}
      {(card.kind === "doc" || card.kind === "table") && card.src && (
        <BarButton
          label={t.board.download(card.src.split("/").pop() ?? "")}
          onClick={() => {
            const a = document.createElement("a");
            a.href = card.src ?? "";
            a.download = decodeURIComponent(card.src?.split("/").pop() ?? "");
            a.click();
          }}
        >
          <Download />
        </BarButton>
      )}
    </>
  );
}
