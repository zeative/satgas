import {
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type EdgeChange,
  getViewportForBounds,
  type Node,
  type NodeChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useViewport,
  ViewportPortal,
} from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/context/theme-provider";
import { useEvent } from "@/hooks/use-event";
import { isMac, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { uploadImage } from "@/stores/runs";
import { type Board, type BoardOp, type Card, type ColorName, DEFAULT_SIZE, emptyBoard } from "../../../shared/board";
import type { Run } from "../../../shared/types";
import { TaskNode, type TaskNodeType } from "../missions/task-node";
import { boardActions, type LocalClip } from "./board-actions";
import { type AddKind, BoardMenu, type MenuState, type MenuTarget } from "./board-menu";
import { CardBody, CardNode, type CardNodeType, editableCard } from "./cards";
import { BoardContext, FullDetail, newId } from "./context";
import { encodeClip, type Item, inside, layerOf, type Move, withGroups } from "./edit";
import { boardPng, copyPng, type ExportRequest, printPdf, savePng } from "./export";
import { PALETTE } from "./palette";
import { useBoardPrefs } from "./prefs";
import { shortcutOf } from "./shortcuts";
import { HIGHLIGHT_SIZE, STROKE_SIZE, strokePath } from "./stroke";
import { BoardToolbar, type Insert, TOOL_KEYS, type Tool, type ToolStyle } from "./toolbar";
import { useBoardHistory } from "./use-history";

// Tools that drop a new card where the person clicks.
const CREATES = new Set<Tool>(["note", "text", "shape", "frame"]);

const nodeTypes = { task: TaskNode, card: CardNode };
const BROKEN = new Set(["failed", "skipped", "cancelled"]);
const PAN_STEP = 80;
const PAN: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: 1, y: 0 },
  ArrowRight: { x: -1, y: 0 },
  ArrowUp: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
};
const EMPTY = emptyBoard();
const SNAP: [number, number] = [24, 24];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
// React Flow's own panOnScroll speed, so the drawing layers scroll like the board under them.
const PAN_SPEED = 0.5;
// Constant arrays: a fresh one per render makes React Flow re-bind its key listeners and zoom filter on every drag frame.
const DELETE_KEYS = ["Backspace", "Delete"];
const PAN_BUTTONS = [1, 2];
// Width the detail panel covers on the right, plus breathing room.
const PANEL_SPACE = 432;
// A drawing stores at most this many points, well under what the server accepts.
const MAX_STROKE_POINTS = 8000;

// The title pill, toolbar and mission bar float over the board, so fitting reserves room for them (and the panel).
const fitPadding = (panelOpen: boolean) => ({ top: "64px", left: "72px", bottom: "96px", right: panelOpen ? "432px" : "48px" }) as const;

const FOCUS_BOARD = "satgas:focus-board";
// A closing panel takes focus with it; once it is gone the board takes it, unless something else already has it.
export const focusBoard = () =>
  requestAnimationFrame(() => {
    const el = document.activeElement;
    if (!el || el === document.body) window.dispatchEvent(new Event(FOCUS_BOARD));
  });

// Board keys and clipboard act only with focus on the board, its toolbar, or nowhere; never from the chat or a panel.
const boardFocused = (surface: HTMLElement | null) => {
  const el = document.activeElement;
  return !el || el === document.body || !!surface?.contains(el) || !!el.closest("[data-board-chrome]");
};

type BoardNode = TaskNodeType | CardNodeType;
type Pt = { x: number; y: number };
// Start positions of the dragged leads, and of each node following one of them.
type Carried = { leads: Map<string, Pt>; items: Map<string, { from: Pt; lead: string }> };

// Where the followers belong once their leads sit at `now`: the same offset the lead travelled.
function carriedMoves(c: Carried | null, now: Map<string, Pt>): Move[] {
  if (!c) return [];
  return [...c.items].flatMap(([id, { from, lead }]) => {
    const start = c.leads.get(lead);
    const p = now.get(lead);
    return start && p ? [{ id, x: from.x + p.x - start.x, y: from.y + p.y - start.y }] : [];
  });
}
type Draft = Partial<Pick<Card, "x" | "y" | "w" | "h">>;

interface Props {
  run: Run;
  codes: Map<string, string>;
  selectedTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  panelOpen: boolean;
}

export function BoardCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
// Text the person highlighted inside a card keeps the browser's own copy and right-click menu.
const selectingText = (el: Element) => {
  const sel = document.getSelection();
  return !!sel && !sel.isCollapsed && !!sel.anchorNode && !!el.closest(".react-flow__node")?.contains(sel.anchorNode);
};

