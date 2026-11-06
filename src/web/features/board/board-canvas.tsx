import {
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  type EdgeChange,
  MarkerType,
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
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/context/theme-provider";
import { useEvent } from "@/hooks/use-event";
import { useCoarsePointer } from "@/hooks/use-mobile";
import { isMac, t } from "@/i18n";
import { isLiveRun } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { usePanel } from "@/stores/panel";
import { uploadImage } from "@/stores/runs";
import { setBoardSelection } from "@/stores/selection";
import { type Board, type BoardOp, type Card, type ColorName, DEFAULT_SIZE, emptyBoard, type ShapeKind } from "../../../shared/board";
import { insideOwnFrame } from "../../../shared/board-blocks";
import {
  crew,
  currentTask,
  isTeamNode,
  LEAD_H,
  LEAD_ID,
  LEAD_W,
  memberIdOf,
  memberOfPerson,
  PERSON_H,
  PERSON_W,
  personId,
  personState,
  taskToOpen,
  teamLayout,
} from "../../../shared/team";
import type { NodeState, Run } from "../../../shared/types";
import { WIDGET_SIZE, type WidgetKind } from "../../../shared/widgets";
import { LeadNode, type LeadNodeType } from "../team/lead-node";
import { PersonNode, type PersonNodeType } from "../team/person-node";
import { TalkEdge } from "../team/talk-edge";
import { BehindMask, type MaskRect } from "./behind-mask";
import { boardActions, type LocalClip } from "./board-actions";
import type { AddKind, MenuState, MenuTarget } from "./board-menu";
import { CardBody, CardNode, type CardNodeType, editableCard, loadWidgets } from "./cards";
import { BoardContext, FullDetail, newId } from "./context";
import { type CardStyle, cloneOps, encodeClip, type Item, inside, layerOf, type Move, styleOps, withGroups } from "./edit";
import { boardPng, copyPngLater, type ExportRequest, printPdf, type SnapshotRequest, savePng } from "./export";
import { FloatingEdge } from "./floating-edge";
import { clearLanding, FOCUS_BOARD, pendingLanding } from "./focus";
import { type Inset, unionRect, viewportFor, zoomAround } from "./frame";
import { type Box, boundsOf, dragBox, type Guide, lockAngle, snapBox } from "./geometry";
import { INBOX_ID, INBOX_W, InboxNode, type InboxNodeType, waiting } from "./inbox-node";
import { modHeld } from "./keys";
import { watchLongPress } from "./long-press";
import { PALETTE } from "./palette";
import { useBoardPrefs } from "./prefs";
import { SelectionToolbar } from "./selection-toolbar";
import { shortcutOf } from "./shortcuts";
import { HIGHLIGHT_SIZE, STROKE_SIZE, strokePath } from "./stroke";
import { BoardToolbar, type Insert, SHAPE_KEYS, TOOL_KEYS, type Tool, type ToolStyle } from "./toolbar";
import { useBoardHistory } from "./use-history";
import { loadView, saveView } from "./viewport";

// Tools that drop a new card where the person clicks.
const CREATES = new Set<Tool>(["note", "text", "shape", "frame"]);

const nodeTypes = { lead: LeadNode, person: PersonNode, card: CardNode, inbox: InboxNode };
const edgeTypes = { floating: FloatingEdge, talk: TalkEdge };
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
const MAX_ZOOM = 4;
// React Flow's own panOnScroll speed, so the drawing layers scroll like the board under them.
const PAN_SPEED = 0.5;
// Constant arrays: a fresh one per render makes React Flow re-bind its key listeners and zoom filter on every drag frame.
const DELETE_KEYS = ["Backspace", "Delete"];
const PAN_BUTTONS = [1, 2];
// Width the detail panel covers on the right, plus breathing room.
// A drawing stores at most this many points, well under what the server accepts.
const MAX_STROKE_POINTS = 8000;

// The title pill, toolbar and mission bar float over the board, so fitting reserves room for them (and the panel).
// The open side panel's width plus its margins, read when fitting so a resized panel never covers the board.
const panelSpace = () => usePanel.getState().width + 48;
const insetOf = (panelOpen: boolean): Inset => ({ top: 64, left: 72, bottom: 96, right: panelOpen ? panelSpace() : 48 });
const FIT_MIN_ZOOM = 0.2;
const NO_SELECTION: ReadonlySet<string> = new Set();
// Zooming to one card stops here, so a small sticky reads comfortably instead of filling the screen.
const FOCUS_ZOOM = 1.25;
const ZOOM_STEP = 1.2;

// Board keys and clipboard act only with focus on the board, its toolbar, or nowhere; never from the chat or a panel.
const boardFocused = (surface: HTMLElement | null) => {
  const el = document.activeElement;
  return !el || el === document.body || !!surface?.contains(el) || !!el.closest("[data-board-chrome]");
};

type BoardNode = LeadNodeType | PersonNodeType | CardNodeType | InboxNodeType;
// Fetched when the browser is idle, so the first right-click opens at once without weighing on the first paint.
const loadMenu = () => import("./board-menu");
const BoardMenu = lazy(() => loadMenu().then((m) => ({ default: m.BoardMenu })));
type Pt = { x: number; y: number };
// A drawn box never comes out smaller than the kind can hold; it grows from its own corner.
const fitBox = (b: Box, w: number, h: number): Box => ({ ...b, w: Math.max(b.w, w), h: Math.max(b.h, h) });
// The arrow tool's connectors end in a head, in the same quiet ink as the line.
const LINK_HEAD = { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--muted-foreground)" };
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

function Canvas({ run, selectedTaskId, onSelectTask, panelOpen }: Props) {
  const { resolvedTheme } = useTheme();
  const rf = useReactFlow<BoardNode>();
  const board: Board = run.board ?? EMPTY;
  const people = useMemo(() => crew(run), [run]);
  const spots = useMemo(() => teamLayout(people), [people]);
  // Each person stands on the board for their most relevant task, so menus and layouts treat them as the tasks once were.
  const tasks = useMemo<NodeState[]>(
    () =>
      people.flatMap((m) => {
        const open = taskToOpen(m.id, run.nodes);
        return open ? [{ ...open, id: personId(m.id) }] : [];
      }),
    [people, run.nodes],
  );
  const taskById = useMemo(() => new Map(run.nodes.map((n) => [n.id, n])), [run.nodes]);
  // The chat and the details panel speak in tasks; the board shows the person doing them.
  const nodeOfTask = useCallback(
    (id: string) => {
      const n = taskById.get(id);
      return n ? personId(memberIdOf(n)) : id;
    },
    [taskById],
  );
  const taskOfNode = useCallback(
    (id: string) => {
      const m = memberOfPerson(id);
      if (m) return taskToOpen(m, run.nodes)?.id ?? null;
      return id === LEAD_ID ? null : id;
    },
    [run.nodes],
  );
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
    inkSize: STROKE_SIZE,
  });
  // Widgets off screen have not loaded yet, and an export draws every card: have them ready before anyone asks.
  const hasWidgets = board.cards.some((c) => c.kind === "widget");
  useEffect(() => {
    if (hasWidgets) void loadWidgets();
  }, [hasWidgets]);
  useEffect(() => {
    const id = (window.requestIdleCallback ?? setTimeout)(() => void loadMenu());
    return () => (window.cancelIdleCallback ?? clearTimeout)(id);
  }, []);
  // Q keeps the tool picked after each thing it makes; read through a ref by the handlers that end a creation.
  const [locked, setLocked] = useState(false);
  // Object snapping while dragging: what the dragged cards can line up with (taken once per drag), the nudge applied
  // this frame, and the guides drawn for it.
  const snapping = useRef<{ others: Box[]; dx: number; dy: number } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const done = () => {
    if (!lockedRef.current) setTool("select");
  };
  // Strokes the eraser has passed over, hidden at once and deleted together when the pointer lifts.
  const [erasing, setErasing] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // The selected cards (not the team or tasks) become the chat's context for the next message.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new selection or a card going away changes it.
  useEffect(() => {
    const cards = new Set(board.cards.map((c) => c.id));
    setBoardSelection(
      run.id,
      [...selected].filter((id) => cards.has(id)),
    );
  }, [selected, board.cards.length, run.id]);
  useEffect(() => () => setBoardSelection(run.id, []), [run.id]);
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
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  // Read by callbacks that outlive a render, such as selection changes and drags.
  const cardsRef = useRef(board.cards);
  cardsRef.current = board.cards;
  // Nodes that follow a drag without being dragged: a group's other cards and whatever sits on a dragged frame.
  const carried = useRef<Carried | null>(null);
  // A board opened before comes back where the person left the camera; only a first visit is framed to fit.
  const [savedView] = useState(() => loadView(run.id));
  // What a first fit frames, read from the data: team nodes have no measured size before their first paint.
  const contentBounds = useEvent(() =>
    unionRect([
      { x: spots.lead.x, y: spots.lead.y, width: LEAD_W, height: LEAD_H },
      ...[...spots.members.values()].map((p) => ({ x: p.x, y: p.y, width: PERSON_W, height: PERSON_H })),
      ...board.cards.map((c) => ({ x: c.x, y: c.y, width: c.w, height: c.h })),
    ]),
  );
  // The board fills the window, so the first frame is already framed beside the panel; once React Flow is ready the
  // fit is redone against the board's real size, which only moves it if the two differ.
  const [firstView] = useState(() => {
    const b = contentBounds();
    return savedView ?? (b ? viewportFor(b, window.innerWidth, window.innerHeight, FIT_MIN_ZOOM, 1, insetOf(panelOpen)) : undefined);
  });
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
    const latest = Math.max(0, ...run.nodes.map((n) => n.round ?? 0));
    // A picture of the board shows it unselected: the export renderer draws selection rings only in part.
    const chosen = exporting ? NO_SELECTION : selected;
    const picked = selectedTaskId && !exporting ? taskById.get(selectedTaskId) : undefined;
    const names = new Map(people.map((m) => [m.id, m.name]));
    const leadAt = spots.lead;
    const leadSelected = chosen.has(LEAD_ID);
    const leadData = { status: run.status, says: run.plans?.[latest], startedAt: run.startedAt ?? run.createdAt, endedAt: run.endedAt };
    const teamNodes: BoardNode[] = [
      reuse(
        LEAD_ID,
        [run.status, leadData.says, leadData.startedAt, run.endedAt, leadAt.x, leadAt.y, leadSelected, measured[LEAD_ID]],
        (): LeadNodeType => ({
          id: LEAD_ID,
          type: "lead",
          position: { x: leadAt.x, y: leadAt.y },
          data: leadData,
          selected: leadSelected,
          deletable: false,
          // The team keeps its place, so the lead and everyone it hired always read as one group.
          draggable: false,
          measured: measured[LEAD_ID],
        }),
      ),
      ...people.map((member) => {
        const id = personId(member.id);
        const spot = spots.members.get(member.id) ?? { x: 0, y: 0 };
        const at = spot;
        const task = currentTask(member.id, run.nodes);
        const state = personState(task);
        const blocker = state === "waiting" ? task?.dependsOn.map((d) => taskById.get(d)).find((d) => d && d.status !== "done") : undefined;
        const waitingFor = blocker ? names.get(memberIdOf(blocker)) : undefined;
        const fresh = member.round === latest && (run.status === "planning" || run.status === "running");
        const isSelected = chosen.has(id) || (!!picked && memberIdOf(picked) === member.id);
        const size = measured[id];
        return reuse(
          id,
          [member, task, state, waitingFor, fresh, at.x, at.y, isSelected, size],
          (): PersonNodeType => ({
            id,
            type: "person",
            position: { x: at.x, y: at.y },
            data: { member, task, state, waitingFor, fresh },
            selected: isSelected,
            deletable: false,
            draggable: false,
            measured: size,
          }),
        );
      }),
    ];
    const cardNodes = board.cards.map((card) => {
      const d = drafts[card.id];
      const x = d?.x ?? card.x;
      const y = d?.y ?? card.y;
      const w = d?.w ?? card.w;
      const h = d?.h ?? card.h;
      const isSelected = chosen.has(card.id);
      // Resize handles and quick actions belong to a lone card; a multi-selection stays clean.
      const solo = isSelected && chosen.size === 1;
      const editing = editingId === card.id;
      const erased = erasing.has(card.id);
      const size = measured[card.id];
      const maker = card.from ? taskById.get(card.from) : undefined;
      const makerId = maker ? memberIdOf(maker) : undefined;
      const makerName = makerId ? names.get(makerId) : undefined;
      return reuse(
        card.id,
        [card, x, y, w, h, isSelected, solo, editing, erased, size, makerName],
        (): CardNodeType => ({
          id: card.id,
          type: "card",
          position: { x, y },
          width: w,
          height: h,
          data: { card, editing, solo, author: makerId && makerName ? { id: makerId, name: makerName } : undefined },
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
    // What the team waits on the person for stands left of the team while there is any, and goes once answered.
    const inbox: BoardNode[] = waiting(run).any
      ? [
          reuse(
            INBOX_ID,
            [leadAt.x, leadAt.y, measured[INBOX_ID]],
            (): InboxNodeType => ({
              id: INBOX_ID,
              type: "inbox",
              position: { x: Math.min(0, leadAt.x) - 48 - INBOX_W, y: leadAt.y },
              data: {},
              draggable: false,
              selectable: false,
              deletable: false,
              measured: measured[INBOX_ID],
            }),
          ),
        ]
      : [];
    const all = [...teamNodes, ...inbox, ...cardNodes];
    const live = new Set(all.map((n) => n.id));
    for (const id of nodeCache.current.keys()) if (!live.has(id)) nodeCache.current.delete(id);
    return all;
  }, [run, people, spots, taskById, board, drafts, selected, selectedTaskId, editingId, measured, erasing, exporting]);

  // Only a working round's talk is drawn; once it ends the chat keeps the words.
  const asks = isLiveRun(run) ? run.talk?.[Math.max(0, ...run.nodes.map((n) => n.round ?? 0))]?.asks : undefined;
  const edges = useMemo<Edge[]>(() => {
    // Reporting lines run from the lead down to everyone; the one to a person at work is the live route.
    const org = people.map((m): Edge => {
      const working = personState(currentTask(m.id, run.nodes)) === "working";
      return {
        id: `org:${m.id}`,
        type: "smoothstep",
        source: LEAD_ID,
        target: personId(m.id),
        animated: working,
        deletable: false,
        selectable: false,
        className: working ? "satgas-live" : undefined,
      };
    });
    // Teammates talking while the round works: a question flows to the one asked, the answer flows back and fades.
    const talking = (asks ?? []).flatMap((a): Edge[] => {
      if (a.state !== "waiting" && a.state !== "answered") return [];
      const answered = a.state === "answered";
      return [
        {
          id: `talk:${a.id}`,
          type: "talk",
          source: personId(answered ? a.to : a.from),
          sourceHandle: "talk-s",
          target: personId(answered ? a.from : a.to),
          targetHandle: "talk-t",
          data: { text: answered ? (a.answer ?? "") : a.question, answered },
          deletable: false,
          selectable: false,
          className: cn("satgas-talk", answered && "satgas-talk-fade"),
        },
      ];
    });
    // A card's maker is named on its label; the thread back to them shows only for the card or person picked, so the
    // board is not crossed by every card's line at once. A board an agent laid out hangs off its task by its frame.
    const origins = board.cards
      .filter(
        (c) =>
          c.from &&
          taskById.has(c.from) &&
          !insideOwnFrame(c, board.cards) &&
          (selected.has(c.id) || selected.has(nodeOfTask(c.from)) || selectedTaskId === c.from),
      )
      .map(
        (c): Edge => ({
          id: `from:${c.id}`,
          type: "floating",
          source: nodeOfTask(c.from as string),
          target: c.id,
          // Right-angled like the reporting lines, so threads from one person share a trunk instead of crossing.
          data: { elbow: true },
          deletable: false,
          selectable: false,
          className: "satgas-origin",
        }),
      );
    const links = board.links.map(
      (l): Edge => ({
        id: l.id,
        type: "floating",
        source: l.source,
        target: l.target,
        className: "satgas-link",
        selected: selectedLinks.has(l.id),
        markerEnd: l.arrow ? LINK_HEAD : undefined,
      }),
    );
    // Unchanged edges keep their identity, so moving one card re-renders its own threads, not every edge on the board.
    const cache = edgeCache.current;
    const next = new Map<string, Edge>();
    const all = [...org, ...talking, ...origins, ...links].map((e) => {
      const hit = cache.get(e.id);
      const same =
        hit &&
        hit.source === e.source &&
        hit.target === e.target &&
        hit.animated === e.animated &&
        hit.className === e.className &&
        hit.selected === e.selected &&
        (hit.data as { text?: string } | undefined)?.text === (e.data as { text?: string } | undefined)?.text;
      const edge = same ? hit : e;
      next.set(e.id, edge);
      return edge;
    });
    edgeCache.current = next;
    return all;
  }, [run.nodes, asks, people, taskById, nodeOfTask, board, selectedLinks, selected, selectedTaskId]);

  useEffect(() => {
    const el = surface.current;
    return el ? watchLongPress(el) : undefined;
  }, []);

  // Safari's trackpad pinch arrives as gesture events and the page lock stops its own zoom, so the board applies it. Touch
  // screens fire them too, but there React Flow already reads the fingers.
  useEffect(() => {
    const el = surface.current;
    if (!el || navigator.maxTouchPoints > 0) return;
    let from = 1;
    const begin = () => {
      from = rf.getZoom();
    };
    const change = (e: Event) => {
      const { scale, clientX, clientY } = e as Event & { scale: number; clientX: number; clientY: number };
      const box = el.getBoundingClientRect();
      const view = rf.getViewport();
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, from * scale));
      const [x, y] = [clientX - box.left, clientY - box.top];
      void rf.setViewport({ x: x - (x - view.x) * (zoom / view.zoom), y: y - (y - view.y) * (zoom / view.zoom), zoom });
    };
    el.addEventListener("gesturestart", begin);
    el.addEventListener("gesturechange", change);
    return () => {
      el.removeEventListener("gesturestart", begin);
      el.removeEventListener("gesturechange", change);
    };
  }, [rf]);

  // Frames the whole board, or just `ids` when zooming to a selection.
  const fit = useCallback(
    (duration = 300, ids?: string[]) => {
      const el = surface.current;
      const all = ids ? rf.getNodes().filter((n) => ids.includes(n.id)) : rf.getNodes();
      if (!el || !all.length) return Promise.resolve(false);
      const view = viewportFor(rf.getNodesBounds(all), el.clientWidth, el.clientHeight, FIT_MIN_ZOOM, ids ? 1.5 : 1, insetOf(panelOpen));
      return rf.setViewport(view, { duration });
    },
    [rf, panelOpen],
  );

  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;
  useEffect(() => {
    if (savedView) return;
    let frame = 0;
    const settle = () => {
      const el = surface.current;
      const b = contentBounds();
      if (!el || !b) return;
      if (!rf.viewportInitialized) {
        frame = requestAnimationFrame(settle);
        return;
      }
      void rf.setViewport(viewportFor(b, el.clientWidth, el.clientHeight, FIT_MIN_ZOOM, 1, insetOf(panelOpenRef.current)));
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [rf, savedView, contentBounds]);

  // Arriving from Chat Only: after the first fit, once the card asked for is on the board, fly to it. Up to a couple of
  // seconds of frames, so a card that is gone does not keep this waiting.
  useEffect(() => {
    if (!pendingLanding()) return;
    let frame = 0;
    let tries = 0;
    const land = () => {
      const id = pendingLanding();
      if (!id) return;
      const node = rf.getInternalNode(id);
      // A card off screen is never rendered to measure, but it knows its size from the board.
      if (rf.viewportInitialized && (node?.measured.width ?? node?.width)) {
        clearLanding();
        window.dispatchEvent(new CustomEvent("satgas:focus", { detail: id }));
      } else if (++tries < 120) frame = requestAnimationFrame(land);
      else clearLanding();
    };
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(land);
    });
    return () => cancelAnimationFrame(frame);
  }, [rf]);

  // Zooming keeps the middle of the uncovered board still, not the middle of the window behind the panel.
  const zoomTo = useEvent((next: number, duration: number = 150) => {
    const el = surface.current;
    if (!el) return;
    const view = rf.getViewport();
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const cx = (el.clientWidth - (panelOpen ? panelSpace() : 0)) / 2;
    void rf.setViewport(zoomAround(view, zoom, cx, el.clientHeight / 2), { duration });
  });
  const zoomStep = useEvent((dir: 1 | -1) => zoomTo(rf.getViewport().zoom * (dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));

  // React Flow makes the first fit; after that, refit only when a follow-up adds tasks, so the view stays where people put it.
  // The latest fit is read through a ref: opening the panel changes fit's padding but must not trigger a refit.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const taskCount = run.nodes.length;
  // Compared with the count already shown, not a mounted flag: React may run this twice on mount, and that must not
  // reframe a board that just came back to where the person left its camera.
  const shownCount = useRef(taskCount);
  useEffect(() => {
    const grew = taskCount > shownCount.current;
    shownCount.current = taskCount;
    if (!grew) return;
    // New nodes need a frame to be measured before their bounds count.
    const id = setTimeout(() => void fitRef.current(), 60);
    return () => clearTimeout(id);
  }, [taskCount]);

  // Opening a task's details pans just enough to keep that task clear of the panel; it never rezooms the board.
  useEffect(() => {
    const el = surface.current;
    const node = selectedTaskId ? rf.getInternalNode(nodeOfTask(selectedTaskId)) : undefined;
    if (!panelOpen || !el || !node) return;
    const { x, y, zoom } = rf.getViewport();
    const right = (node.internals.positionAbsolute.x + (node.measured.width ?? 0)) * zoom + x;
    const visibleRight = el.clientWidth - panelSpace();
    if (right > visibleRight) void rf.setViewport({ x: x - (right - visibleRight), y, zoom }, { duration: 200 });
  }, [panelOpen, selectedTaskId, rf, nodeOfTask]);

  // The chat asks for a picture of what the person drew, to send with their message so the agents can see it.
  useEffect(() => {
    const onSnapshot = (e: Event) => {
      const { ids, resolve } = (e as CustomEvent<SnapshotRequest>).detail;
      const only = new Set(ids);
      const nodes = rf.getNodes().filter((n) => only.has(n.id));
      if (!nodes.length) return resolve(null);
      const painted = [surface.current, document.querySelector(".react-flow"), document.body]
        .map((el) => (el ? getComputedStyle(el).backgroundColor : ""))
        .find((c) => c && c !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c));
      boardPng(nodes, painted ?? "#ffffff", only).then(resolve, () => resolve(null));
    };
    window.addEventListener("satgas:snapshot", onSnapshot);
    return () => window.removeEventListener("satgas:snapshot", onSnapshot);
  }, [rf]);

  // The Export menu asks for a picture of the board as PNG or PDF; the right-click menu can copy one, of a few cards or all.
  useEffect(() => {
    const onExport = (e: Event) => {
      const { format, ids, name } = (e as CustomEvent<ExportRequest>).detail;
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
      const render = new Promise<string>((resolve, reject) =>
        requestAnimationFrame(() => requestAnimationFrame(() => boardPng(nodes, background, keep).then(resolve, reject))),
      );
      // Copying starts inside the click, before the picture exists; see copyPngLater.
      const done =
        format === "clipboard"
          ? copyPngLater(render).then(() => void toast.success(t.boardMenu.pngCopied))
          : render.then((png) => (format === "pdf" ? printPdf(png, run) : savePng(png, run, name)));
      done
        .catch((err: unknown) => {
          console.error("Board export failed", err);
          toast.error(format === "clipboard" ? t.boardMenu.pngFailed : t.exporter.failed);
        })
        .finally(() => setExporting(false));
    };
    window.addEventListener("satgas:export", onExport);
    return () => window.removeEventListener("satgas:export", onExport);
  }, [rf, run, edges]);

  // The chat can point at a card or task; zoom it to fill the space left beside the panel, in close enough to read and
  // out far enough for a whole frame.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const el = surface.current;
      const node = rf.getInternalNode(nodeOfTask(String((e as CustomEvent<string>).detail)));
      if (!el || !node) return;
      const bounds = {
        x: node.internals.positionAbsolute.x,
        y: node.internals.positionAbsolute.y,
        width: node.measured.width ?? node.width ?? 0,
        height: node.measured.height ?? node.height ?? 0,
      };
      void rf.setViewport(viewportFor(bounds, el.clientWidth, el.clientHeight, MIN_ZOOM, FOCUS_ZOOM, insetOf(panelOpen)), {
        duration: 300,
      });
    };
    window.addEventListener("satgas:focus", onFocus);
    return () => window.removeEventListener("satgas:focus", onFocus);
  }, [rf, panelOpen, nodeOfTask]);

  useEffect(() => {
    const take = () => surface.current?.focus({ preventScroll: true });
    window.addEventListener(FOCUS_BOARD, take);
    return () => window.removeEventListener(FOCUS_BOARD, take);
  }, []);

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
    (id: string, x: number, y: number): BoardOp => (isTeamNode(id) ? { op: "move", id, x, y } : { op: "patch", id, patch: { x, y } }),
    [],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<BoardNode>[]) => {
      // A resize from the top or left edge moves the node too; those moves arrive without a dragging flag.
      const resizing = new Set(changes.flatMap((c) => (c.type === "dimensions" && c.resizing ? [c.id] : [])));
      const snap = snapping.current;
      const moving = changes.filter((c) => c.type === "position" && c.position && c.dragging);
      if (snap && moving.length) {
        // ⌘ held lets a card go anywhere, as in Excalidraw; grid snapping, when on, already decides the spot.
        const boxes = moving.flatMap((c) => {
          const n = c.type === "position" && c.position ? rf.getInternalNode(c.id) : undefined;
          if (!n || c.type !== "position" || !c.position) return [];
          return [{ x: c.position.x, y: c.position.y, w: n.measured.width ?? n.width ?? 0, h: n.measured.height ?? n.height ?? 0 }];
        });
        const hit =
          modHeld() || !boxes.length ? { dx: 0, dy: 0, guides: [] } : snapBox(boundsOf(boxes), snap.others, 8 / rf.getViewport().zoom);
        snap.dx = hit.dx;
        snap.dy = hit.dy;
        for (const c of moving)
          if (c.type === "position" && c.position) c.position = { x: c.position.x + hit.dx, y: c.position.y + hit.dy };
        // Unchanged guides keep their identity, so a step that lines up the same way draws nothing new.
        setGuides((g) => (JSON.stringify(g) === JSON.stringify(hit.guides) ? g : hit.guides));
      }
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
    [commit, moveOp, rf],
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
      // What the drag can line up with: everything else in view, taken once so each frame only compares numbers.
      if (prefsRef.current.snap) snapping.current = null;
      else {
        const skip = new Set([...pickedIds, ...items.keys()]);
        const view = rf.getViewport();
        const rect = surface.current?.getBoundingClientRect();
        const seen = rect
          ? { x: -view.x / view.zoom, y: -view.y / view.zoom, w: rect.width / view.zoom, h: rect.height / view.zoom }
          : null;
        const others = itemsOf(rf.getNodes().flatMap((n) => (skip.has(n.id) || byId.get(n.id)?.kind === "drawing" ? [] : [n.id]))).filter(
          (b) => !seen || (b.x < seen.x + seen.w && b.x + b.w > seen.x && b.y < seen.y + seen.h && b.y + b.h > seen.y),
        );
        snapping.current = { others, dx: 0, dy: 0 };
      }
    },
    [tasks, itemsOf, rf],
  );
  // Where React Flow says the dragged nodes are, plus this frame's snap nudge.
  const snapped = useCallback((nodes: Node[]) => {
    const s = snapping.current;
    return new Map(nodes.map((n) => [n.id, s ? { x: n.position.x + s.dx, y: n.position.y + s.dy } : n.position]));
  }, []);

  const onDrag = (picked: Node[]) => {
    const moves = carriedMoves(carried.current, snapped(picked));
    if (!moves.length) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const m of moves) next[m.id] = { ...next[m.id], x: m.x, y: m.y };
      return next;
    });
  };

  const onDragStop = useCallback(
    (moved: Node[]) => {
      const at = snapped(moved);
      const follow = carriedMoves(carried.current, at);
      carried.current = null;
      snapping.current = null;
      setGuides([]);
      commit([
        ...moved.map((n) => {
          const p = at.get(n.id) ?? n.position;
          return moveOp(n.id, p.x, p.y);
        }),
        ...follow.map((m) => moveOp(m.id, m.x, m.y)),
      ]);
      // The drag's own final position change can land after this; keep the ids marked until it has.
      setTimeout(() => {
        for (const n of moved) dragging.current.delete(n.id);
      }, 0);
    },
    [commit, moveOp, snapped],
  );

  const viewportCenter = () => {
    const rect = surface.current?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 });
  };

  // A click drops the kind's default size centred on the point; a drag hands the box it drew.
  const place = (kind: Card["kind"], at: { x: number; y: number }, extra: Partial<Card> = {}, box?: Box) => {
    const { w, h } = box ?? (extra.widget ? WIDGET_SIZE[extra.widget] : DEFAULT_SIZE[kind]);
    const x = box ? box.x : at.x - w / 2;
    const y = box ? box.y : at.y - h / 2;
    const card: Card = { id: newId(), kind, x, y, w, h, createdAt: Date.now(), ...extra };
    commit([{ op: "put", card }]);
    setSelected(new Set([card.id]));
    // Notes and text open for typing; a shape waits for a double-click, so the next tool key stays a tool key.
    if (kind !== "widget" && kind !== "shape") setEditingId(card.id);
    done();
    return card.id;
  };

  // Every way to add something lands here: tool clicks, the Insert menu and the right-click Add menu.
  const createAt = (kind: AddKind, at: Pt, box?: Box) => {
    if (kind.startsWith("widget:")) {
      place("widget", at, { widget: kind.slice("widget:".length) as WidgetKind });
      return;
    }
    if (kind === "image") {
      imageAt.current = at;
      filePicker.current?.click();
    } else if (kind === "note") place("note", at, { text: "", color: toolStyle.note }, box && fitBox(box, 80, 60));
    else if (kind === "text") place("text", at, { text: "" }, box && fitBox(box, 60, DEFAULT_SIZE.text.h));
    else if (kind === "shape")
      place("shape", at, { text: "", shape: toolStyle.shape, color: toolStyle.shapeColor }, box && fitBox(box, 16, 16));
    else if (kind === "frame") place("frame", at, { text: t.board.frameName }, box && fitBox(box, 120, 80));
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
  const create = (at: Pt, box?: Box) => {
    if (CREATES.has(tool)) createAt(tool as AddKind, at, box);
  };
  // The arrow and line tools: both ends on cards make a connector that follows them; anywhere else, a free line.
  const drawLine = (from: Pt, to: Pt) => {
    const hit = (p: Pt) =>
      [...board.cards]
        .filter((c) => c.kind !== "drawing" && c.kind !== "frame" && p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h)
        .sort((a, b) => layerOf(b) - layerOf(a))[0];
    const a = hit(from);
    const b = hit(to);
    if (a && b && a.id !== b.id) {
      commit([{ op: "link", link: { id: `l-${newId()}`, source: a.id, target: b.id, ...(tool === "arrow" ? { arrow: true } : {}) } }]);
    } else {
      const pad = 12;
      const x = Math.min(from.x, to.x) - pad;
      const y = Math.min(from.y, to.y) - pad;
      const card: Card = {
        id: newId(),
        kind: "drawing",
        line: tool === "arrow" ? "arrow" : "line",
        x,
        y,
        w: Math.abs(to.x - from.x) + pad * 2,
        h: Math.abs(to.y - from.y) + pad * 2,
        points: [from.x - x, from.y - y, to.x - x, to.y - y],
        color: toolStyle.ink,
        stroke: 2,
        createdAt: Date.now(),
      };
      commit([{ op: "put", card }]);
      setSelected(new Set([card.id]));
    }
    done();
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
    zoom100: () => zoomTo(1, 200),
    openTask: (id) => onSelectTask(taskOfNode(id)),
    setEditingId,
    expand,
    toggle,
    clip,
    runId: run.id,
    fileKey: run.fileKey,
    title: run.title ?? run.prompt.slice(0, 60),
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
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && SHAPE_KEYS[key]) {
        const shape = SHAPE_KEYS[key] as ShapeKind;
        setToolStyle((st) => ({ ...st, shape }));
        setTool("shape");
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && key === "q") {
        setLocked((v) => !v);
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
    const found = el.closest<HTMLElement>(".react-flow__node")?.dataset.id;
    // The waiting list is not a card, so it gets no board menu.
    if (found === INBOX_ID) return;
    const nodeId = found;
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
    if (nodeId === INBOX_ID) return;
    if (nodeId && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const card = board.cards.find((c) => c.id === nodeId);
      if (!card) onSelectTask(taskOfNode(nodeId));
      else if (editableCard(card) && !card.locked) setEditingId(card.id);
      else if (card.kind !== "drawing" && card.kind !== "widget" && !editableCard(card)) setExpandedId(card.id);
      return;
    }
    const pan = PAN[e.key];
    if (pan && !nodeId) {
      const { x, y, zoom } = rf.getViewport();
      void rf.setViewport({ x: x + pan.x * PAN_STEP, y: y + pan.y * PAN_STEP, zoom }, { duration: 150 });
    } else if (e.key === "+" || e.key === "=") zoomStep(1);
    else if (e.key === "-") zoomStep(-1);
    else if (e.key === "0") void fit();
    else return;
    e.preventDefault();
  };

  const highlighting = tool === "highlighter";
  const strokeSize = highlighting ? HIGHLIGHT_SIZE : toolStyle.inkSize;
  const strokeColor = highlighting ? toolStyle.highlight : toolStyle.ink;
  // A finished stroke, in flow coordinates, becomes one drawing card.
  const saveStroke = (stroke: number[], pressure?: number[]) => {
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
          ...(highlighting ? { size: HIGHLIGHT_SIZE, highlight: true } : strokeSize !== STROKE_SIZE ? { size: strokeSize } : {}),
          ...(pressure && !highlighting ? { pressure } : {}),
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
  const handleDragStart = useEvent((e: { altKey?: boolean }, _: unknown, picked: Node[]) => {
    // Alt-drag leaves a copy behind and carries the original away, like Excalidraw and Figma.
    if (e.altKey) {
      const ids = new Set(picked.map((n) => n.id));
      const cards = board.cards.filter((c) => ids.has(c.id));
      const links = board.links.filter((l) => ids.has(l.source) && ids.has(l.target));
      if (cards.length) commit(cloneOps({ cards, links }, 0, 0, newId).ops);
    }
    onDragStart(picked);
  });
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
    if (node.type === "person" || node.type === "lead") onSelectTask(taskOfNode(node.id));
  });
  const handleNodeDoubleClick = useEvent((_: unknown, node: Node) => {
    const card = board.cards.find((c) => c.id === node.id);
    if (card && editableCard(card)) {
      if (!card.locked) setEditingId(card.id);
    } else if (card && card.kind !== "drawing" && card.kind !== "widget") setExpandedId(card.id);
  });
  const handlePaneClick = useEvent((e: React.MouseEvent) => {
    if (CREATES.has(tool)) return create(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    onSelectTask(null);
    setSelected(new Set());
    setSelectedLinks(new Set());
  });
  const handleFit = useEvent(() => void fit());
  const handleMoveEnd = useEvent((_: unknown, view: { x: number; y: number; zoom: number }) => saveView(run.id, view));
  const handleInsert = useEvent(insert);
  const handleImage = useEvent(() => filePicker.current?.click());
  const handleStroke = useEvent(saveStroke);
  const handleLock = useEvent(() => setLocked((v) => !v));
  const handleStyle = useEvent((cards: Card[], style: CardStyle) => {
    const ops = styleOps(cards, style);
    if (ops.length) commit(ops);
  });
  const handleBox = useEvent((at: Pt, box?: Box) => create(at, box));
  const handleLine = useEvent(drawLine);
  const gridPoint = useEvent(
    (p: Pt): Pt => (prefs.snap ? { x: Math.round(p.x / SNAP[0]) * SNAP[0], y: Math.round(p.y / SNAP[1]) * SNAP[1] } : p),
  );
  const closeMenu = useEvent(() => setMenu(null));
  // A comment sits beside the card it is about, threaded to it, ready to type.
  const handleComment = useEvent((about: Card) => {
    const { w, h } = WIDGET_SIZE.comment;
    const card: Card = {
      id: newId(),
      kind: "widget",
      widget: "comment",
      ref: about.id,
      text: "",
      x: about.x + about.w + 48,
      y: about.y,
      w,
      h,
      createdAt: Date.now(),
    };
    commit([
      { op: "put", card },
      { op: "link", link: { id: `l-${newId()}`, source: card.id, target: about.id } },
    ]);
    setSelected(new Set([card.id]));
  });
  const handleMore = useEvent((ids: string[], x: number, y: number) =>
    setMenu((m) => ({ x, y, flow: rf.screenToFlowPosition({ x, y }), target: { kind: "nodes", ids }, seq: (m?.seq ?? 0) + 1 })),
  );
  const toolbarCards = useMemo(
    () => (tool === "select" && !editingId && !exporting ? board.cards.filter((c) => selected.has(c.id)) : []),
    [tool, editingId, exporting, board.cards, selected],
  );
  const closeExpanded = useEvent(() => setExpandedId(null));
  const hand = tool === "hand";
  const coarse = useCoarsePointer();

  // Where cards sit as drawn, drafts included, so threads fade behind a card even while it is being dragged.
  // Only threads fade behind cards. Most of the time none is showing, so this costs nothing while dragging.
  const threaded = edges.some((e) => e.className === "satgas-origin" || e.className === "satgas-link");
  const maskRects = useMemo<MaskRect[] | null>(
    () =>
      !threaded
        ? null
        : nodes
            .filter((n): n is CardNodeType => n.type === "card" && (n as CardNodeType).data.card.kind !== "drawing")
            .map((n) => ({
              id: n.id,
              x: n.position.x,
              y: n.position.y,
              w: n.width ?? n.data.card.w,
              h: n.height ?? n.data.card.h,
              frame: n.data.card.kind === "frame",
            })),
    [nodes, threaded],
  );

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
          // Its own stacking context: card z-indexes and composited layers stay inside the canvas, under the panels.
          className={cn("relative isolate size-full outline-none", CREATES.has(tool) && "cursor-crosshair")}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={resolvedTheme}
            defaultViewport={firstView}
            onMoveEnd={handleMoveEnd}
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
            // One finger moves the board, as on any phone; a box selection would take that drag from it.
            selectionOnDrag={!hand && !coarse}
            panOnDrag={hand || coarse ? true : PAN_BUTTONS}
            panOnScroll
            panActivationKeyCode="Space"
            elementsSelectable={!hand}
            nodesDraggable={!hand}
            nodesConnectable={!hand}
          >
            {prefs.grid && <Background variant={BackgroundVariant.Lines} gap={24} />}
            {(CREATES.has(tool) || tool === "arrow" || tool === "line") && (
              <CreateLayer tool={tool} shape={toolStyle.shape} onBox={handleBox} onLine={handleLine} snap={gridPoint} />
            )}
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
              {maskRects && <BehindMask rects={maskRects} />}
              <SnapGuides guides={guides} />
              {groupBoxes.map((b) => (
                <div
                  key={b.id}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 rounded-xl border border-dashed border-foreground/40"
                  style={{ transform: `translate(${b.x}px, ${b.y}px)`, width: b.w, height: b.h }}
                />
              ))}
            </ViewportPortal>
            <SelectionToolbar
              cards={toolbarCards}
              runId={run.id}
              actions={actions}
              onComment={handleComment}
              onMore={handleMore}
              onStyle={handleStyle}
            />
            <ZoomPill onFit={handleFit} onZoom={zoomStep} shifted={panelOpen} />
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
        locked={locked}
        onLock={handleLock}
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
        <Suspense fallback={null}>
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
        </Suspense>
      )}
    </BoardContext>
  );
}

