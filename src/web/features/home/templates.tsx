import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { TemplateArt } from "./template-art";

const TONE = {
  lilac: "bg-violet-200/80 hover:bg-violet-200 dark:bg-violet-400/16 dark:hover:bg-violet-400/22",
  pink: "bg-fuchsia-200/70 hover:bg-fuchsia-200 dark:bg-fuchsia-400/14 dark:hover:bg-fuchsia-400/20",
  sky: "bg-cyan-200/70 hover:bg-cyan-200 dark:bg-cyan-400/14 dark:hover:bg-cyan-400/20",
  lime: "bg-lime-200/80 hover:bg-lime-200 dark:bg-lime-400/12 dark:hover:bg-lime-400/18",
  amber: "bg-amber-200/70 hover:bg-amber-200 dark:bg-amber-400/13 dark:hover:bg-amber-400/19",
};

const KINDS: { kind: keyof typeof t.templates.items; tone: keyof typeof TONE }[] = [
  { kind: "website", tone: "lilac" },
  { kind: "store", tone: "pink" },
  { kind: "booking", tone: "amber" },
  { kind: "dashboard", tone: "sky" },
  { kind: "saas", tone: "sky" },
  { kind: "portfolio", tone: "lime" },
  { kind: "mobile", tone: "lilac" },
  { kind: "game", tone: "pink" },
];

// A finished brief for the composer: nothing runs until the person sends it, changed or as it is.
export function Templates({ onPick }: { onPick: (prompt: string) => void }) {
  const rail = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({ back: false, more: false });

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

  const page = (direction: 1 | -1) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth });

  return (
    <section aria-labelledby="templates" className="flex flex-col gap-3">
      <div className="flex h-7 items-center justify-between">
        <h2 id="templates" className="text-sm font-medium text-muted-foreground">
          {t.templates.title}
        </h2>
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
          className="no-scrollbar -m-1 grid snap-x snap-mandatory scroll-px-1 auto-cols-[75%] grid-flow-col grid-rows-2 gap-3 overflow-x-auto scroll-smooth p-1 @[26rem]:auto-cols-[calc((100%-0.75rem)/2)] @[40rem]:auto-cols-[calc((100%-1.5rem)/3)] @[55rem]:auto-cols-[calc((100%-2.25rem)/4)] motion-reduce:scroll-auto"
        >
          {KINDS.map(({ kind, tone }) => {
            const item = t.templates.items[kind];
            return (
              <li key={kind} className="snap-start">
                <button
                  type="button"
                  onClick={() => onPick(item.prompt)}
                  className={cn(
                    "group relative flex h-20 w-full items-center overflow-hidden rounded-xl ps-3.5 pe-28 text-start transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    TONE[tone],
                  )}
                >
                  <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
                  <TemplateArt
                    kind={kind}
                    className="absolute right-0 bottom-0 h-20 w-28 drop-shadow-[0_2px_4px_rgb(0_0_0/0.14)] transition-transform duration-200 ease-out group-hover:-translate-y-1 motion-reduce:transition-none"
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
