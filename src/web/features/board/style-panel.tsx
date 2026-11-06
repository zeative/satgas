import { ArrowUpRight, Minus, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { type Card, COLORS, DASHES, FILLS, STROKES } from "../../../shared/board";
import { type CardStyle, wears } from "./edit";
import { PALETTE } from "./palette";

const OPACITIES = [0.25, 0.5, 0.75, 1] as const;
const ts = t.board.style;

// Excalidraw's properties panel, folded into the selection toolbar: only the sections the picked cards can wear.
export function StylePanel({ cards, onStyle }: { cards: Card[]; onStyle: (style: CardStyle) => void }) {
  const open = cards.filter((c) => !c.locked);
  const can = open.map(wears);
  const any = (k: keyof ReturnType<typeof wears>) => can.some((c) => c[k]);
  if (!any("color") && !any("opacity")) return null;
  // What the panel shows as chosen: the first card that wears the property, as Excalidraw does.
  const first = <K extends keyof Card>(k: K, w: keyof ReturnType<typeof wears>) => open.find((_, i) => can[i]?.[w])?.[k];
  const color = first("color", "color");
  const fill = first("fill", "fill") ?? "soft";
  const stroke = first("stroke", "stroke");
  const dash = first("dash", "dash") ?? "solid";
  const opacity = first("opacity", "opacity") ?? 1;
  const line = first("line", "arrow");
  const rough = first("rough", "rough") ?? 0;

  return (
    <Popover modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={ts.label}
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground [&_svg]:size-4"
            >
              <Palette />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{ts.label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={12}
        className="nodrag max-h-[calc(100svh-24px)] w-60 overflow-y-auto p-3"
        data-board-chrome
      >
        <div className="flex flex-col gap-3">
          {any("color") && (
            <Section label={ts.color}>
              <div className="grid grid-cols-8 gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={t.board.color[c] ?? c}
                    aria-pressed={color === c}
                    title={t.board.color[c] ?? c}
                    onClick={() => onStyle({ color: c })}
                    className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        "size-4 rounded-full ring-offset-2 ring-offset-popover",
                        PALETTE[c].swatch,
                        color === c ? "ring-2 ring-foreground/70" : "ring-1 ring-foreground/15",
                      )}
                    />
                  </button>
                ))}
              </div>
            </Section>
          )}
          {any("fill") && (
            <Section label={ts.fill}>
              <Choices
                value={fill}
                options={FILLS.map((f) => ({ value: f, label: ts.fills[f], glyph: <FillGlyph fill={f} /> }))}
                onPick={(f) => onStyle({ fill: f })}
              />
            </Section>
          )}
          {any("stroke") && (
            <Section label={ts.stroke}>
              <Choices
                value={STROKES.find((s) => s === stroke) ?? (stroke === undefined ? undefined : -1)}
                options={STROKES.map((s) => ({
                  value: s,
                  label: ts.strokes[s] ?? String(s),
                  glyph: <span aria-hidden="true" className="w-4 rounded-full bg-current" style={{ height: s }} />,
                }))}
                onPick={(s) => onStyle({ stroke: s })}
              />
            </Section>
          )}
          {any("dash") && (
            <Section label={ts.dash}>
              <Choices
                value={dash}
                options={DASHES.map((d) => ({ value: d, label: ts.dashes[d], glyph: <DashGlyph dash={d} /> }))}
                onPick={(d) => onStyle({ dash: d })}
              />
            </Section>
          )}
          {any("arrow") && (
            <Section label={ts.arrow}>
              <Choices
                value={line}
                options={[
                  { value: "line" as const, label: t.board.lineTool, glyph: <Minus className="size-4 -rotate-45" /> },
                  { value: "arrow" as const, label: t.board.arrowTool, glyph: <ArrowUpRight className="size-4" /> },
                ]}
                onPick={(l) => onStyle({ line: l })}
              />
            </Section>
          )}
          {any("rough") && (
            <Section label={ts.rough}>
              <Choices
                value={rough}
                options={[0, 1, 2].map((r) => ({ value: r, label: ts.roughs[r] ?? String(r), glyph: <RoughGlyph level={r} /> }))}
                onPick={(r) => onStyle({ rough: r })}
              />
            </Section>
          )}
          {any("opacity") && (
            <Section label={ts.opacity}>
              <Choices
                value={OPACITIES.find((o) => o === opacity)}
                options={OPACITIES.map((o) => ({
                  value: o,
                  label: `${o * 100}%`,
                  glyph: <span className="font-mono text-[11px] tabular-nums">{o * 100}</span>,
                }))}
                onPick={(o) => onStyle({ opacity: o })}
              />
            </Section>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Choices<V extends string | number>({
  value,
  options,
  onPick,
}: {
  value: V | undefined;
  options: { value: V; label: string; glyph: React.ReactNode }[];
  onPick: (v: V) => void;
}) {
  return (
    <div role="radiogroup" className="flex gap-1 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        // biome-ignore lint/a11y/useSemanticElements: a row of picks drawn as buttons, read as radios.
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => onPick(o.value)}
          className={cn(
            "flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === o.value && "bg-popover text-foreground shadow-xs",
          )}
        >
          {o.glyph}
        </button>
      ))}
    </div>
  );
}

function FillGlyph({ fill }: { fill: (typeof FILLS)[number] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-4 rounded-[4px] border-[1.5px] border-current",
        fill === "soft" && "bg-current/25",
        fill === "solid" && "bg-current",
      )}
    />
  );
}

function RoughGlyph({ level }: { level: number }) {
  const d =
    level === 0 ? "M2 6H18" : level === 1 ? "M2 6.5C6 4.5 9 7.5 12 5.5S16 6.5 18 5.5" : "M2 7C4 3 6 9 8.5 4.5S12 9 14 4.5 17 8 18 5";
  return (
    <svg
      viewBox="0 0 20 12"
      className="h-3 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function DashGlyph({ dash }: { dash: (typeof DASHES)[number] }) {
  return (
    <svg viewBox="0 0 20 4" className="h-1 w-5" aria-hidden="true">
      <line
        x1="1"
        y1="2"
        x2="19"
        y2="2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dash === "dashed" ? "5 3" : dash === "dotted" ? "0 4" : undefined}
      />
    </svg>
  );
}