interface PenProps {
  size: number;
  highlight: boolean;
  color: ColorName;
  onStroke: (points: number[], pressure?: number[]) => void;
}

// Owns the stroke being drawn, so each pointer move re-renders this layer only, never the board.
function PenLayer({ size, highlight, color, onStroke }: PenProps) {
  const rf = useReactFlow();
  // Points are appended in place; copying the whole stroke on every move grows quadratically on long strokes.
  const points = useRef<number[] | null>(null);
  // Only a stylus reports real pressure; a mouse or a finger leaves it to the stroke's speed.
  const pressure = useRef<number[] | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const end = (save: boolean) => {
    const stroke = points.current;
    const felt = pressure.current;
    points.current = null;
    pressure.current = null;
    redraw();
    if (save && stroke) onStroke(stroke, felt ?? undefined);
  };
  return (
    <ToolLayer
      className="absolute inset-0 z-4 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        points.current = [p.x, p.y];
        pressure.current = e.pointerType === "pen" ? [e.pressure] : null;
        redraw();
      }}
      onPointerMove={(e) => {
        const s = points.current;
        if (!s) return;
        const minStep = 2 / rf.getViewport().zoom;
        // The browser batches fast moves into one event; its coalesced events hold every point the hand passed.
        const moves = e.nativeEvent.getCoalescedEvents?.() ?? [];
        let added = false;
        for (const m of moves.length ? moves : [e.nativeEvent]) {
          if (s.length >= MAX_STROKE_POINTS * 2) break;
          const p = rf.screenToFlowPosition({ x: m.clientX, y: m.clientY });
          const dx = p.x - (s[s.length - 2] ?? p.x);
          const dy = p.y - (s[s.length - 1] ?? p.y);
          if (dx * dx + dy * dy < minStep * minStep) continue;
          s.push(p.x, p.y);
          pressure.current?.push(m.pressure);
          added = true;
        }
        if (added) redraw();
      }}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
    >
      {points.current && (
        <LiveStroke points={points.current} pressure={pressure.current ?? undefined} size={size} highlight={highlight} color={color} />
      )}
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

