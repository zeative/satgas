import { Star } from "lucide-react";
import { GitHubMark } from "@/components/brand-marks";
import { OutboundLink } from "@/components/outbound-link";
import { useRepo } from "@/hooks/use-repo";
import { fmtCompact, t } from "@/i18n";

// One quiet row in the sidebar footer: a star on GitHub helps more people find Satgas, without a card on every page.
export function StarCard() {
  const repo = useRepo();
  if (!repo) return null;
  return (
    <OutboundLink
      href={repo.url}
      title={t.starCard.body}
      className="group/star flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-data-[collapsible=icon]:hidden"
    >
      <GitHubMark className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{t.starCard.action}</span>
      <Star className="size-3 shrink-0 fill-signal text-signal-ink" aria-hidden="true" />
      {repo.stars !== null && (
        <>
          <span className="tabular-nums" aria-hidden="true">
            {fmtCompact(repo.stars)}
          </span>
          <span className="sr-only">{t.stars(repo.stars)}</span>
        </>
      )}
    </OutboundLink>
  );
}
