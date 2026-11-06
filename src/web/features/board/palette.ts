import type { ColorName } from "../../../shared/board";

// One named palette for notes, shapes and ink, each drawn for both themes; the board's chrome stays neutral around it.
// Dark tints are mixed onto the canvas colour rather than see-through, so a thread behind a note never shows, in an
// exported picture as much as on screen.
// `solidText` is the label color on a shape filled solid with the ink color, chosen so it keeps its contrast.
export const PALETTE: Record<ColorName, { swatch: string; note: string; shape: string; ink: string; solidText: string }> = {
  yellow: {
    swatch: "bg-amber-300",
    note: "bg-amber-100 text-amber-950 dark:bg-[color-mix(in_oklab,var(--color-amber-300)_25%,var(--background))] dark:text-amber-50",
    shape:
      "fill-amber-100 stroke-amber-400 dark:fill-[color-mix(in_oklab,var(--color-amber-300)_20%,var(--background))] dark:stroke-amber-300/70",
    ink: "text-amber-400",
    solidText: "text-neutral-950",
  },
  orange: {
    swatch: "bg-orange-400",
    note: "bg-orange-100 text-orange-950 dark:bg-[color-mix(in_oklab,var(--color-orange-400)_25%,var(--background))] dark:text-orange-50",
    shape:
      "fill-orange-100 stroke-orange-400 dark:fill-[color-mix(in_oklab,var(--color-orange-400)_20%,var(--background))] dark:stroke-orange-400/70",
    ink: "text-orange-500",
    solidText: "text-neutral-950",
  },
  pink: {
    swatch: "bg-rose-400",
    note: "bg-rose-100 text-rose-950 dark:bg-[color-mix(in_oklab,var(--color-rose-400)_25%,var(--background))] dark:text-rose-50",
    shape:
      "fill-rose-100 stroke-rose-400 dark:fill-[color-mix(in_oklab,var(--color-rose-400)_20%,var(--background))] dark:stroke-rose-400/70",
    ink: "text-rose-500",
    solidText: "text-white",
  },
  purple: {
    swatch: "bg-violet-400",
    note: "bg-violet-100 text-violet-950 dark:bg-[color-mix(in_oklab,var(--color-violet-400)_25%,var(--background))] dark:text-violet-50",
    shape:
      "fill-violet-100 stroke-violet-400 dark:fill-[color-mix(in_oklab,var(--color-violet-400)_20%,var(--background))] dark:stroke-violet-400/70",
    ink: "text-violet-500",
    solidText: "text-white",
  },
  blue: {
    swatch: "bg-sky-400",
    note: "bg-sky-100 text-sky-950 dark:bg-[color-mix(in_oklab,var(--color-sky-400)_25%,var(--background))] dark:text-sky-50",
    shape: "fill-sky-100 stroke-sky-400 dark:fill-[color-mix(in_oklab,var(--color-sky-400)_20%,var(--background))] dark:stroke-sky-400/70",
    ink: "text-sky-500",
    solidText: "text-neutral-950",
  },
  green: {
    swatch: "bg-emerald-400",
    note: "bg-emerald-100 text-emerald-950 dark:bg-[color-mix(in_oklab,var(--color-emerald-400)_25%,var(--background))] dark:text-emerald-50",
    shape:
      "fill-emerald-100 stroke-emerald-400 dark:fill-[color-mix(in_oklab,var(--color-emerald-400)_20%,var(--background))] dark:stroke-emerald-400/70",
    ink: "text-emerald-500",
    solidText: "text-neutral-950",
  },
  gray: {
    swatch: "bg-zinc-400",
    note: "bg-zinc-100 text-zinc-900 dark:bg-[color-mix(in_oklab,var(--color-zinc-500)_25%,var(--background))] dark:text-zinc-50",
    shape:
      "fill-zinc-100 stroke-zinc-400 dark:fill-[color-mix(in_oklab,var(--color-zinc-500)_20%,var(--background))] dark:stroke-zinc-400/70",
    ink: "text-zinc-400",
    solidText: "text-neutral-950",
  },
  ink: {
    swatch: "bg-foreground",
    note: "bg-card text-card-foreground border",
    shape: "fill-transparent stroke-foreground",
    ink: "text-foreground",
    solidText: "text-background",
  },
};

export const NOTE_COLORS: ColorName[] = ["yellow", "orange", "pink", "purple", "blue", "green", "gray"];
export const INK_COLORS: ColorName[] = ["ink", "blue", "pink", "green", "orange"];
export const HIGHLIGHT_COLORS: ColorName[] = ["yellow", "green", "pink", "blue"];