interface CreateProps {
  tool: Tool;
  shape: ShapeKind;
  snap: (p: Pt) => Pt;
  onBox: (at: Pt, box?: Box) => void;
  onLine: (from: Pt, to: Pt) => void;
}
interface Drag {
  from: Pt;
  to: Pt;
  start: Pt;
  moved: boolean;
  shift: boolean;
  alt: boolean;
}

// Making things, Excalidraw's way: a click drops the default size, a drag draws the box (Shift square, Alt from the
// centre) or the line (Shift locks it to 15° steps), with the outline showing while it is drawn.
function CreateLayer({ tool, shape, snap, onBox, onLine }: CreateProps) {
  const rf = useReactFlow();
  const [drag, setDrag] = useState<Drag | null>(null);
  const line = tool === "arrow" || tool === "line";
  const at = (e: React.PointerEvent) => snap(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  useEffect(() => {
    if (!drag) return;
    const cancel = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [drag]);
  return (
    <ToolLayer
      className="absolute inset-0 z-4 cursor-crosshair touch-none"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        setDrag({ from: p, to: p, start: { x: e.clientX, y: e.clientY }, moved: false, shift: e.shiftKey, alt: e.altKey });
      }}
      onPointerMove={(e) => {
        const to = at(e);
        setDrag(
          (d) =>
            d && {
              ...d,
              to,
              moved: d.moved || Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) > 4,
              shift: e.shiftKey,
              alt: e.altKey,
            },
        );
      }}
      onPointerUp={() => {
        const d = drag;
        setDrag(null);
        if (!d) return;
        if (line) {
          if (d.moved) onLine(d.from, d.shift ? lockAngle(d.from, d.to) : d.to);
          return;
        }
        if (!d.moved) return onBox(d.from);
        const box = dragBox(d.from, d.to, { square: d.shift, center: d.alt });
        onBox({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, box);
      }}
      onPointerCancel={() => setDrag(null)}
    >
      {drag?.moved && <CreatePreview drag={drag} tool={tool} shape={shape} />}
    </ToolLayer>
  );
}

