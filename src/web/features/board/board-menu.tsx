import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  Blocks,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  ClipboardPaste,
  Code2,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  FileText,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  Group,
  Image,
  ImagePlus,
  Layers,
  LayoutGrid,
  Lock,
  LockOpen,
  type LucideIcon,
  Maximize,
  Maximize2,
  PaintRoller,
  Palette,
  PanelRight,
  Pencil,
  Pipette,
  Plus,
  Scan,
  Scissors,
  Shapes,
  SquareDashedMousePointer,
  SquareMousePointer,
  StickyNote,
  Table2,
  Trash2,
  Type,
  Ungroup,
  ZoomIn,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isMac, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { type Board, type Card, COLORS, type ColorName } from "../../../shared/board";
import type { NodeState } from "../../../shared/types";
import { type CardFormat, type CopyFormat, codeFileName, copyFormats, exportFormats } from "./card-export";
import { EXPANDABLE, editableCard } from "./cards";
import { type Align, type Arrange, canColor, styleOf } from "./edit";
import { PALETTE } from "./palette";
import type { BoardPrefs } from "./prefs";
import type { Insert, Tool } from "./toolbar";
import { WidgetMenuItems } from "./widget-menu";

type Pt = { x: number; y: number };
export type MenuTarget = { kind: "pane" } | { kind: "nodes"; ids: string[] } | { kind: "link"; id: string };
export interface MenuState {
  // Screen point the menu opens from, and the same point on the board.
  x: number;
  y: number;
  flow: Pt;
  target: MenuTarget;
}

export type AddKind = Extract<Tool, "note" | "text" | "shape" | "frame"> | Insert | "image";

export interface MenuActions {
  edit: (id: string) => void;
  expand: (id: string) => void;
  openTab: (id: string) => void;
  cut: (ids: string[]) => void;
  copy: (ids: string[]) => void;
  paste: (at?: Pt) => void;
  duplicate: (ids: string[]) => void;
  copyPng: (ids?: string[]) => void;
  exportCards: (ids: string[], format: CardFormat) => void;
  copyCards: (ids: string[], format: CopyFormat) => void;
  copyStyle: (ids: string[]) => void;
  pasteStyle: (ids: string[]) => void;
  color: (ids: string[], color: ColorName) => void;
  wrapFrame: (ids: string[]) => void;
  arrange: (ids: string[], dir: Arrange) => void;
  group: (ids: string[]) => void;
  ungroup: (ids: string[]) => void;
  align: (ids: string[], how: Align) => void;
  distribute: (ids: string[], axis: "x" | "y") => void;
  tidy: (ids: string[]) => void;
  selectContents: (id: string) => void;
  flip: (ids: string[], axis: "x" | "y") => void;
  setLocked: (ids: string[], locked: boolean) => void;
  zoomTo: (ids: string[]) => void;
  remove: (ids: string[]) => void;
  openTask: (id: string) => void;
  copyReport: (id: string) => void;
  deleteLink: (id: string) => void;
  add: (kind: AddKind, at: Pt) => void;
  selectAll: () => void;
  fit: () => void;
  zoom100: () => void;
  toggle: (pref: keyof BoardPrefs) => void;
  exportBoard: (format: "png" | "pdf") => void;
}

interface Props {
  menu: MenuState | null;
  onClose: () => void;
  board: Board;
  tasks: NodeState[];
  hasStyle: boolean;
  prefs: BoardPrefs;
  actions: MenuActions;
}

// Shortcut labels the way each platform writes them: ⌥⇧⌘X on a Mac, Ctrl+Shift+X elsewhere.
const mac = { mod: "⌘", alt: "⌥", shift: "⇧", sep: "" };
const pc = { mod: "Ctrl", alt: "Alt", shift: "Shift", sep: "+" };
function keys(...parts: string[]): string {
  const k = isMac ? mac : pc;
  const order = isMac ? ["alt", "shift", "mod"] : ["mod", "shift", "alt"];
  const mods = order.filter((m) => parts.includes(m)).map((m) => k[m as "mod" | "alt" | "shift"]);
  const rest = parts.filter((p) => !["mod", "alt", "shift"].includes(p));
  return [...mods, ...rest].join(k.sep);
}

