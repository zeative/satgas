import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { ClaudeMark, CodexMark, GitHubMark } from "@/components/brand-marks";
import { PageHeader } from "@/components/layout/page-header";
import { LogoMark } from "@/components/logo";
import { RichText } from "@/components/rich-text";
import { StatusIcon, statusLabel } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Composer } from "@/features/missions/composer";
import { useNow } from "@/hooks/use-now";
import { fmtAgo, fmtCompact, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { loadRuns, useRuns } from "@/stores/runs";
import type { AgentKind, RunSummary } from "../../../shared/types";
import { BoardThumb } from "./board-thumb";

const RECENT = 6;
const SKELETONS = ["a", "b", "c"];

export function HomePage() {
  const [mission, setMission] = useState("");

  return (
    <main id="content" className="relative flex-1 overflow-x-clip">
      {/* The same line grid the boards are drawn on, fading out under the prompt. */}
      <div aria-hidden="true" className="satgas-hero-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem]" />
      <PageHeader actions={<HomeActions />} />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 pt-[22vh] pb-20">
        <section aria-labelledby="start-new" className="mx-auto flex w-full max-w-[44rem] flex-col items-center gap-10 text-center">
          <div className="flex flex-col gap-3">
            <h1
              id="start-new"
              className="flex items-center justify-center gap-3 brand-title text-[1.75rem] leading-tight text-balance md:text-[2rem]"
            >
              <LogoMark className="size-7 md:size-8" />
              {t.composeTitle}
            </h1>
          </div>
          <Composer value={mission} onChange={setMission} className="w-full text-start" />
        </section>

        <RecentBoards />
      </div>
    </main>
  );
}

const AGENT_MARKS: { kind: AgentKind; Mark: (p: { className?: string }) => React.ReactNode }[] = [
  { kind: "claude", Mark: ClaudeMark },
  { kind: "codex", Mark: CodexMark },
];

interface Repo {
  url: string;
  stars: number | null;
}
// Fetched once per page load: the star count barely moves, and Home mounts on every visit.
let repoCache: Repo | null | undefined;

// Whether this machine can run missions at all: which agent CLIs the server found, and where the source lives.
function HomeActions() {
  const agents = useRuns((s) => s.config.agents);
  const [repo, setRepo] = useState<Repo | null>(repoCache ?? null);

  useEffect(() => {
    if (repoCache !== undefined) return;
    const ctrl = new AbortController();
    fetch("/api/repo", { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Repo>) : null))
      .then((r) => {
        repoCache = r;
        setRepo(r);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  const ready = agents ? AGENT_MARKS.filter(({ kind }) => agents[kind]) : [];
  const summary = !agents
    ? null
    : ready.length === AGENT_MARKS.length
      ? t.agentsReady
      : ready[0]
        ? t.agentReady(t.agent[ready[0].kind])
        : t.noAgents;

  return (
    <>
      {agents && (
        <div
          role="status"
          className={cn(
            "flex h-8 items-center gap-2 rounded-full border bg-card ps-1.5 pe-3 text-xs text-muted-foreground shadow-xs",
            !ready.length && "text-destructive",
          )}
        >
          <span className="flex -space-x-1">
            {AGENT_MARKS.map(({ kind, Mark }) => {
              const version = agents[kind];
              const label = version ? `${t.agent[kind]} ${version}` : `${t.agent[kind]} · ${t.notInstalled}`;
              return (
                <Tooltip key={kind}>
                  <TooltipTrigger asChild>
                    <span
                      role="img"
                      aria-label={label}
                      className={cn(
                        "flex size-5.5 items-center justify-center rounded-full border border-card bg-muted",
                        !version && "opacity-40 grayscale",
                      )}
                    >
                      <Mark className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </span>
          {summary}
        </div>
      )}
      {repo &&
        (repo.stars === null ? (
          <Button asChild variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground hover:text-foreground">
            <a href={repo.url} target="_blank" rel="noopener noreferrer" aria-label={t.sourceOnGitHub} title={t.sourceOnGitHub}>
              <GitHubMark />
            </a>
          </Button>
        ) : (
          <a
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t.sourceOnGitHub}
            aria-label={`${t.sourceOnGitHub}, ${t.stars(repo.stars)}`}
            className="flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs text-muted-foreground shadow-xs transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <GitHubMark className="size-3.5" />
            <Star className="size-3" aria-hidden="true" />
            <span className="tabular-nums">{fmtCompact(repo.stars)}</span>
          </a>
        ))}
    </>
  );
}

function RecentBoards() {
  const runs = useRuns((s) => s.runs);
  const error = useRuns((s) => s.runsError);
  const [all, setAll] = useState(false);
  // Relative times ("2 min ago") refresh twice a minute.
  const now = useNow(true, 30_000);
  const shown = runs ? (all ? runs : runs.slice(0, RECENT)) : null;

  return (
    <section aria-labelledby="recent-boards" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 id="recent-boards" className="text-sm font-medium text-muted-foreground">
          {t.recentBoards}
        </h2>
        {runs && runs.length > RECENT && (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {all ? t.showLess : t.showAll(runs.length)}
          </button>
        )}
      </div>

      {error && !runs ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <p>
            <RichText text={error} />
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadRuns()}>
            {t.retry}
          </Button>
        </div>
      ) : shown && !shown.length ? (
        <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t.missionsEmpty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown
            ? shown.map((r) => <BoardCard key={r.id} run={r} now={now} />)
            : SKELETONS.map((k) => (
                <li key={k} className="flex flex-col gap-3">
                  <Skeleton className="aspect-[16/10] w-full rounded-xl" />
                  <div className="flex flex-col gap-1.5 px-0.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
        </ul>
      )}
    </section>
  );
}

// A framed miniature of the board, cropped at the bottom edge like a sheet on a desk, then its title and when it ran.
function BoardCard({ run, now }: { run: RunSummary; now: number }) {
  return (
    <li>
      <Link
        to="/boards/$boardId"
        params={{ boardId: run.id }}
        title={run.prompt}
        className="group flex flex-col gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted/70 transition-colors group-hover:bg-muted">
          <div className="satgas-grid absolute inset-x-5 top-5 -bottom-px rounded-t-md border border-b-0 bg-card shadow-xs transition-transform duration-200 ease-out group-hover:-translate-y-1 motion-reduce:transition-none">
            <BoardThumb preview={run.preview} className="absolute inset-0 p-3" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-0.5">
          <span className="truncate text-sm font-medium">
            {run.icon && <span className="me-1.5">{run.icon}</span>}
            {run.title ?? run.prompt}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusIcon status={run.status} className="size-3.5" />
            <span>{statusLabel(run.status)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{fmtAgo(run.createdAt, now)}</span>
          </span>
        </div>
      </Link>
    </li>
  );
}
