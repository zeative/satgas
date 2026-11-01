import {
  Code2,
  Eraser,
  FileText,
  Frame,
  Hand,
  Highlighter,
  ImagePlus,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  Shapes,
  StickyNote,
  Table2,
  Type,
  Undo2,
} from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isMac, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { type ColorName, SHAPES, type ShapeKind } from "../../../shared/board";
import { HIGHLIGHT_COLORS, INK_COLORS, NOTE_COLORS, PALETTE } from "./palette";

export type Tool = "select" | "hand" | "note" | "text" | "shape" | "frame" | "pen" | "highlighter" | "eraser";
export type Insert = "doc" | "table" | "code";

export const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "hand",
  n: "note",
  t: "text",
  s: "shape",
  f: "frame",
  p: "pen",
  e: "eraser",
};

// What each creating tool will make next; kept by the canvas so it survives switching tools.
export interface ToolStyle {
  note: ColorName;
  shape: ShapeKind;
  shapeColor: ColorName;
  ink: ColorName;
  highlight: ColorName;
}

const DRAW: Tool[] = ["pen", "highlighter", "eraser"];

interface Props {
  tool: Tool;
  style: ToolStyle;
  onTool: (tool: Tool) => void;
  onStyle: (style: ToolStyle) => void;
  onInsert: (what: Insert) => void;
  onImage: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

// Miro-style tool column; the tool in use opens a second column with its options (colors, shapes, pen kinds).
// Memoized: its props only change with the tool, style or history, never on a drag frame.
export const BoardToolbar = memo(function BoardToolbar({
  tool,
  style,
  onTool,
  onStyle,
  onInsert,
  onImage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  const mod = isMac ? "⌘" : "Ctrl+";
  const drawing = DRAW.includes(tool);
  return (
    // Marks the toolbar as part of the board, so board shortcuts still work with focus on a tool button.
    <div data-board-chrome className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2 items-start gap-2">
      <div className="flex flex-col gap-2">
        <div
          role="toolbar"
          aria-label={t.board.tools}
          aria-orientation="vertical"
          className="pointer-events-auto flex flex-col gap-0.5 rounded-xl border bg-card p-1 shadow-sm"
        >
          <ToolButton label={t.board.select} hint="V" active={tool === "select"} onClick={() => onTool("select")}>
            <MousePointer2 />
          </ToolButton>
          <ToolButton label={t.board.hand} hint="H" active={tool === "hand"} onClick={() => onTool("hand")}>
            <Hand />
          </ToolButton>
          <Divider />
          <ToolButton label={t.board.note} hint="N" active={tool === "note"} onClick={() => onTool("note")}>
            <StickyNote />
          </ToolButton>
          <ToolButton label={t.board.textTool} hint="T" active={tool === "text"} onClick={() => onTool("text")}>
            <Type />
          </ToolButton>
          <ToolButton label={t.board.shapeTool} hint="S" active={tool === "shape"} onClick={() => onTool("shape")}>
            <Shapes />
          </ToolButton>
          <ToolButton label={t.board.pen} hint="P" active={drawing} onClick={() => onTool(drawing ? tool : "pen")}>
            {tool === "highlighter" ? <Highlighter /> : tool === "eraser" ? <Eraser /> : <PenLine />}
          </ToolButton>
          <ToolButton label={t.board.frameTool} hint="F" active={tool === "frame"} onClick={() => onTool("frame")}>
            <Frame />
          </ToolButton>
          <Divider />
          <DropdownMenu modal={false}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.board.insert}
                    className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <Plus />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">{t.board.insert}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side="right" align="start" className="w-44">
              <DropdownMenuItem onSelect={() => onInsert("doc")}>
                <FileText />
                {t.board.insertDoc}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onInsert("table")}>
                <Table2 />
                {t.board.insertTable}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onInsert("code")}>
                <Code2 />
                {t.board.insertCode}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onImage}>
                <ImagePlus />
                {t.board.insertImage}
                <span className="ms-auto font-mono text-xs text-muted-foreground">I</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          role="toolbar"
          aria-label={t.board.history}
          aria-orientation="vertical"
          className="pointer-events-auto flex flex-col gap-0.5 rounded-xl border bg-card p-1 shadow-sm"
        >
          <ToolButton label={t.board.undo} hint={`${mod}Z`} disabled={!canUndo} onClick={onUndo}>
            <Undo2 />
          </ToolButton>
          <ToolButton label={t.board.redo} hint={`${mod}⇧Z`} disabled={!canRedo} onClick={onRedo}>
            <Redo2 />
          </ToolButton>
        </div>
      </div>