// The outline of what the drag will make, in screen space so it tracks the pointer exactly.
function CreatePreview({ drag, tool, shape }: { drag: Drag; tool: Tool; shape: ShapeKind }) {
  const { x, y, zoom } = useViewport();
  const sx = (v: number) => v * zoom + x;
  const sy = (v: number) => v * zoom + y;
  const line = tool === "arrow" || tool === "line";
  const look = "fill-foreground/5 stroke-foreground/60";
  if (line) {
    const end = drag.shift ? lockAngle(drag.from, drag.to) : drag.to;
    return (
      <svg className="pointer-events-none absolute inset-0 size-full text-foreground/70" aria-hidden="true">
        <defs>
          <marker id="create-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M1 1 L9 5 L1 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        <line
          x1={sx(drag.from.x)}
          y1={sy(drag.from.y)}
          x2={sx(end.x)}
          y2={sy(end.y)}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          markerEnd={tool === "arrow" ? "url(#create-head)" : undefined}
        />
      </svg>
    );
  }
  const b = dragBox(drag.from, drag.to, { square: drag.shift, center: drag.alt });
  const [l, t0, w, h] = [sx(b.x), sy(b.y), b.w * zoom, b.h * zoom];
  return (
    <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      {tool === "shape" && shape === "ellipse" ? (
        <ellipse cx={l + w / 2} cy={t0 + h / 2} rx={w / 2} ry={h / 2} className={look} strokeWidth={1.5} />
      ) : tool === "shape" && shape === "diamond" ? (
        <path
          d={`M${l + w / 2} ${t0} L${l + w} ${t0 + h / 2} L${l + w / 2} ${t0 + h} L${l} ${t0 + h / 2}Z`}
          className={look}
          strokeWidth={1.5}
        />
      ) : tool === "shape" && shape === "triangle" ? (
        <path d={`M${l + w / 2} ${t0} L${l + w} ${t0 + h} L${l} ${t0 + h}Z`} className={look} strokeWidth={1.5} />
      ) : (
        <rect
          x={l}
          y={t0}
          width={w}
          height={h}
          rx={8}
          className={look}
          strokeWidth={1.5}
          strokeDasharray={tool === "frame" ? "6 4" : undefined}
        />
      )}
    </svg>
  );
}

