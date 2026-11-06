import { ExternalLink, GitPullRequest, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OutboundLink } from "@/components/outbound-link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { linkPull, unlinkPull, watchPull } from "@/stores/runs";
import type { PullLink, Run } from "../../../shared/types";

const MAX_FIXES = 3;

// The pull requests on a board, each with its state at a glance and a switch for the watch that fixes what breaks.
export function PullsButton({ run, open, onOpenChange }: { run: Run; open: boolean; onOpenChange: (open: boolean) => void }) {
  const pulls = run.pulls ?? [];
  const failing = pulls.some((p) => p.checks === "failing" || p.conflict);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t.pulls.open(pulls.length)}
          tabIndex={pulls.length ? undefined : -1}
          aria-hidden={pulls.length ? undefined : true}
          title={t.pulls.title}
          className={cn(
            "h-7 shrink-0 gap-1 rounded-lg px-1.5 text-xs text-muted-foreground tabular-nums hover:text-foreground",
            // Without pull requests it only anchors the popover the board menu opens, so it keeps its place unseen.
            !pulls.length && "pointer-events-none w-0 overflow-hidden px-0 opacity-0",
          )}
        >
          <GitPullRequest className={cn(failing && "text-destructive")} />
          {pulls.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <PullsPanel run={run} />
      </PopoverContent>
    </Popover>
  );
}

export function PullsPanel({ run }: { run: Run }) {
  const pulls = run.pulls ?? [];
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await linkPull(run.id, url.trim());
      setUrl("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5 border-b px-3.5 py-3">
        <h3 className="text-xs font-medium">{t.pulls.title}</h3>
        <p className="text-xs text-muted-foreground">{t.pulls.watchHint}</p>
      </div>
      {pulls.length ? (
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {pulls.map((p) => (
            <PullRow key={`${p.repo}#${p.number}`} runId={run.id} pull={p} />
          ))}
        </ul>
      ) : (
        <p className="px-3.5 py-4 text-xs text-muted-foreground">{t.pulls.empty}</p>
      )}
      <form
        className="flex items-center gap-2 border-t p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t.pulls.placeholder}
          aria-label={t.pulls.link}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !url.trim()} className="h-8">
          {t.pulls.add}
        </Button>
      </form>
    </div>
  );
}

function PullRow({ runId, pull }: { runId: string; pull: PullLink }) {
  const state = pull.state ?? "open";
  const facts = [
    state !== "open" ? t.pulls.state[state] : pull.checks ? t.pulls.checks[pull.checks] : undefined,
    pull.conflict ? t.pulls.conflict : undefined,
    pull.review === "approved" ? t.pulls.approved : pull.review === "changes" ? t.pulls.changes : undefined,
    pull.fixes ? t.pulls.fixes(pull.fixes, MAX_FIXES) : undefined,
  ].filter(Boolean);
  const bad = pull.checks === "failing" || pull.conflict || pull.review === "changes";
  const fail = (e: Error) => toast.error(e.message);
  return (
    <li className="group/pull flex items-start gap-3 border-b px-3.5 py-2.5 last:border-b-0">
      <GitPullRequest className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", bad && "text-destructive")} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <OutboundLink
          href={pull.url}
          className="flex min-w-0 items-center gap-1 rounded text-xs hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">{pull.title ?? `${pull.repo}#${pull.number}`}</span>
          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </OutboundLink>
        <p className="truncate text-xs text-muted-foreground">
          <span className="tabular-nums">
            {pull.repo}#{pull.number}
          </span>
          {facts.length > 0 && ` · ${facts.join(" · ")}`}
        </p>
        {pull.error && <p className="text-xs text-destructive">{pull.error}</p>}
      </div>
      {state === "open" && (
        <Switch
          checked={pull.watch}
          onCheckedChange={(watch) => void watchPull(runId, pull.repo, pull.number, watch).catch(fail)}
          aria-label={`${t.pulls.watch}: ${pull.repo}#${pull.number}`}
          title={t.pulls.watch}
          className="mt-0.5"
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t.pulls.unlink}
        title={t.pulls.unlink}
        onClick={() => void unlinkPull(runId, pull.repo, pull.number).catch(fail)}
        className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/pull:opacity-100 hover:text-foreground focus-visible:opacity-100 [&_svg]:size-3.5 [@media(hover:none)]:opacity-100"
      >
        <X />
      </Button>
    </li>
  );
}