      {(tool === "note" || tool === "shape" || drawing) && (
        <div
          role="toolbar"
          aria-label={t.board.tools}
          aria-orientation="vertical"
          className="pointer-events-auto flex flex-col items-center gap-0.5 rounded-xl border bg-card p-1 shadow-sm"
        >
          {drawing && (
            <>
              <ToolButton label={t.board.pen} hint="P" active={tool === "pen"} onClick={() => onTool("pen")}>
                <PenLine />
              </ToolButton>
              <ToolButton label={t.board.highlighter} hint="" active={tool === "highlighter"} onClick={() => onTool("highlighter")}>
                <Highlighter />
              </ToolButton>
              <ToolButton label={t.board.eraser} hint="E" active={tool === "eraser"} onClick={() => onTool("eraser")}>
                <Eraser />
              </ToolButton>
              {tool !== "eraser" && <Divider />}
            </>
          )}
          {tool === "shape" && (
            <>
              {SHAPES.map((s) => (
                <ToolButton
                  key={s}
                  label={t.board.shapeName[s] ?? s}
                  hint=""
                  active={style.shape === s}
                  onClick={() => onStyle({ ...style, shape: s })}
                >
                  <ShapeGlyph shape={s} />
                </ToolButton>
              ))}
              <Divider />
            </>
          )}
          {tool === "note" && <Swatches colors={NOTE_COLORS} value={style.note} onPick={(note) => onStyle({ ...style, note })} />}
          {tool === "shape" && (
            <Swatches
              colors={["blue", "green", "yellow", "pink", "purple", "ink"]}
              value={style.shapeColor}
              onPick={(shapeColor) => onStyle({ ...style, shapeColor })}
            />
          )}
          {tool === "pen" && <Swatches colors={INK_COLORS} value={style.ink} onPick={(ink) => onStyle({ ...style, ink })} />}
          {tool === "highlighter" && (
            <Swatches colors={HIGHLIGHT_COLORS} value={style.highlight} onPick={(highlight) => onStyle({ ...style, highlight })} />
          )}
        </div>
      )}
    </div>
  );
});

function Divider() {
  return <span aria-hidden="true" className="mx-auto my-0.5 h-px w-5 bg-border" />;
}

// Round swatches, the chosen one ringed; the name is read out and shown on hover.
function Swatches({ colors, value, onPick }: { colors: ColorName[]; value: ColorName; onPick: (c: ColorName) => void }) {
  return (
    <>
      {colors.map((c) => (
        <Tooltip key={c}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t.board.color[c] ?? c}
              aria-pressed={value === c}
              onClick={() => onPick(c)}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              <span
                className={cn(
                  "size-4.5 rounded-full ring-offset-2 ring-offset-card",
                  PALETTE[c].swatch,
                  value === c ? "ring-2 ring-foreground/70" : "ring-1 ring-foreground/15",
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t.board.color[c] ?? c}</TooltipContent>
        </Tooltip>
      ))}
    </>
  );
}

export function ShapeGlyph({ shape, className }: { shape: ShapeKind; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4", className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {shape === "rect" && <rect x="2" y="3.5" width="12" height="9" rx="1.5" />}
      {shape === "ellipse" && <ellipse cx="8" cy="8" rx="6" ry="4.5" />}
      {shape === "diamond" && <path d="M8 2 14 8 8 14 2 8Z" strokeLinejoin="round" />}
      {shape === "triangle" && <path d="M8 2.5 14 13H2Z" strokeLinejoin="round" />}
    </svg>
  );
}

function ToolButton({
  label,
  hint,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          aria-keyshortcuts={hint || undefined}
          disabled={disabled}
          onClick={onClick}
          className={cn("size-8 rounded-lg text-muted-foreground hover:text-foreground", active && "bg-accent text-foreground")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-2">
        {label}
        {hint && <span className="text-[11px] opacity-60">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
