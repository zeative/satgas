import { GitBranch, GitCommitHorizontal, GitMerge, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useNow } from "@/hooks/use-now";
import { fmtAgo, t } from "@/i18n";
import { isLiveRun } from "@/lib/actions";
import { branchAction, loadGit } from "@/stores/runs";
import type { GitInfo, Run } from "../../../shared/types";
import { RowAction } from "./changes-tab";
import { RowIcon, TreeLoading, TreeNote, TreeRow, TreeSection, useTreeKeys } from "./tree-row";

const tw = t.workspace;

// Where the board's folder stands in git, the branches its tasks left, and its latest commits. Pull requests and forks
// live in the board's own menu.
export function GitTab({ run }: { run: Run }) {
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(true, 30_000);
  const live = isLiveRun(run);
  const reload = useCallback(() => {
    loadGit(run.id)
      .then((i) => {
        setInfo(i);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [run.id]);
  // A round ending is when commits and branches change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the status is the signal to look again.
  useEffect(reload, [reload, run.status]);

  const act = async (action: "merge" | "drop" | "handoff", branch: string) => {
    try {
      const r = (await branchAction(run.id, action, branch)) as { conflicts?: string[] } | undefined;
      if (action === "handoff") toast.success(tw.handedOff);
      reload();
      return r;
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg);
      reload();
    }
  };

  const keys = useTreeKeys();
  const status = info
    ? [
        info.upstream,
        info.ahead ? tw.ahead(info.ahead) : undefined,
        info.behind ? tw.behind(info.behind) : undefined,
        info.dirty ? tw.dirty(info.dirty) : tw.clean,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  if (error && !info) return <TreeNote tone="text-destructive">{error}</TreeNote>;
  if (!info) return <TreeLoading />;
  if (!info.repo)
    return (
      <div className="flex flex-col gap-0.5 px-4 py-6 text-center">
        <p className="text-xs font-medium">{tw.notRepo}</p>
        <p className="text-xs text-muted-foreground">{tw.notRepoHint}</p>
      </div>
    );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the rows inside; this only catches them as they bubble.
    <div ref={keys.ref} onKeyDown={keys.onKeyDown} className="group/tree flex flex-col py-1">
      <TreeSection title={tw.branch}>
        <ul className="flex flex-col">
          <TreeRow
            depth={1}
            inset={false}
            icon={
              <RowIcon>
                <GitBranch />
              </RowIcon>
            }
            label={info.branch ?? tw.detached}
            trail={status}
            title={status}
          />
        </ul>
      </TreeSection>
      {!!info.branches?.length && (
        <TreeSection title={tw.taskBranches} count={info.branches.length}>
          <ul className="flex flex-col">
            {info.branches.map((b) => (
              <TreeRow
                key={b.name}
                depth={1}
                inset={false}
                icon={<RowIcon>{b.merged ? <GitMerge /> : <GitBranch />}</RowIcon>}
                label={b.name}
                title={b.name}
                end={b.merged ? <span className="text-[11px] text-muted-foreground">{tw.merged}</span> : undefined}
                actions={
                  <>
                    {!b.merged && (
                      <>
                        <RowAction
                          label={live ? tw.waitLive : tw.merge}
                          disabled={live}
                          onClick={() =>
                            void act("merge", b.name).then((r) => {
                              if (r?.conflicts?.length) toast.error(tw.mergeConflict(r.conflicts.slice(0, 4).join(", ")));
                            })
                          }
                        >
                          <GitMerge />
                        </RowAction>
                        <RowAction label={tw.handoff} onClick={() => void act("handoff", b.name)}>
                          <Users />
                        </RowAction>
                      </>
                    )}
                    <RowAction label={tw.drop} onClick={() => void act("drop", b.name)}>
                      <Trash2 />
                    </RowAction>
                  </>
                }
              />
            ))}
          </ul>
        </TreeSection>
      )}
      <TreeSection title={tw.commits}>
        {info.commits?.length ? (
          <ul className="flex flex-col">
            {info.commits.map((c) => (
              <TreeRow
                key={c.sha}
                depth={1}
                inset={false}
                icon={
                  <RowIcon>
                    <GitCommitHorizontal />
                  </RowIcon>
                }
                label={c.subject}
                title={`${c.sha.slice(0, 7)} · ${c.subject} · ${c.author}`}
                end={<span className="text-[11px] text-muted-foreground tabular-nums">{fmtAgo(c.at, now)}</span>}
              />
            ))}
          </ul>
        ) : (
          <p className="ps-7 text-xs leading-[22px] text-muted-foreground">{tw.noCommits}</p>
        )}
      </TreeSection>
    </div>
  );
}