// The lines a dragged card snapped to, one screen pixel wide at any zoom, in the board's one accent.
function SnapGuides({ guides }: { guides: Guide[] }) {
  const { zoom } = useViewport();
  if (!guides.length) return null;
  const px = 1 / zoom;
  return (
    <>
      {guides.map((g) => (
        <div
          key={`${g.axis}${g.at}`}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 bg-signal"
          style={
            g.axis === "x"
              ? { transform: `translate(${g.at - px / 2}px, ${g.from}px)`, width: px, height: g.to - g.from }
              : { transform: `translate(${g.from}px, ${g.at - px / 2}px)`, width: g.to - g.from, height: px }
          }
        />
      ))}
    </>
  );
}

// Renders the stroke being drawn in screen space, so it tracks the pointer exactly.
function LiveStroke({
  points,
  pressure,
  size,
  highlight,
  color,
}: {
  points: number[];
  pressure?: number[];
  size: number;
  highlight: boolean;
  color: ColorName;
}) {
  const { x, y, zoom } = useViewport();
  const screen = points.map((v, i) => (i % 2 === 0 ? v * zoom + x : v * zoom + y));
  return (
    <svg className={cn("pointer-events-none absolute inset-0 size-full", PALETTE[color].ink, highlight && "opacity-40")} aria-hidden="true">
      <path d={strokePath(screen, { size: size * zoom, highlight, pressure, last: false })} fill="currentColor" />
    </svg>
  );
}

