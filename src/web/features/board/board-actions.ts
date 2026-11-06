import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import type { RefObject } from "react";
import { toast } from "sonner";
import { openExternal } from "@/components/outbound-link";
import { t } from "@/i18n";
import { type Board, type BoardOp, type Card, DEFAULT_SIZE } from "../../../shared/board";
import type { NodeState } from "../../../shared/types";
import type { AddKind, MenuActions } from "./board-menu";
import { editableCard } from "./cards";
import { keyedSrc, newId } from "./context";
import type { Align } from "./edit";
import {
  alignMoves,
  arrangeOps,
  bounds,
  type CardStyle,
  cloneOps,
  decodeClip,
  distributeMoves,
  encodeClip,
  flipOps,
  frameAround,
  groupOps,
  type Item,
  inside,
  type Move,
  moveUnits,
  styleOf,
  styleOps,
  tidyMoves,
  ungroupOps,
} from "./edit";
import { requestBoardExport } from "./export";
import type { BoardPrefs } from "./prefs";
import type { Shortcut } from "./shortcuts";

type Pt = { x: number; y: number };

// What the menu and shortcuts last copied in this tab; the fallback when the system clipboard cannot be read.
export interface LocalClip {
  text: string | null;
  style: CardStyle | null;
}

export interface ActionDeps {
  rf: ReactFlowInstance<Node, Edge>;
  board: Board;
  tasks: NodeState[];
  commit: (ops: BoardOp[]) => void;
  select: (ids: string[]) => void;
  createAt: (kind: AddKind, at: Pt) => void;
  addImages: (files: File[], at: Pt) => Promise<void>;
  fit: (ids?: string[]) => void;
  // Zoom to 100% around the middle of the part of the board the panel leaves visible.
  zoom100: () => void;
  openTask: (id: string) => void;
  setEditingId: (id: string) => void;
  expand: (card: Card) => void;
  toggle: (pref: keyof BoardPrefs) => void;
  clip: RefObject<LocalClip>;
  runId: string;
  fileKey?: string;
  // The board's name, for exported files that are not named after a card.
  title: string;
  // Where nodes sit right now, tasks included, and how to move them; tasks and cards store positions differently.
  items: (ids: string[]) => Item[];
  move: (moves: Move[]) => void;
}

export interface BoardActions extends MenuActions {
  // True when the text became cards: copied Satgas cards come back as cards, any other text as a note or doc.
  pasteText: (text: string, at: Pt) => boolean;
  run: (shortcut: Shortcut, selected: string[]) => void;
}