function Canvas({ run, codes, selectedTaskId, onSelectTask, panelOpen }: Props) {
  const { resolvedTheme } = useTheme();
  const rf = useReactFlow<BoardNode>();
  const board: Board = run.board ?? EMPTY;
  const tasks = run.nodes;
  const history = useBoardHistory(run.id, board);
  const surface = useRef<HTMLElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [toolStyle, setToolStyle] = useState<ToolStyle>({
    note: "yellow",
    shape: "rect",
    shapeColor: "blue",
    ink: "ink",
    highlight: "yellow",
  });
  // Strokes the eraser has passed over, hidden at once and deleted together when the pointer lifts.
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Positions and sizes mid-drag or mid-resize; they become ops when the gesture ends.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  // The card is looked up live, so the dialog follows edits and closes when the card is deleted.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = expandedId ? (board.cards.find((c) => c.id === expandedId) ?? null) : null;
  // While exporting, every card renders in full detail, including the ones off screen.
  const [exporting, setExporting] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState<ReadonlySet<string>>(new Set());
  // Sizes React Flow measured; handing them back stops it from re-measuring every node on every render.
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  // Nodes under a mouse drag; their final position is committed by the drag-stop, not by the change stream.
  const dragging = useRef(new Set<string>());
  const nodeCache = useRef(new Map<string, { key: unknown[]; node: BoardNode }>());
  const edgeCache = useRef(new Map<string, Edge>());
  const [menu, setMenu] = useState<(MenuState & { seq: number }) | null>(null);
  const clip = useRef<LocalClip>({ text: null, style: null });
  // Last pointer position over the board, so a keyboard paste lands under the cursor.
  const pointer = useRef<Pt | null>(null);
  // Where the next picked image goes; empty means the middle of the view.
  const imageAt = useRef<Pt | null>(null);
  const { prefs, toggle } = useBoardPrefs();
  // Read by callbacks that outlive a render, such as selection changes and drags.
  const cardsRef = useRef(board.cards);
  cardsRef.current = board.cards;
  // Nodes that follow a drag without being dragged: a group's other cards and whatever sits on a dragged frame.
  const carried = useRef<Carried | null>(null);
  // The first fit leaves room for the panel open at mount; one object, so React Flow never sees new options.
  const [firstFit] = useState(() => ({ padding: fitPadding(panelOpen), maxZoom: 1 }));
  const expand = useCallback((card: Card) => setExpandedId(card.id), []);
  const hasCard = useCallback((id: string) => cardsRef.current.some((c) => c.id === id), []);

  // An undo that brings a deleted card back must not reopen its dialog.
  useEffect(() => {
    if (expandedId && !expanded) setExpandedId(null);
  }, [expandedId, expanded]);

  const commit = useCallback(
    (ops: BoardOp[]) => {
      history.commit(ops);
      const touched = new Set(ops.map((o) => (o.op === "put" ? o.card.id : o.op === "link" ? o.link.id : o.id)));
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !touched.has(id))));
    },
    [history.commit],
  );

  const nodes = useMemo<BoardNode[]>(() => {
    // Unchanged nodes keep their identity, so React Flow and the cards skip work while something else moves.
    const reuse = (id: string, key: unknown[], build: () => BoardNode): BoardNode => {
      const hit = nodeCache.current.get(id);
      if (hit && hit.key.length === key.length && hit.key.every((k, i) => Object.is(k, key[i]))) return hit.node;
      const node = build();
      nodeCache.current.set(id, { key, node });
      return node;
    };
    const taskNodes = tasks.map((task) => {
      const d = drafts[task.id];
      const moved = board.moved[task.id];
      const x = d?.x ?? moved?.x ?? task.x;
      const y = d?.y ?? moved?.y ?? task.y;
      const code = codes.get(task.id) ?? "";
      const isSelected = task.id === selectedTaskId || selected.has(task.id);
      const size = measured[task.id];
      return reuse(
        task.id,
        [task, code, x, y, isSelected, size],
        (): TaskNodeType => ({
          id: task.id,
          type: "task",
          position: { x, y },
          data: { task, code },
          selected: isSelected,
          deletable: false,
          measured: size,
        }),
      );
    });
    const cardNodes = board.cards.map((card) => {
      const d = drafts[card.id];
      const x = d?.x ?? card.x;
      const y = d?.y ?? card.y;
      const w = d?.w ?? card.w;
      const h = d?.h ?? card.h;
      const isSelected = selected.has(card.id);
      // Resize handles and quick actions belong to a lone card; a multi-selection stays clean.
      const solo = isSelected && selected.size === 1;
      const editing = editingId === card.id;
      const erased = erasing.has(card.id);
      const size = measured[card.id];
      return reuse(
        card.id,
        [card, x, y, w, h, isSelected, solo, editing, erased, size],
        (): CardNodeType => ({
          id: card.id,
          type: "card",
          position: { x, y },
          width: w,
          height: h,
          data: { card, editing, solo },
          selected: isSelected,
          draggable: !editing && !card.locked,
          deletable: !card.locked,
          // A live page takes clicks; only its header moves it.
          dragHandle: card.kind === "preview" ? ".card-handle" : undefined,
          // Frames live in their own band below everything; inside a band, the card's layer decides.
          zIndex: card.kind === "frame" ? layerOf(card) - 1_000_000 : layerOf(card),
          // A stroke only catches the pointer on its ink, so tasks and cards under its bounding box stay usable.
          style: card.kind === "drawing" ? { pointerEvents: "none", opacity: erased ? 0.15 : undefined } : undefined,
          measured: size,
        }),
      );
    });
    const all = [...taskNodes, ...cardNodes];
    const live = new Set(all.map((n) => n.id));
    for (const id of nodeCache.current.keys()) if (!live.has(id)) nodeCache.current.delete(id);
    return all;
  }, [tasks, codes, board, drafts, selected, selectedTaskId, editingId, measured, erasing]);

  const edges = useMemo<Edge[]>(() => {
    const byId = new Map(tasks.map((n) => [n.id, n]));
    const plan = tasks.flatMap((target) =>
      // Follow-up rounds hang off the round before through `after`, drawn like any other step of the route.
      [...target.dependsOn, ...(target.after ?? [])].map((dep): Edge => {
        const source = byId.get(dep);
        // The leg feeding a running task is the live route; a dead branch fades out.
        const live = source?.status === "done" && target.status === "running";
        const broken = source ? BROKEN.has(source.status) : false;
        return {
          id: `${dep}->${target.id}`,
          source: dep,
          target: target.id,
          animated: live,
          deletable: false,
          selectable: false,
          className: live ? "satgas-live" : broken ? "satgas-broken" : undefined,
        };
      }),
    );
    const origins = board.cards
      .filter((c) => c.from && byId.has(c.from))
      .map(
        (c): Edge => ({
          id: `from:${c.id}`,
          source: c.from as string,
          target: c.id,
          deletable: false,
          selectable: false,
          className: "satgas-origin",
        }),
      );
    const links = board.links.map(
      (l): Edge => ({ id: l.id, source: l.source, target: l.target, className: "satgas-link", selected: selectedLinks.has(l.id) }),
    );
    // Unchanged edges keep their identity, so moving one card re-renders its own threads, not every edge on the board.
    const cache = edgeCache.current;
    const next = new Map<string, Edge>();
    const all = [...plan, ...origins, ...links].map((e) => {
      const hit = cache.get(e.id);
      const same =
        hit &&
        hit.source === e.source &&
        hit.target === e.target &&
        hit.animated === e.animated &&
        hit.className === e.className &&
        hit.selected === e.selected;
      const edge = same ? hit : e;
      next.set(e.id, edge);
      return edge;
    });
    edgeCache.current = next;
    return all;
  }, [tasks, board, selectedLinks]);

  // Frames the whole board, or just `ids` when zooming to a selection.
  const fit = useCallback(
    (duration = 300, ids?: string[]) => {
      const el = surface.current;
      const all = ids ? rf.getNodes().filter((n) => ids.includes(n.id)) : rf.getNodes();
      if (!el || !all.length) return Promise.resolve(false);
      // Computed directly so the padding can follow the panel, independent of React Flow's queued fitView().
      const view = getViewportForBounds(rf.getNodesBounds(all), el.clientWidth, el.clientHeight, 0.2, ids ? 1.5 : 1, fitPadding(panelOpen));
      return rf.setViewport(view, { duration });
    },
    [rf, panelOpen],
  );

  // React Flow makes the first fit; after that, refit only when a follow-up adds tasks, so the view stays where people put it.
  // The latest fit is read through a ref: opening the panel changes fit's padding but must not trigger a refit.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const mounted = useRef(false);
  const taskCount = tasks.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: taskCount marks a new round; status changes must not move the view.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // New nodes need a frame to be measured before their bounds count.
    const id = setTimeout(() => void fitRef.current(), 60);
    return () => clearTimeout(id);
  }, [taskCount]);

  // Opening a task's details pans just enough to keep that task clear of the panel; it never rezooms the board.
  useEffect(() => {
    const el = surface.current;
    const node = selectedTaskId ? rf.getInternalNode(selectedTaskId) : undefined;
    if (!panelOpen || !el || !node) return;
    const { x, y, zoom } = rf.getViewport();
    const right = (node.internals.positionAbsolute.x + (node.measured.width ?? 0)) * zoom + x;
    const visibleRight = el.clientWidth - PANEL_SPACE;
    if (right > visibleRight) void rf.setViewport({ x: x - (right - visibleRight), y, zoom }, { duration: 200 });
  }, [panelOpen, selectedTaskId, rf]);

  // The Export menu asks for a picture of the board as PNG or PDF; the right-click menu can copy one, of a few cards or all.
  useEffect(() => {
    const onExport = (e: Event) => {
      const { format, ids } = (e as CustomEvent<ExportRequest>).detail;
      const only = ids ? new Set(ids) : undefined;
      const keep = only && new Set([...only, ...edges.filter((x) => only.has(x.source) && only.has(x.target)).map((x) => x.id)]);
      const nodes = only ? rf.getNodes().filter((n) => only.has(n.id)) : rf.getNodes();
      // The first painted surface behind the board, so the picture keeps the board's own background.
      const painted = [surface.current, document.querySelector(".react-flow"), document.body]
        .map((el) => (el ? getComputedStyle(el).backgroundColor : ""))
        .find((c) => c && c !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c));
      const background = painted ?? "#ffffff";
      setExporting(true);
      // Two frames: one to mount the off-screen cards in full detail, one for them to lay out.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          boardPng(nodes, background, keep)
            .then(async (png) => {
              if (format === "clipboard") {
                await copyPng(png);
                toast.success(t.boardMenu.pngCopied);
              } else if (format === "pdf") printPdf(png, run);
              else savePng(png, run);
            })
            .catch(() => toast.error(format === "clipboard" ? t.boardMenu.pngFailed : t.exporter.failed))
            .finally(() => setExporting(false));
        }),
      );
    };
    window.addEventListener("satgas:export", onExport);
    return () => window.removeEventListener("satgas:export", onExport);
  }, [rf, run, edges]);

  // The chat can point at a card or task; bring it to the middle of the space left beside the panel.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const el = surface.current;
      const node = rf.getInternalNode(String((e as CustomEvent<string>).detail));
      if (!el || !node) return;
      const { zoom } = rf.getViewport();
      const cx = node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2;
      const cy = node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2;
      const room = el.clientWidth - (panelOpen ? PANEL_SPACE : 0);
      void rf.setViewport({ x: room / 2 - cx * zoom, y: el.clientHeight / 2 - cy * zoom, zoom }, { duration: 300 });
    };
    window.addEventListener("satgas:focus", onFocus);
    return () => window.removeEventListener("satgas:focus", onFocus);
  }, [rf, panelOpen]);

  useEffect(() => {
    const take = () => surface.current?.focus({ preventScroll: true });
    window.addEventListener(FOCUS_BOARD, take);
    return () => window.removeEventListener(FOCUS_BOARD, take);
  }, []);

  const taskIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);

  // A dashed outline around each selected group, following its cards while they move.
  const groupBoxes = useMemo(() => {
    const groups = new Set(board.cards.filter((c) => c.group && selected.has(c.id)).map((c) => c.group));
    if (!groups.size) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return [...groups].flatMap((g) => {
      const members = board.cards.flatMap((c) => (c.group === g && byId.get(c.id) ? [byId.get(c.id) as BoardNode] : []));
      if (!members.length) return [];
      const x = Math.min(...members.map((n) => n.position.x)) - 8;
      const y = Math.min(...members.map((n) => n.position.y)) - 8;
      const r = Math.max(...members.map((n) => n.position.x + (n.width ?? n.measured?.width ?? 0))) + 8;
      const btm = Math.max(...members.map((n) => n.position.y + (n.height ?? n.measured?.height ?? 0))) + 8;
      return [{ id: g as string, x, y, w: r - x, h: btm - y }];
    });
  }, [board.cards, nodes, selected]);
  const moveOp = useCallback(
    (id: string, x: number, y: number): BoardOp => (taskIds.has(id) ? { op: "move", id, x, y } : { op: "patch", id, patch: { x, y } }),
    [taskIds],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<BoardNode>[]) => {
      // A resize from the top or left edge moves the node too; those moves arrive without a dragging flag.
      const resizing = new Set(changes.flatMap((c) => (c.type === "dimensions" && c.resizing ? [c.id] : [])));
      setDrafts((prev) => {
        let next = prev;
        for (const c of changes) {
          if (c.type === "position" && c.position && (c.dragging || resizing.has(c.id)))
            next = { ...next, [c.id]: { ...next[c.id], x: c.position.x, y: c.position.y } };
          if (c.type === "dimensions" && c.resizing && c.dimensions)
            next = { ...next, [c.id]: { ...next[c.id], w: c.dimensions.width, h: c.dimensions.height } };
        }
        return next;
      });

      const sizes = changes.flatMap((c) => (c.type === "dimensions" && !c.resizing && c.dimensions ? [{ id: c.id, ...c.dimensions }] : []));
      if (sizes.length) {
        setMeasured((prev) => {
          let next = prev;
          for (const { id, width, height } of sizes) {
            if (prev[id]?.width === width && prev[id]?.height === height) continue;
            next = { ...next, [id]: { width, height } };
          }
          return next;
        });
      }

      // Arrow keys move selected nodes without any drag events, so those moves are committed as they come.
      const keyed = changes.flatMap((c) =>
        c.type === "position" && c.position && c.dragging === false && !dragging.current.has(c.id)
          ? [moveOp(c.id, c.position.x, c.position.y)]
          : [],
      );
      if (keyed.length) commit(keyed);

      const picks = changes.filter((c) => c.type === "select");
      if (picks.length) {
        setSelected((prev) => {
          const next = new Set(prev);
          for (const c of picks) c.selected ? next.add(c.id) : next.delete(c.id);
          return withGroups(next, cardsRef.current);
        });
      }
    },
    [commit, moveOp],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const picks = changes.filter((c) => c.type === "select");
    if (!picks.length) return;
    setSelectedLinks((prev) => {
      const next = new Set(prev);
      for (const c of picks) c.selected ? next.add(c.id) : next.delete(c.id);
      return next;
    });
  }, []);

  // Where nodes sit now, tasks included; a task that never rendered falls back to the size it is drawn at.
  const itemsOf = useCallback(
    (ids: string[]): Item[] =>
      ids.flatMap((id) => {
        const n = rf.getInternalNode(id);
        if (!n) return [];
        const { x, y } = n.internals.positionAbsolute;
        return [{ id, x, y, w: n.measured.width ?? n.width ?? 240, h: n.measured.height ?? n.height ?? 88 }];
      }),
    [rf],
  );

  const onDragStart = useCallback(
    (picked: Node[]) => {
      for (const n of picked) dragging.current.add(n.id);
      const pickedIds = new Set(picked.map((n) => n.id));
      const cards = cardsRef.current;
      const byId = new Map(cards.map((c) => [c.id, c]));
      const leads = new Map<string, Pt>();
      const items = new Map<string, { from: Pt; lead: string }>();
      for (const n of picked) {
        const card = byId.get(n.id);
        if (!card) continue;
        const follow = card.group ? cards.filter((c) => c.group === card.group).map((c) => c.id) : [];
        if (card.kind === "frame") {
          const others = [...tasks.map((x) => x.id), ...cards.filter((c) => c.id !== card.id && !c.locked).map((c) => c.id)];
          follow.push(...inside(card, itemsOf(others)).map((it) => it.id));
        }
        for (const id of follow) {
          if (pickedIds.has(id) || items.has(id) || byId.get(id)?.locked) continue;
          const [it] = itemsOf([id]);
          if (it) items.set(id, { from: { x: it.x, y: it.y }, lead: n.id });
        }
        if (follow.length) leads.set(n.id, { ...n.position });
      }
      carried.current = items.size ? { leads, items } : null;
    },
    [tasks, itemsOf],
  );

  const onDrag = (picked: Node[]) => {
    const moves = carriedMoves(carried.current, new Map(picked.map((n) => [n.id, n.position])));
    if (!moves.length) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const m of moves) next[m.id] = { ...next[m.id], x: m.x, y: m.y };
      return next;
    });
  };

  const onDragStop = useCallback(
    (moved: Node[]) => {
      const follow = carriedMoves(carried.current, new Map(moved.map((n) => [n.id, n.position])));
      carried.current = null;
      commit([...moved.map((n) => moveOp(n.id, n.position.x, n.position.y)), ...follow.map((m) => moveOp(m.id, m.x, m.y))]);
      // The drag's own final position change can land after this; keep the ids marked until it has.
      setTimeout(() => {
        for (const n of moved) dragging.current.delete(n.id);
      }, 0);
    },
    [commit, moveOp],
  );

  const viewportCenter = () => {
    const rect = surface.current?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 });
  };

  const place = (kind: Card["kind"], at: { x: number; y: number }, extra: Partial<Card> = {}) => {
    const { w, h } = DEFAULT_SIZE[kind];
    const card: Card = { id: newId(), kind, x: at.x - w / 2, y: at.y - h / 2, w, h, createdAt: Date.now(), ...extra };
    commit([{ op: "put", card }]);
    setSelected(new Set([card.id]));
    setEditingId(card.id);
    setTool("select");
  };

  // Every way to add something lands here: tool clicks, the Insert menu and the right-click Add menu.
  const createAt = (kind: AddKind, at: Pt) => {
    if (kind === "image") {
      imageAt.current = at;
      filePicker.current?.click();
    } else if (kind === "note") place("note", at, { text: "", color: toolStyle.note });
    else if (kind === "text") place("text", at, { text: "" });
    else if (kind === "shape") place("shape", at, { text: "", shape: toolStyle.shape, color: toolStyle.shapeColor });
    else if (kind === "frame") place("frame", at, { text: t.board.frameName });
    else if (kind === "doc") place("doc", at, { title: t.board.insertDoc, text: "" });
    else if (kind === "code") place("code", at, { title: t.board.insertCode, text: "" });
    else
      place("table", at, {
        title: t.board.insertTable,
        rows: [
          ["", "", ""],
          ["", "", ""],
          ["", "", ""],
        ],
      });
  };
  const create = (at: Pt) => {
    if (CREATES.has(tool)) createAt(tool as AddKind, at);
  };
  const insert = (what: Insert) => createAt(what, viewportCenter());
  // Under the cursor when it is over the board, otherwise the middle of the view.
  const pastePoint = () => (pointer.current ? rf.screenToFlowPosition(pointer.current) : viewportCenter());

  const addImages = async (files: File[], at: { x: number; y: number }) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      if (files.length) toast.error(t.board.onlyImages);
      return;
    }
    const progress = toast.loading(t.board.uploading(images.length));
    let added = 0;
    let problem: string | null = null;
    for (const [i, file] of images.entries()) {
      try {
        const src = await uploadImage(run.id, file);
        const { w, h } = await fitImage(src);
        const card: Card = {
          id: newId(),
          kind: "image",
          x: at.x - w / 2 + i * 24,
          y: at.y - h / 2 + i * 24,
          w,
          h,
          src,
          title: file.name,
          createdAt: Date.now(),
        };
        commit([{ op: "put", card }]);
        added++;
      } catch (e) {
        problem ??= (e as Error).message || t.board.uploadFailed;
      }
    }
    if (problem) toast.error(problem, { id: progress, description: added ? t.board.imagesAdded(added) : undefined });
    else toast.success(t.board.imagesAdded(added), { id: progress });
  };

  const actions = boardActions({
    rf: rf as unknown as Parameters<typeof boardActions>[0]["rf"],
    board,
    tasks,
    commit,
    select: (ids) => setSelected(new Set(ids)),
    createAt,
    addImages,
    fit: (ids) => void fit(300, ids),
    openTask: onSelectTask,
    setEditingId,
    expand,
    toggle,
    clip,
    runId: run.id,
    fileKey: run.fileKey,
    items: itemsOf,
    move: (moves) => {
      const at = new Map(itemsOf(moves.map((m) => m.id)).map((it) => [it.id, it]));
      const changed = moves.filter((m) => at.get(m.id)?.x !== m.x || at.get(m.id)?.y !== m.y);
      if (changed.length) commit(changed.map((m) => moveOp(m.id, m.x, m.y)));
    },
  });
  // Enter with a creating tool picked drops its card in the middle of the view, the keyboard's way to place one.
  const placeAtCenter = () => {
    if (!CREATES.has(tool)) return false;
    create(viewportCenter());
    return true;
  };
  // Document listeners read the latest actions and selection without re-subscribing on every render.
  const latest = useRef({ actions, selected, board, pastePoint, placeAtCenter });
  latest.current = { actions, selected, board, pastePoint, placeAtCenter };

  // Board shortcuts: tools, undo and redo, unless the person is typing, a dialog is open or focus is elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']")) return;
      if (!boardFocused(surface.current)) return;
      const key = e.key.toLowerCase();
      const shortcut = shortcutOf(e, isMac);
      if (shortcut) {
        e.preventDefault();
        latest.current.actions.run(shortcut, [...latest.current.selected]);
      } else if ((e.metaKey || e.ctrlKey) && key === "z") {
        e.preventDefault();
        e.shiftKey ? history.redo() : history.undo();
      } else if ((e.metaKey || e.ctrlKey) && key === "y") {
        e.preventDefault();
        history.redo();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && TOOL_KEYS[key]) {
        setTool(TOOL_KEYS[key]);
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && key === "i") {
        filePicker.current?.click();
      } else if (key === "enter" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.defaultPrevented) {
        // Only from the board itself; Enter on a node or a button keeps its own meaning.
        if ((e.target === document.body || e.target === surface.current) && latest.current.placeAtCenter()) e.preventDefault();
      } else if (key === "escape") {
        setTool("select");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [history.undo, history.redo]);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      void addImages([...(e.dataTransfer?.files ?? [])], rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  });

  // Copy and cut put the selected cards on the clipboard; paste brings back cards, images, or any text as a note.
  useEffect(() => {
    const blocked = (e: ClipboardEvent) =>
      isTyping(e.target) ||
      !boardFocused(surface.current) ||
      !!document.getSelection()?.toString() ||
      !!document.querySelector("[role='dialog'], [role='alertdialog']");
    const onCopy = (cut: boolean) => (e: ClipboardEvent) => {
      if (blocked(e)) return;
      const { actions, selected, board } = latest.current;
      const text = encodeClip(board, selected);
      if (!text) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", text);
      clip.current.text = text;
      if (cut) actions.remove([...selected]);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (blocked(e)) return;
      const at = latest.current.pastePoint();
      // Copied files never paste as their names; anything but an image is refused with a note.
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        void addImages(files, at);
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (text && latest.current.actions.pasteText(text, at)) e.preventDefault();
    };
    const copy = onCopy(false);
    const cut = onCopy(true);
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", onPaste);
    };
  });

  // The right-click menu: on a card or task, on the empty board, or on a connector a person drew.
  const onContextMenu = (e: React.MouseEvent) => {
    const el = e.target as Element;
    if (isTyping(el) || selectingText(el)) return;
    e.preventDefault();
    if (el.closest(".react-flow__panel")) return;
    const nodeId = el.closest<HTMLElement>(".react-flow__node")?.dataset.id;
    const edgeId = el.closest<SVGElement>(".react-flow__edge")?.dataset.id;
    let target: MenuTarget = { kind: "pane" };
    if (nodeId) {
      const ids = selected.has(nodeId) ? [...selected] : [nodeId];
      if (!selected.has(nodeId)) setSelected(new Set([nodeId]));
      target = { kind: "nodes", ids };
    } else if (el.closest(".react-flow__nodesselection") && selected.size) {
      target = { kind: "nodes", ids: [...selected] };
    } else if (edgeId && board.links.some((l) => l.id === edgeId)) {
      setSelectedLinks(new Set([edgeId]));
      target = { kind: "link", id: edgeId };
    }
    setMenu((m) => ({
      x: e.clientX,
      y: e.clientY,
      flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      target,
      seq: (m?.seq ?? 0) + 1,
    }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    const nodeId = (e.target as Element).closest<HTMLElement>(".react-flow__node")?.dataset.id;
    if (nodeId && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const card = board.cards.find((c) => c.id === nodeId);
      if (!card) onSelectTask(nodeId);
      else if (editableCard(card) && !card.locked) setEditingId(card.id);
      else if (card.kind !== "drawing" && !editableCard(card)) setExpandedId(card.id);
      return;
    }
    const pan = PAN[e.key];
    if (pan && !nodeId) {
      const { x, y, zoom } = rf.getViewport();
      void rf.setViewport({ x: x + pan.x * PAN_STEP, y: y + pan.y * PAN_STEP, zoom }, { duration: 150 });
    } else if (e.key === "+" || e.key === "=") void rf.zoomIn({ duration: 150 });
    else if (e.key === "-") void rf.zoomOut({ duration: 150 });
    else if (e.key === "0") void fit();
    else return;
    e.preventDefault();
  };

  const highlighting = tool === "highlighter";
  const strokeSize = highlighting ? HIGHLIGHT_SIZE : STROKE_SIZE;
  const strokeColor = highlighting ? toolStyle.highlight : toolStyle.ink;
  // A finished stroke, in flow coordinates, becomes one drawing card.
  const saveStroke = (stroke: number[]) => {
    if (stroke.length < 4) return;
    const xs = stroke.filter((_, i) => i % 2 === 0);
    const ys = stroke.filter((_, i) => i % 2 === 1);
    const pad = strokeSize * 2;
    const minX = xs.reduce((a, b) => Math.min(a, b)) - pad;
    const minY = ys.reduce((a, b) => Math.min(a, b)) - pad;
    const points = stroke.map((v, i) => (i % 2 === 0 ? v - minX : v - minY));
    const w = xs.reduce((a, b) => Math.max(a, b)) - minX + pad;
    const h = ys.reduce((a, b) => Math.max(a, b)) - minY + pad;
    commit([
      {
        op: "put",
        card: {
          id: newId(),
          kind: "drawing",
          x: minX,
          y: minY,
          w,
          h,
          points,
          color: strokeColor,
          ...(highlighting ? { size: HIGHLIGHT_SIZE, highlight: true } : {}),
          createdAt: Date.now(),
        },
      },
    ]);
  };

  // A stroke is hit when the eraser's path since the last event passes within a few screen pixels of one of its segments.
  const lastErase = useRef<{ x: number; y: number } | null>(null);
  // Switching tools mid-stroke unmounts the eraser before its pointer-up; nothing it marked stays half erased.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset belongs to every tool change.
  useEffect(() => {
    lastErase.current = null;
    setErasing((s) => (s.size ? new Set() : s));
  }, [tool]);
  const eraseAt = (e: React.PointerEvent) => {
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const from = lastErase.current ?? p;
    lastErase.current = p;
    const r = 10 / rf.getViewport().zoom;
    const hits = board.cards.filter((c) => {
      if (c.kind !== "drawing" || c.locked || erasing.has(c.id)) return false;
      const reach = r + (c.size ?? STROKE_SIZE);
      if (Math.max(p.x, from.x) < c.x - reach || Math.min(p.x, from.x) > c.x + c.w + reach) return false;
      if (Math.max(p.y, from.y) < c.y - reach || Math.min(p.y, from.y) > c.y + c.h + reach) return false;
      const pts = c.points ?? [];
      for (let i = 0; i + 3 < pts.length || i + 1 < pts.length; i += 2) {
        const a = { x: (pts[i] ?? 0) + c.x, y: (pts[i + 1] ?? 0) + c.y };
        const b = i + 3 < pts.length ? { x: (pts[i + 2] ?? 0) + c.x, y: (pts[i + 3] ?? 0) + c.y } : a;
        if (segmentsNear(a, b, from, p, reach)) return true;
        if (i + 3 >= pts.length) break;
      }
      return false;
    });
    if (hits.length) setErasing((s) => new Set([...s, ...hits.map((c) => c.id)]));
  };
  const eraseUp = () => {
    lastErase.current = null;
    if (erasing.size) commit([...erasing].map((id): BoardOp => ({ op: "delete", id })));
    setErasing(new Set());
  };

  const api = useMemo(
    () => ({ runId: run.id, commit, setEditingId, expand, hasCard, fileKey: run.fileKey }),
    [run.id, run.fileKey, commit, expand, hasCard],
  );

  // Fixed-identity handlers, so a drag frame re-renders the moving node only, not the toolbar or React Flow's internals.
  const handleDragStart = useEvent((_: unknown, __: unknown, picked: Node[]) => onDragStart(picked));
  const handleDrag = useEvent((_: unknown, __: unknown, picked: Node[]) => onDrag(picked));
  const handleDragStop = useEvent((_: unknown, __: unknown, moved: Node[]) => onDragStop(moved));
  // React Flow listens for Delete on the whole document; only delete when the board itself has focus.
  const handleBeforeDelete = useEvent(
    async () => boardFocused(surface.current) && !document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']"),
  );
  const handleDelete = useEvent(({ nodes: goneNodes, edges: goneEdges }: { nodes: Node[]; edges: Edge[] }) => {
    const cards = new Set(goneNodes.filter((n) => n.type === "card").map((n) => n.id));
    const links = goneEdges.filter((e) => board.links.some((l) => l.id === e.id) && !cards.has(e.source) && !cards.has(e.target));
    commit([...[...cards].map((id): BoardOp => ({ op: "delete", id })), ...links.map((e): BoardOp => ({ op: "delete", id: e.id }))]);
  });
  const handleConnect = useEvent((c: Connection) => {
    if (c.source && c.target && c.source !== c.target)
      commit([{ op: "link", link: { id: `l-${newId()}`, source: c.source, target: c.target } }]);
  });
  const handleNodeClick = useEvent((e: React.MouseEvent, node: Node) => {
    // A creating tool drops its card on top of the card under the click, frames included.
    if (CREATES.has(tool) && node.type === "card") return create(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    // Opening only, never toggling: a double-click would otherwise open and close the panel at once.
    if (node.type === "task") onSelectTask(node.id);
  });
  const handleNodeDoubleClick = useEvent((_: unknown, node: Node) => {
    const card = board.cards.find((c) => c.id === node.id);
    if (card && editableCard(card)) {
      if (!card.locked) setEditingId(card.id);
    } else if (card && card.kind !== "drawing") setExpandedId(card.id);
  });
  const handlePaneClick = useEvent((e: React.MouseEvent) => {
    if (CREATES.has(tool)) return create(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    onSelectTask(null);
    setSelected(new Set());
    setSelectedLinks(new Set());
  });
  const handleFit = useEvent(() => void fit());
  const handleInsert = useEvent(insert);
  const handleImage = useEvent(() => filePicker.current?.click());
  const handleStroke = useEvent(saveStroke);
  const closeMenu = useEvent(() => setMenu(null));
  const closeExpanded = useEvent(() => setExpandedId(null));
  const hand = tool === "hand";

  return (
    <BoardContext value={api}>
      <FullDetail value={exporting}>
        <section
          ref={surface}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the board is a keyboard-driven surface (pan, zoom, fit, open).
          tabIndex={0}
          aria-label={t.graphLabel}
          onKeyDown={onKeyDown}
          onContextMenu={onContextMenu}
          onPointerMove={(e) => {
            pointer.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerLeave={() => {
            pointer.current = null;
          }}
          className={cn("relative size-full outline-none", CREATES.has(tool) && "cursor-crosshair")}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={resolvedTheme}
            fitView
            fitViewOptions={firstFit}
            elevateNodesOnSelect={false}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            // Only what is on screen is in the DOM; an export briefly mounts everything.
            onlyRenderVisibleElements={!exporting}
            snapToGrid={prefs.snap}
            snapGrid={SNAP}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={handleDragStart}
            onNodeDrag={handleDrag}
            onNodeDragStop={handleDragStop}
            onBeforeDelete={handleBeforeDelete}
            onDelete={handleDelete}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={handlePaneClick}
            deleteKeyCode={DELETE_KEYS}
            selectionOnDrag={!hand}
            panOnDrag={hand ? true : PAN_BUTTONS}
            panOnScroll
            panActivationKeyCode="Space"
            elementsSelectable={!hand}
            nodesDraggable={!hand}
            nodesConnectable={!hand}
          >
            {prefs.grid && <Background variant={BackgroundVariant.Lines} gap={24} />}
            {(tool === "pen" || tool === "highlighter") && (
              <PenLayer size={strokeSize} highlight={highlighting} color={strokeColor} onStroke={handleStroke} />
            )}
            {tool === "eraser" && (
              <ToolLayer
                className="absolute inset-0 z-4 cursor-cell touch-none"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  lastErase.current = null;
                  eraseAt(e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons) eraseAt(e);
                }}
                onPointerUp={eraseUp}
                onPointerCancel={() => {
                  lastErase.current = null;
                  setErasing(new Set());
                }}
              />
            )}
            <ViewportPortal>
              {groupBoxes.map((b) => (
                <div
                  key={b.id}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 rounded-xl border border-dashed border-foreground/40"
                  style={{ transform: `translate(${b.x}px, ${b.y}px)`, width: b.w, height: b.h }}
                />
              ))}
            </ViewportPortal>
            <ZoomPill onFit={handleFit} shifted={panelOpen} />
          </ReactFlow>
        </section>
      </FullDetail>

      <BoardToolbar
        tool={tool}
        style={toolStyle}
        onTool={setTool}
        onStyle={setToolStyle}
        onInsert={handleInsert}
        onImage={handleImage}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
      />
      <input
        ref={filePicker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void addImages([...(e.target.files ?? [])], imageAt.current ?? viewportCenter());
          imageAt.current = null;
          e.target.value = "";
        }}
      />

      <ExpandDialog card={expanded} onClose={closeExpanded} />

      {/* Mounted only while open, so a closed menu costs nothing on drag frames. */}
      {menu && (
        <BoardMenu
          key={menu.seq}
          menu={menu}
          onClose={closeMenu}
          board={board}
          tasks={tasks}
          hasStyle={!!clip.current.style}
          prefs={prefs}
          actions={actions}
        />
      )}
    </BoardContext>
  );
}

interface PenProps {
  size: number;
  highlight: boolean;
  color: ColorName;
  onStroke: (points: number[]) => void;
}

// Owns the stroke being drawn, so each pointer move re-renders this layer only, never the board.
function PenLayer({ size, highlight, color, onStroke }: PenProps) {
  const rf = useReactFlow();
  // Points are appended in place; copying the whole stroke on every move grows quadratically on long strokes.
  const points = useRef<number[] | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const end = (save: boolean) => {
    const stroke = points.current;
    points.current = null;
    redraw();
    if (save && stroke) onStroke(stroke);
  };
  return (
    <ToolLayer
      className="absolute inset-0 z-4 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        points.current = [p.x, p.y];
        redraw();
      }}
      onPointerMove={(e) => {
        const s = points.current;
        if (!s || s.length >= MAX_STROKE_POINTS * 2) return;
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const minStep = 2 / rf.getViewport().zoom;
        const dx = p.x - (s[s.length - 2] ?? p.x);
        const dy = p.y - (s[s.length - 1] ?? p.y);
        if (dx * dx + dy * dy < minStep * minStep) return;
        s.push(p.x, p.y);
        redraw();
      }}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
    >
      {points.current && <LiveStroke points={points.current} size={size} highlight={highlight} color={color} />}
    </ToolLayer>
  );
}