// The board's right-click menu: what can be done to the cards under the pointer, or to the board itself.
export function BoardMenu({ menu, onClose, board, tasks, hasStyle, prefs, actions }: Props) {
  return (
    <DropdownMenu open={!!menu} onOpenChange={(open) => !open && onClose()} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden="true" className="pointer-events-none fixed size-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={2} className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        {menu?.target.kind === "pane" && <PaneItems at={menu.flow} prefs={prefs} actions={actions} />}
        {menu?.target.kind === "link" && (
          <Row
            icon={Trash2}
            label={t.boardMenu.deleteLink}
            keys="⌫"
            danger
            onSelect={() => actions.deleteLink((menu.target as { id: string }).id)}
          />
        )}
        {menu?.target.kind === "nodes" && (
          <NodeItems
            at={menu.flow}
            cards={board.cards.filter((c) => (menu.target as { ids: string[] }).ids.includes(c.id))}
            allCards={board.cards}
            tasks={tasks.filter((n) => (menu.target as { ids: string[] }).ids.includes(n.id))}
            picked={(menu.target as { ids: string[] }).ids}
            hasStyle={hasStyle}
            actions={actions}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({
  icon: Icon,
  label,
  keys: hint,
  onSelect,
  disabled,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  keys?: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled} variant={danger ? "destructive" : "default"}>
      <Icon />
      {label}
      {hint && <DropdownMenuShortcut>{hint}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  );
}

// Groups split by a hairline; empty groups vanish so no two separators meet.
function Groups({ children }: { children: ReactNode[] }) {
  const groups = children.filter(Boolean);
  return (
    <>
      {groups.map((g, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: groups are fixed per menu and never reorder.
        <Fragment key={i}>
          {i > 0 && <DropdownMenuSeparator />}
          {g}
        </Fragment>
      ))}
    </>
  );
}

function PaneItems({ at, prefs, actions }: { at: Pt; prefs: BoardPrefs; actions: MenuActions }) {
  const add = (kind: AddKind) => () => actions.add(kind, at);
  return (
    <Groups>
      {[
        <Fragment key="edit">
          <Row icon={ClipboardPaste} label={t.boardMenu.paste} keys={keys("mod", "V")} onSelect={() => actions.paste(at)} />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus />
              {t.boardMenu.add}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <Row icon={StickyNote} label={t.board.note} keys="N" onSelect={add("note")} />
              <Row icon={Type} label={t.board.textTool} keys="T" onSelect={add("text")} />
              <Row icon={Shapes} label={t.board.shapeTool} keys="S" onSelect={add("shape")} />
              <Row icon={Frame} label={t.board.frameTool} keys="F" onSelect={add("frame")} />
              <DropdownMenuSeparator />
              <Row icon={FileText} label={t.board.insertDoc} onSelect={add("doc")} />
              <Row icon={Table2} label={t.board.insertTable} onSelect={add("table")} />
              <Row icon={Code2} label={t.board.insertCode} onSelect={add("code")} />
              <Row icon={ImagePlus} label={t.boardMenu.imageFile} keys="I" onSelect={add("image")} />
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Blocks />
                  {t.widget.menu}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <WidgetMenuItems onPick={(w) => actions.add(`widget:${w}`, at)} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <Row icon={SquareDashedMousePointer} label={t.boardMenu.selectAll} keys={keys("mod", "A")} onSelect={actions.selectAll} />
        </Fragment>,
        <Fragment key="view">
          <Row icon={Maximize} label={t.fit} keys={keys("shift", "1")} onSelect={actions.fit} />
          <Row icon={ZoomIn} label={t.boardMenu.zoom100} keys={keys("shift", "0")} onSelect={actions.zoom100} />
        </Fragment>,
        <Fragment key="prefs">
          <DropdownMenuCheckboxItem checked={prefs.grid} onCheckedChange={() => actions.toggle("grid")}>
            {t.boardMenu.grid}
            <DropdownMenuShortcut>{keys("mod", "'")}</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={prefs.snap} onCheckedChange={() => actions.toggle("snap")}>
            {t.boardMenu.snap}
            <DropdownMenuShortcut>{keys("shift", "mod", "'")}</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
        </Fragment>,
        <Fragment key="export">
          <Row icon={Image} label={t.boardMenu.copyPng} keys={keys("alt", "shift", "C")} onSelect={() => actions.copyPng()} />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download />
              {t.exporter.label}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <Row icon={Image} label={t.exporter.image} onSelect={() => actions.exportBoard("png")} />
              <Row icon={FileText} label={t.exporter.pdf} onSelect={() => actions.exportBoard("pdf")} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Fragment>,
      ]}
    </Groups>
  );
}

interface NodeItemsProps {
  // Every card on the board, so a frame's export covers what it holds.
  allCards: Card[];
  at: Pt;
  cards: Card[];
  tasks: NodeState[];
  // Everything selected, the lead included, which is neither a card nor a task.
  picked: string[];
  hasStyle: boolean;
  actions: MenuActions;
}

function NodeItems({ at, cards, allCards, tasks, picked, hasStyle, actions }: NodeItemsProps) {
  const ids = [...cards.map((c) => c.id), ...tasks.map((n) => n.id)];
  const cardIds = cards.map((c) => c.id);
  const zoom = (
    <Row key="zoom" icon={Scan} label={t.boardMenu.zoomSelection} keys={keys("shift", "2")} onSelect={() => actions.zoomTo(ids)} />
  );

  // Agent tasks have their own short menu: they are the plan, not cards to rearrange.
  if (!cards.length) {
    const task = tasks.length === 1 ? tasks[0] : undefined;
    return (
      <Groups>
        {[
          task && (
            <Fragment key="task">
              <Row icon={PanelRight} label={t.boardMenu.openDetails} keys="↵" onSelect={() => actions.openTask(task.id)} />
              {task.output && <Row icon={Copy} label={t.copyReport} onSelect={() => actions.copyReport(task.id)} />}
            </Fragment>
          ),
          zoom,
        ]}
      </Groups>
    );
  }

  const free = cards.filter((c) => !c.locked);
  const one = cards.length === 1 && !tasks.length ? cards[0] : undefined;
  const allLocked = !free.length;
  const opensInTab = one && (one.kind === "preview" || one.kind === "image") && one.src;
  const drawings = free.some((c) => c.kind === "drawing");
  const shared = cards.every((c) => c.color === cards[0]?.color) ? cards[0]?.color : undefined;
  const grouped = cards.some((c) => c.group);
  const oneGroup = !!cards[0]?.group && cards.every((c) => c.group === cards[0]?.group);
  // A group counts once: it lines up as a single box.
  const units = tasks.length + new Set(free.map((c) => c.group || c.id)).size;
  const frame = one?.kind === "frame" ? one : undefined;

  return (
    <Groups>
      {[
        one && (editableCard(one) || EXPANDABLE.has(one.kind) || opensInTab) && (
          <Fragment key="open">
            {editableCard(one) && one.kind !== "drawing" && (
              <Row icon={Pencil} label={t.boardMenu.edit} keys="↵" disabled={!!one.locked} onSelect={() => actions.edit(one.id)} />
            )}
            {EXPANDABLE.has(one.kind) && <Row icon={Maximize2} label={t.board.expand} onSelect={() => actions.expand(one.id)} />}
            {opensInTab && <Row icon={ExternalLink} label={t.board.open} onSelect={() => actions.openTab(one.id)} />}
          </Fragment>
        ),
        <Fragment key="clip">
          <Row icon={Scissors} label={t.boardMenu.cut} keys={keys("mod", "X")} disabled={allLocked} onSelect={() => actions.cut(cardIds)} />
          <Row icon={Copy} label={t.boardMenu.copy} keys={keys("mod", "C")} onSelect={() => actions.copy(cardIds)} />
          <Row icon={ClipboardPaste} label={t.boardMenu.paste} keys={keys("mod", "V")} onSelect={() => actions.paste(at)} />
          <Row icon={CopyPlus} label={t.boardMenu.duplicate} keys={keys("mod", "D")} onSelect={() => actions.duplicate(cardIds)} />
        </Fragment>,
        <Fragment key="style">
          {tasks.length || !cards.length ? (
            <Row icon={Image} label={t.boardMenu.copyPng} keys={keys("alt", "shift", "C")} onSelect={() => actions.copyPng(picked)} />
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Copy />
                {t.boardMenu.copyAs}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {copyFormats(cards, allCards).map((f) =>
                  f === "png" ? (
                    <DropdownMenuItem key={f} onSelect={() => actions.copyPng(picked)}>
                      <span className="flex-1">{t.boardMenu.copyFormats.png}</span>
                      <DropdownMenuShortcut>{keys("alt", "shift", "C")}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={f} onSelect={() => actions.copyCards(cardIds, f)}>
                      <span className="flex-1">{t.boardMenu.copyFormats[f]}</span>
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {!tasks.length && cards.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Download />
                {t.boardMenu.export}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {exportFormats(cards, allCards).map((f) => (
                  <DropdownMenuItem key={f} onSelect={() => actions.exportCards(cardIds, f)}>
                    <span className="flex-1">
                      {f === "file" ? t.boardMenu.formats.file(one ? codeFileName(one) : "") : t.boardMenu.formats[f]}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {styleOf(cards) && (
            <Row icon={Pipette} label={t.boardMenu.copyStyle} keys={keys("alt", "mod", "C")} onSelect={() => actions.copyStyle(cardIds)} />
          )}
          {canColor(free) && (
            <Row
              icon={PaintRoller}
              label={t.boardMenu.pasteStyle}
              keys={keys("alt", "mod", "V")}
              disabled={!hasStyle}
              onSelect={() => actions.pasteStyle(cardIds)}
            />
          )}
        </Fragment>,
        <Fragment key="layout">
          {canColor(free) && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette />
                {t.boardMenu.color}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="grid min-w-0 grid-cols-4 gap-0.5 p-1">
                {COLORS.map((c) => (
                  <DropdownMenuItem
                    key={c}
                    aria-label={t.board.color[c] ?? c}
                    title={t.board.color[c] ?? c}
                    onSelect={() => actions.color(cardIds, c)}
                    className="size-8 justify-center p-0"
                  >
                    <span
                      className={cn(
                        "size-4.5 rounded-full ring-offset-2 ring-offset-popover",
                        PALETTE[c].swatch,
                        shared === c ? "ring-2 ring-foreground/70" : "ring-1 ring-foreground/15",
                      )}
                    />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {cards.length > 1 && !oneGroup && (
            <Row icon={Group} label={t.boardMenu.group} keys={keys("mod", "G")} onSelect={() => actions.group(cardIds)} />
          )}
          {grouped && (
            <Row icon={Ungroup} label={t.boardMenu.ungroup} keys={keys("shift", "mod", "G")} onSelect={() => actions.ungroup(cardIds)} />
          )}
          <Row icon={Frame} label={t.boardMenu.wrapFrame} onSelect={() => actions.wrapFrame(ids)} />
          {frame && <Row icon={SquareMousePointer} label={t.boardMenu.selectContents} onSelect={() => actions.selectContents(frame.id)} />}
          {units > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <AlignStartVertical />
                {t.boardMenu.align}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-60">
                <Row
                  icon={AlignStartVertical}
                  label={t.boardMenu.alignLeft}
                  keys={keys("alt", "A")}
                  onSelect={() => actions.align(ids, "left")}
                />
                <Row
                  icon={AlignCenterVertical}
                  label={t.boardMenu.alignCenter}
                  keys={keys("alt", "H")}
                  onSelect={() => actions.align(ids, "center")}
                />
                <Row
                  icon={AlignEndVertical}
                  label={t.boardMenu.alignRight}
                  keys={keys("alt", "D")}
                  onSelect={() => actions.align(ids, "right")}
                />
                <DropdownMenuSeparator />
                <Row
                  icon={AlignStartHorizontal}
                  label={t.boardMenu.alignTop}
                  keys={keys("alt", "W")}
                  onSelect={() => actions.align(ids, "top")}
                />
                <Row
                  icon={AlignCenterHorizontal}
                  label={t.boardMenu.alignMiddle}
                  keys={keys("alt", "V")}
                  onSelect={() => actions.align(ids, "middle")}
                />
                <Row
                  icon={AlignEndHorizontal}
                  label={t.boardMenu.alignBottom}
                  keys={keys("alt", "S")}
                  onSelect={() => actions.align(ids, "bottom")}
                />
                {units > 2 && (
                  <>
                    <DropdownMenuSeparator />
                    <Row
                      icon={AlignHorizontalSpaceAround}
                      label={t.boardMenu.distributeH}
                      keys={keys("alt", "shift", "H")}
                      onSelect={() => actions.distribute(ids, "x")}
                    />
                    <Row
                      icon={AlignVerticalSpaceAround}
                      label={t.boardMenu.distributeV}
                      keys={keys("alt", "shift", "V")}
                      onSelect={() => actions.distribute(ids, "y")}
                    />
                  </>
                )}
                <DropdownMenuSeparator />
                <Row icon={LayoutGrid} label={t.boardMenu.tidy} onSelect={() => actions.tidy(ids)} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={allLocked}>
              <Layers />
              {t.boardMenu.arrange}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <Row
                icon={ChevronsUp}
                label={t.boardMenu.front}
                keys={keys("alt", "mod", "]")}
                onSelect={() => actions.arrange(cardIds, "front")}
              />
              <Row
                icon={ChevronUp}
                label={t.boardMenu.forward}
                keys={keys("mod", "]")}
                onSelect={() => actions.arrange(cardIds, "forward")}
              />
              <Row
                icon={ChevronDown}
                label={t.boardMenu.backward}
                keys={keys("mod", "[")}
                onSelect={() => actions.arrange(cardIds, "backward")}
              />
              <Row
                icon={ChevronsDown}
                label={t.boardMenu.back}
                keys={keys("alt", "mod", "[")}
                onSelect={() => actions.arrange(cardIds, "back")}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Fragment>,
        <Fragment key="state">
          {drawings && (
            <>
              <Row icon={FlipHorizontal2} label={t.boardMenu.flipH} keys={keys("shift", "H")} onSelect={() => actions.flip(cardIds, "x")} />
              <Row icon={FlipVertical2} label={t.boardMenu.flipV} keys={keys("shift", "V")} onSelect={() => actions.flip(cardIds, "y")} />
            </>
          )}
          {allLocked ? (
            <Row
              icon={LockOpen}
              label={t.boardMenu.unlock}
              keys={keys("shift", "mod", "L")}
              onSelect={() => actions.setLocked(cardIds, false)}
            />
          ) : (
            <Row icon={Lock} label={t.boardMenu.lock} keys={keys("shift", "mod", "L")} onSelect={() => actions.setLocked(cardIds, true)} />
          )}
          {zoom}
        </Fragment>,
        <Row
          key="delete"
          icon={Trash2}
          label={t.boardMenu.delete}
          keys="⌫"
          danger
          disabled={allLocked}
          onSelect={() => actions.remove(cardIds)}
        />,
      ]}
    </Groups>
  );
}
