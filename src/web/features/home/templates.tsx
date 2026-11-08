import { ChartColumn, Gamepad2, Globe, Image, type LucideIcon, Presentation, TableProperties } from "lucide-react";
import { t } from "@/i18n";

const ICONS: Record<keyof typeof t.templates.items, LucideIcon> = {
  website: Globe,
  dashboard: ChartColumn,
  game: Gamepad2,
  poster: Image,
  deck: Presentation,
  research: TableProperties,
};
const KINDS = Object.keys(ICONS) as (keyof typeof ICONS)[];

// A starting brief for the composer: nothing runs until the person fills it in and sends it.
export function Templates({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <section aria-labelledby="templates" className="flex flex-col gap-4">
      <h2 id="templates" className="text-sm font-medium text-muted-foreground">
        {t.templates.title}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.map((kind) => {
          const Icon = ICONS[kind];
          const item = t.templates.items[kind];
          return (
            <li key={kind}>
              <button
                type="button"
                onClick={() => onPick(item.prompt)}
                className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-start transition-colors hover:border-foreground/20 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.line}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