// The drawing tools take the pointer in a layer above React Flow's zoom pane, where wheel and pinch would stop;
// this layer pans and zooms the board itself, with React Flow's own panOnScroll math.
function ToolLayer(props: React.HTMLAttributes<HTMLDivElement>) {
  const rf = useReactFlow();
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Not passive, so a pinch zooms the board instead of the page.
      e.preventDefault();
      const { x, y, zoom } = rf.getViewport();
      if (e.ctrlKey || e.metaKey) {
        const step = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey && isMac ? 10 : 1);
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * 2 ** step));
        const box = el.getBoundingClientRect();
        const px = e.clientX - box.left;
        const py = e.clientY - box.top;
        void rf.setViewport({ x: px - ((px - x) * next) / zoom, y: py - ((py - y) * next) / zoom, zoom: next });
        return;
      }
      const unit = e.deltaMode === 1 ? 20 : 1;
      // Shift turns the wheel sideways off macOS, as it does on the board.
      const sideways = !isMac && e.shiftKey;
      const dx = (sideways ? e.deltaY : e.deltaX) * unit;
      const dy = sideways ? 0 : e.deltaY * unit;
      void rf.setViewport({ x: x - dx * PAN_SPEED, y: y - dy * PAN_SPEED, zoom });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [rf]);
  return <div ref={layer} {...props} />;
}

