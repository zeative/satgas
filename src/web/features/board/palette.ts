import type { ColorName } from "../../../shared/board";

// One named palette for notes, shapes and ink, each drawn for both themes; the board's chrome stays neutral around it.
export const PALETTE: Record<ColorName, { swatch: string; note: string; shape: string; ink: string }> = {
  yellow: {
    swatch: "bg-amber-300",
    note: "bg-amber-100 text-amber-950 dark:bg-amber-300/25 dark:text-amber-50",
    shape: "fill-amber-100 stroke-amber-400 dark:fill-amber-300/20 dark:stroke-amber-300/70",
    ink: "text-amber-400",
  },
  orange: {
    swatch: "bg-orange-400",
    note: "bg-orange-100 text-orange-950 dark:bg-orange-400/25 dark:text-orange-50",
    shape: "fill-orange-100 stroke-orange-400 dark:fill-orange-400/20 dark:stroke-orange-400/70",
    ink: "text-orange-500",
  },
  pink: {
    swatch: "bg-rose-400",
    note: "bg-rose-100 text-rose-950 dark:bg-rose-400/25 dark:text-rose-50",
    shape: "fill-rose-100 stroke-rose-400 dark:fill-rose-400/20 dark:stroke-rose-400/70",
    ink: "text-rose-500",
  },
  purple: {
    swatch: "bg-violet-400",
    note: "bg-violet-100 text-violet-950 dark:bg-violet-400/25 dark:text-violet-50",
    shape: "fill-violet-100 stroke-violet-400 dark:fill-violet-400/20 dark:stroke-violet-400/70",
    ink: "text-violet-500",
  },
  blue: {
    swatch: "bg-sky-400",
    note: "bg-sky-100 text-sky-950 dark:bg-sky-400/25 dark:text-sky-50",
    shape: "fill-sky-100 stroke-sky-400 dark:fill-sky-400/20 dark:stroke-sky-400/70",
    ink: "text-sky-500",
  },
  green: {
    swatch: "bg-emerald-400",
    note: "bg-emerald-100 text-emerald-950 dark:bg-emerald-400/25 dark:text-emerald-50",
    shape: "fill-emerald-100 stroke-emerald-400 dark:fill-emerald-400/20 dark:stroke-emerald-400/70",
    ink: "text-emerald-500",
  },
  gray: {
    swatch: "bg-zinc-400",
    note: "bg-zinc-100 text-zinc-900 dark:bg-zinc-500/25 dark:text-zinc-50",
    shape: "fill-zinc-100 stroke-zinc-400 dark:fill-zinc-500/20 dark:stroke-zinc-400/70",
    ink: "text-zinc-400",
  },
  ink: {
    swatch: "bg-foreground",
    note: "bg-card text-card-foreground border",
    shape: "fill-transparent stroke-foreground",
    ink: "text-foreground",
  },
};

export const NOTE_COLORS: ColorName[] = ["yellow", "orange", "pink", "purple", "blue", "green", "gray"];
export const INK_COLORS: ColorName[] = ["ink", "blue", "pink", "green", "orange"];
export const HIGHLIGHT_COLORS: ColorName[] = ["yellow", "green", "pink", "blue"];
