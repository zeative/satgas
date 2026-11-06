import { Star } from "lucide-react";
import { lazy, Suspense } from "react";
import { GitHubMark } from "@/components/brand-marks";
import { OutboundLink } from "@/components/outbound-link";
import { useRepo } from "@/hooks/use-repo";
import { fmtCompact, t } from "@/i18n";

// The face drawer only ships with the board; the sidebar sits on every page, so it loads the faces on its own.
const StarCrew = lazy(() => import("./star-crew"));
const placeholder = [0, 1, 2].map((i) => <span key={i} className="size-6 rounded-full bg-muted ring-2 ring-card" />);

export function StarCard() {
  const repo = useRepo();
  if (!repo) return null;

  return (
    <div className="satgas-star-card flex flex-col gap-3 overflow-hidden rounded-xl border p-3 text-card-foreground shadow-xs group-data-[collapsible=icon]:hidden">
      {/* The logo's amber node, sat on a grid crossing like a card waiting on the canvas. */}
      <span
        aria-hidden="true"
        className="absolute top-8 right-8 size-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-signal ring-4 ring-signal/15"
      />
      <div className="flex flex-col gap-2">
        <span className="flex -space-x-1.5" aria-hidden="true">
          <Suspense fallback={placeholder}>
            <StarCrew />
          </Suspense>
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t.starCard.title}</span>
          <span className="text-xs leading-4 text-muted-foreground">{t.starCard.body}</span>
        </div>
      </div>
      <OutboundLink
        href={repo.url}
        className="group/star flex h-8 items-stretch overflow-hidden rounded-lg border bg-background text-xs font-medium shadow-xs transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 px-2.5 transition-colors group-hover/star:bg-muted/60">
          <GitHubMark className="size-3.5" />
          <span className="truncate">{t.starCard.action}</span>
        </span>
        <span className="flex items-center gap-1 border-s px-2.5 text-muted-foreground transition-colors group-hover/star:bg-muted/60 group-hover/star:text-foreground">
          <Star className="size-3.5 fill-signal text-signal-ink" aria-hidden="true" />
          {repo.stars !== null && (
            <>
              <span className="tabular-nums" aria-hidden="true">
                {fmtCompact(repo.stars)}
              </span>
              <span className="sr-only">{t.stars(repo.stars)}</span>
            </>
          )}
        </span>
      </OutboundLink>
    </div>
  );
}