export function boardActions(d: ActionDeps): BoardActions {
  const pick = (ids: string[]) => {
    const want = new Set(ids);
    return d.board.cards.filter((c) => want.has(c.id));
  };
  const free = (ids: string[]) => pick(ids).filter((c) => !c.locked);
  const groupOf = (id: string) => d.board.cards.find((c) => c.id === id)?.group || undefined;
  // Layouts move unlocked cards and tasks, a group as one unit.
  const layout = (ids: string[], fn: (units: Item[]) => Move[]) => {
    const locked = new Set(
      pick(ids)
        .filter((c) => c.locked)
        .map((c) => c.id),
    );
    d.move(moveUnits(d.items(ids.filter((id) => !locked.has(id))), groupOf, fn));
  };

  const copy = (ids: string[]) => {
    const text = encodeClip(d.board, new Set(ids));
    if (!text) return;
    d.clip.current.text = text;
    void navigator.clipboard?.writeText(text).catch(() => {});
  };

  const remove = (ids: string[]) => d.commit(free(ids).map((c): BoardOp => ({ op: "delete", id: c.id })));

  const pasteText = (text: string, at: Pt): boolean => {
    const clip = decodeClip(text);
    if (clip) {
      const b = bounds(clip.cards);
      const { ops, ids } = cloneOps(clip, at.x - (b.x + b.w / 2), at.y - (b.y + b.h / 2), newId);
      d.commit(ops);
      d.select(ids);
      return true;
    }
    const body = text.trim().slice(0, 20_000);
    if (!body) return false;
    // A short snippet reads as a sticky note; anything longer gets a doc with room for it.
    const kind = body.length > 280 || body.split("\n").length > 6 ? "doc" : "note";
    const { w, h } = DEFAULT_SIZE[kind];
    const card: Card = { id: newId(), kind, x: at.x - w / 2, y: at.y - h / 2, w, h, text: body, createdAt: Date.now() };
    d.commit([{ op: "put", card }]);
    d.select([card.id]);
    return true;
  };

  const actions: BoardActions = {
    edit: (id) => {
      const card = pick([id])[0];
      if (card && editableCard(card) && !card.locked) d.setEditingId(id);
    },
    expand: (id) => {
      const card = pick([id])[0];
      if (card) d.expand(card);
    },
    openTab: (id) => {
      const src = keyedSrc(pick([id])[0]?.src, d.runId, d.fileKey);
      if (src) openExternal(src);
    },
    copy,
    cut: (ids) => {
      copy(ids);
      remove(ids);
    },
    paste: async (at) => {
      const point = at ?? centerOf(d.rf);
      try {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        for (const item of items) {
          const type = item.types.find((ty) => ty.startsWith("image/"));
          if (type) files.push(new File([await item.getType(type)], "pasted-image", { type }));
        }
        if (files.length) return void d.addImages(files, point);
        const plain = items.find((i) => i.types.includes("text/plain"));
        const text = plain ? await (await plain.getType("text/plain")).text() : "";
        if (text && pasteText(text, point)) return;
      } catch {
        // Reading the clipboard needs permission; without it, paste what this tab copied.
      }
      if (d.clip.current.text && pasteText(d.clip.current.text, point)) return;
      toast(t.boardMenu.nothingToPaste);
    },
    duplicate: (ids) => {
      const cards = pick(ids);
      if (!cards.length) return;
      const want = new Set(cards.map((c) => c.id));
      const links = d.board.links.filter((l) => want.has(l.source) && want.has(l.target));
      const { ops, ids: copies } = cloneOps({ cards, links }, 24, 24, newId);
      d.commit(ops);
      d.select(copies);
    },
    copyPng: (ids) => requestBoardExport("clipboard", ids?.length ? ids : undefined),
    // Loaded with the menu that offers them, so the import resolves within the click and the clipboard still allows the write.
    copyCards: (ids, format) =>
      void import("./card-export").then((m) =>
        m.copyCards(pick(ids), d.board.cards, format, (src) => keyedSrc(src, d.runId, d.fileKey) ?? src),
      ),
    exportCards: (ids, format) =>
      void import("./card-export").then((m) =>
        m.exportCards(pick(ids), d.board.cards, format, d.title, (src) => keyedSrc(src, d.runId, d.fileKey) ?? src),
      ),
    copyStyle: (ids) => {
      d.clip.current.style = styleOf(pick(ids));
    },
    pasteStyle: (ids) => {
      const style = d.clip.current.style;
      if (style) d.commit(styleOps(pick(ids), style));
    },
    color: (ids, color) => d.commit(styleOps(pick(ids), { color })),
    wrapFrame: (ids) => {
      const nodes = d.rf.getNodes().filter((n) => ids.includes(n.id));
      if (!nodes.length) return;
      const b = d.rf.getNodesBounds(nodes);
      d.commit([{ op: "put", card: frameAround({ x: b.x, y: b.y, w: b.width, h: b.height }, newId(), t.board.frameName) }]);
    },
    arrange: (ids, dir) => d.commit(arrangeOps(d.board, new Set(ids), dir)),
    group: (ids) => d.commit(groupOps(pick(ids), newId())),
    ungroup: (ids) => d.commit(ungroupOps(pick(ids))),
    align: (ids, how) => layout(ids, (units) => alignMoves(units, how)),
    distribute: (ids, axis) => layout(ids, (units) => distributeMoves(units, axis)),
    tidy: (ids) => layout(ids, (units) => tidyMoves(units)),
    selectContents: (id) => {
      const frame = pick([id])[0];
      if (!frame) return;
      const all = [...d.tasks.map((n) => n.id), ...d.board.cards.map((c) => c.id)].filter((x) => x !== id);
      d.select([id, ...inside(frame, d.items(all)).map((it) => it.id)]);
    },
    flip: (ids, axis) => d.commit(flipOps(pick(ids), axis)),
    setLocked: (ids, locked) =>
      d.commit(pick(ids).flatMap((c): BoardOp[] => (!!c.locked === locked ? [] : [{ op: "patch", id: c.id, patch: { locked } }]))),
    zoomTo: (ids) => d.fit(ids),
    remove,
    openTask: (id) => d.openTask(id),
    copyReport: (id) => {
      const output = d.tasks.find((n) => n.id === id)?.output;
      if (!output) return;
      navigator.clipboard.writeText(output).then(
        () => toast.success(t.reportCopied),
        () => toast.error(t.copyFailed),
      );
    },
    deleteLink: (id) => d.commit([{ op: "delete", id }]),
    add: (kind, at) => d.createAt(kind, at),
    selectAll: () => d.select([...d.tasks.map((n) => n.id), ...d.board.cards.map((c) => c.id)]),
    fit: () => d.fit(),
    zoom100: () => d.zoom100(),
    toggle: (pref) => d.toggle(pref),
    exportBoard: (format) => requestBoardExport(format),
    pasteText,
    run: (shortcut, selected) => {
      const cards = pick(selected).map((c) => c.id);
      if (shortcut === "duplicate") actions.duplicate(cards);
      else if (shortcut === "selectAll") actions.selectAll();
      else if (shortcut === "front" || shortcut === "forward" || shortcut === "backward" || shortcut === "back")
        actions.arrange(cards, shortcut);
      else if (shortcut === "lock") actions.setLocked(cards, free(cards).length > 0);
      else if (shortcut === "group") actions.group(cards);
      else if (shortcut === "ungroup") actions.ungroup(cards);
      else if (shortcut === "distributeH") actions.distribute(selected, "x");
      else if (shortcut === "distributeV") actions.distribute(selected, "y");
      else if (shortcut.startsWith("align:")) actions.align(selected, shortcut.slice(6) as Align);
      else if (shortcut === "grid") actions.toggle("grid");
      else if (shortcut === "snap") actions.toggle("snap");
      else if (shortcut === "copyStyle") actions.copyStyle(cards);
      else if (shortcut === "pasteStyle") actions.pasteStyle(cards);
      else if (shortcut === "copyPng") actions.copyPng(selected);
      else if (shortcut === "flipH") actions.flip(cards, "x");
      else if (shortcut === "flipV") actions.flip(cards, "y");
      else if (shortcut === "fit") actions.fit();
      else if (shortcut === "zoomSelection" && selected.length) actions.zoomTo(selected);
      else if (shortcut === "zoom100") actions.zoom100();
    },
  };
  return actions;
}

// The middle of what is on screen, in board coordinates.
function centerOf(rf: ReactFlowInstance<Node, Edge>): Pt {
  const el = document.querySelector(".react-flow");
  const r = el?.getBoundingClientRect();
  return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 0) / 2, y: (r?.top ?? 0) + (r?.height ?? 0) / 2 });
}
