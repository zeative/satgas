import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { TemplateArt } from "./template-art";

// One quiet surface for every template; the art carries the colour, as on the board.
const TILE = "border border-transparent bg-muted/50 hover:border-border hover:bg-muted/80 dark:bg-muted/60 dark:hover:bg-muted";

type Kind = keyof typeof t.templates.items;
type Group = keyof typeof t.templates.groups;

// What each card makes, grouped the way people ask for it: a site, an app, or the things that market them.
const GROUPS: Record<Exclude<Group, "all">, Kind[]> = {
  websites: ["website", "store", "portfolio"],
  apps: ["booking", "dashboard", "saas", "mobile", "game"],
  marketing: ["social", "email", "deck"],
};
const ORDER: Kind[] = ["website", "store", "booking", "dashboard", "social", "saas", "portfolio", "email", "mobile", "deck", "game"];

// A finished brief for the composer: nothing runs until the person sends it, changed or as it is.
export function Templates({ onPick }: { onPick: (prompt: string) => void }) {
  const rail = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({ back: false, more: false });
  const [group, setGroup] = useState<Group>("all");
  const kinds = group === "all" ? ORDER : GROUPS[group];

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const measure = () => {
      const back = el.scrollLeft > 1;
      const more = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEnds((e) => (e.back === back && e.more === more ? e : { back, more }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      resize.disconnect();
    };
  }, []);

  // A new group starts at its first card, and the arrows follow what it holds.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the group changes
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    el.scrollTo({ left: 0 });
    el.dispatchEvent(new Event("scroll"));
  }, [group]);

  const page = (direction: 1 | -1) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth });

  return (
    <section aria-labelledby="templates" className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h2 id="templates" className="shrink-0 text-sm font-medium text-muted-foreground">
            {t.templates.title}
          </h2>
          <fieldset
            aria-label={t.templates.filter}
            className="no-scrollbar m-0 flex min-w-0 items-center gap-0.5 overflow-x-auto border-0 p-0"
          >
            {(Object.keys(t.templates.groups) as Group[]).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className="h-6 shrink-0 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
              >
                {t.templates.groups[g]}
              </button>
            ))}
          </fieldset>
        </div>
        {/* In the heading row rather than over the cards, so they never cover a card's art. */}
        {(ends.back || ends.more) && (
          <div className="flex items-center gap-1">
            <Arrow label={t.templates.previous} side="start" disabled={!ends.back} onClick={() => page(-1)} />
            <Arrow label={t.templates.next} side="end" disabled={!ends.more} onClick={() => page(1)} />
          </div>
        )}
      </div>
      {/* Columns follow the room left beside the sidebar, not the width of the window. */}
      <div className="@container">
        <ul
          ref={rail}
          className={`no-scrollbar -m-1 grid snap-x snap-mandatory scroll-px-1 auto-cols-[75%] grid-flow-col gap-3 ${kinds.length > 4 ? "grid-rows-2" : "grid-rows-1"} overflow-x-auto scroll-smooth p-1 @[26rem]:auto-cols-[calc((100%-0.75rem)/2)] @[40rem]:auto-cols-[calc((100%-1.5rem)/3)] @[55rem]:auto-cols-[calc((100%-2.25rem)/4)] motion-reduce:scroll-auto`}
        >
          {kinds.map((kind) => {
            const item = t.templates.items[kind];
            return (
              <li key={kind} className="snap-start">
                <button
                  type="button"
                  onClick={() => onPick(item.prompt)}
                  className={cn(
                    "group relative flex h-[4.5rem] w-full items-center overflow-hidden rounded-xl ps-3.5 pe-28 text-start transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    TILE,
                  )}
                >
                  <span className="line-clamp-2 text-[13px] font-medium">{item.name}</span>
                  <TemplateArt
                    kind={kind}
                    className="absolute -right-1 -bottom-1 h-20 w-28 opacity-90 drop-shadow-[0_2px_4px_rgb(0_0_0/0.14)] transition-transform duration-200 ease-out group-hover:-translate-y-1 group-hover:opacity-100 motion-reduce:transition-none"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// Touch screens can also swipe the row, and a keyboard reaches every card by Tab.
function Arrow({ label, side, disabled, onClick }: { label: string; side: "start" | "end"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "start" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="size-7 text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </Button>
  );
}