// The expanded card, read at a size meant for reading.
const ExpandDialog = memo(function ExpandDialog({ card, onClose }: { card: Card | null; onClose: () => void }) {
  return (
    <Dialog open={!!card} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex h-[min(85vh,56rem)] max-w-[min(92vw,72rem)] flex-col gap-3 p-4 sm:max-w-[min(92vw,72rem)]"
        // The Cite button floats outside the dialog; pressing it must not close what is being read.
        onPointerDownOutside={(e) => {
          if ((e.target as Element | null)?.closest?.("[data-cite-button]")) e.preventDefault();
        }}
      >
        <DialogTitle className="truncate pe-8 text-sm font-medium">{card?.title ?? t.board.expand}</DialogTitle>
        <div data-cite className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          {card && <CardBody card={card} large />}
        </div>
      </DialogContent>
    </Dialog>
  );
});

const ZoomPill = memo(function ZoomPill({
  onFit,
  onZoom,
  shifted,
}: {
  onFit: () => void;
  onZoom: (dir: 1 | -1) => void;
  shifted: boolean;
}) {
  // Subscribes to the rounded percentage, so panning does not re-render the pill.
  const percent = useStore((s) => Math.round(s.transform[2] * 100));
  return (
    <Panel
      position="bottom-right"
      className={cn(
        "m-4! flex items-center gap-0.5 rounded-xl border bg-card p-1 shadow-sm max-lg:hidden",
        shifted && "me-[calc(var(--panel-w)+1.5rem)]!",
      )}
    >
      <ZoomButton label={t.fit} onClick={onFit}>
        <Maximize />
      </ZoomButton>
      <ZoomButton label={t.zoomOut} onClick={() => onZoom(-1)}>
        <Minus />
      </ZoomButton>
      <output aria-label={t.board.zoom} className="w-11 text-center text-xs text-muted-foreground tabular-nums">
        {percent}%
      </output>
      <ZoomButton label={t.zoomIn} onClick={() => onZoom(1)}>
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