// Renders the stroke being drawn in screen space, so it tracks the pointer exactly.
function LiveStroke({ points, size, highlight, color }: { points: number[]; size: number; highlight: boolean; color: ColorName }) {
  const { x, y, zoom } = useViewport();
  const screen = points.map((v, i) => (i % 2 === 0 ? v * zoom + x : v * zoom + y));
  return (
    <svg className={cn("pointer-events-none absolute inset-0 size-full", PALETTE[color].ink, highlight && "opacity-40")} aria-hidden="true">
      <path d={strokePath(screen, size * zoom, highlight)} fill="currentColor" />
    </svg>
  );
}

// The expanded card, read at a size meant for reading.
const ExpandDialog = memo(function ExpandDialog({ card, onClose }: { card: Card | null; onClose: () => void }) {
  return (
    <Dialog open={!!card} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(85vh,56rem)] max-w-[min(92vw,72rem)] flex-col gap-3 p-4 sm:max-w-[min(92vw,72rem)]">
        <DialogTitle className="truncate pe-8 text-sm font-medium">{card?.title ?? t.board.expand}</DialogTitle>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">{card && <CardBody card={card} large />}</div>
      </DialogContent>
    </Dialog>
  );
});

const ZoomPill = memo(function ZoomPill({ onFit, shifted }: { onFit: () => void; shifted: boolean }) {
  const { zoomIn, zoomOut } = useReactFlow();
  // Subscribes to the rounded percentage, so panning does not re-render the pill.
  const percent = useStore((s) => Math.round(s.transform[2] * 100));
  return (
    <Panel
      position="bottom-right"
      className={cn(
        "m-4! flex items-center gap-0.5 rounded-xl border bg-card p-1 shadow-sm max-lg:hidden",
        shifted && "me-[calc(24rem+1.5rem)]!",
      )}
    >
      <ZoomButton label={t.fit} onClick={onFit}>
        <Maximize />
      </ZoomButton>
      <ZoomButton label={t.zoomOut} onClick={() => void zoomOut({ duration: 150 })}>
        <Minus />
      </ZoomButton>
      <output aria-label={t.board.zoom} className="w-11 text-center text-xs text-muted-foreground tabular-nums">
        {percent}%
      </output>
      <ZoomButton label={t.zoomIn} onClick={() => void zoomIn({ duration: 150 })}>
        <Plus />
      </ZoomButton>
    </Panel>
  );
});

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

// Images land at a readable size, never wider than 360 or taller than 300 board units.
function fitImage(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 360 / img.naturalWidth, 300 / img.naturalHeight);
      resolve({ w: Math.max(80, Math.round(img.naturalWidth * scale)), h: Math.max(60, Math.round(img.naturalHeight * scale)) });
    };
    img.onerror = () => resolve(DEFAULT_SIZE.image);
    img.src = src;
  });
}

// Shortest distance between two segments, compared to `reach`; the eraser path and a stroke segment may both be points.
function segmentsNear(a: Pt, b: Pt, c: Pt, d: Pt, reach: number): boolean {
  const toSeg = (p: Pt, s: Pt, e: Pt) => {
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / len)) : 0;
    const x = s.x + t * dx - p.x;
    const y = s.y + t * dy - p.y;
    return x * x + y * y;
  };
  const r2 = reach * reach;
  return toSeg(a, c, d) <= r2 || toSeg(b, c, d) <= r2 || toSeg(c, a, b) <= r2 || toSeg(d, a, b) <= r2 || crosses(a, b, c, d);
}

function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
