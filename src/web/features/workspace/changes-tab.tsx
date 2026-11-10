import { FileDiff, Undo2 } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { isLiveRun } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { openReview } from "@/stores/review";
import { crew, memberIdOf } from "../../../shared/team";
import type { NodeState, Run } from "../../../shared/types";
import { MiniFace } from "../team/face";
import { FileIcon } from "./file-icon";
import { baseName } from "./file-tree";
import { useRevert } from "./revert-dialog";
import { TreeRow, TreeSection, useTreeKeys } from "./tree-row";

const tw = t.workspace;

// The letter, colour and words for each kind of change; the colour only ever repeats the letter's meaning.
export const CHANGE_MARK = {
  added: { letter: "A", tone: "text-emerald-700 dark:text-emerald-400" },
  modified: { letter: "M", tone: "text-signal-ink" },
  deleted: { letter: "D", tone: "text-red-700 dark:text-red-400" },
} as const;

// Splits a path so the file name leads and its folder trails, quieter.
export function PathLabel({ path, className }: { path: string; className?: string }) {
  const cut = path.lastIndexOf("/");
  return (
    <span className={cn("flex min-w-0 items-baseline gap-1.5", className)} title={path}>
      <span className="shrink-0 truncate">{cut < 0 ? path : path.slice(cut + 1)}</span>
      {cut > 0 && <span className="truncate text-[11px] text-muted-foreground">{path.slice(0, cut)}</span>}
    </span>
  );
}

// What the team changed in the folder, newest round first, each task with its files and their diffs.
export function ChangesTab({ run }: { run: Run }) {
  const people = useMemo(() => new Map(crew(run).map((m) => [m.id, m])), [run]);
  const rounds = useMemo(() => {
    const by = new Map<number, NodeState[]>();
    for (const n of run.nodes) if (n.changes?.files.length) by.set(n.round ?? 0, [...(by.get(n.round ?? 0) ?? []), n]);
    return [...by.entries()].sort((a, b) => b[0] - a[0]);
  }, [run.nodes]);
  const prompts = [run.prompt, ...(run.rounds ?? [])];
  const keys = useTreeKeys();

  if (!rounds.length)
    return (
      <div className="flex flex-col gap-0.5 px-4 py-6 text-center">
        <p className="text-xs font-medium">{tw.noChanges}</p>
        <p className="text-xs text-muted-foreground">{tw.noChangesHint}</p>
      </div>
    );
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys belong to the rows inside; this only catches them as they bubble.
    <div ref={keys.ref} onKeyDown={keys.onKeyDown} className="flex flex-col pb-2">
      <div className="sticky top-0 z-10 bg-card p-1.5">
        <button
          type="button"
          onClick={() => openReview({ kind: "board" })}
          className="flex h-6 w-full items-center justify-center gap-1.5 rounded-md bg-muted text-xs transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        >
          <FileDiff className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {t.review.open}
        </button>
      </div>
      {rounds.map(([round, tasks], i) => (
        <TreeSection
          key={round}
          heading
          title={tw.round(round)}
          hint={prompts[round]}
          // The newest round is what someone came to see; earlier ones stay a click away.
          defaultOpen={i === 0}
          actions={
            rounds.length > 1 ? (
              <RowAction label={t.review.openRound} onClick={() => openReview({ kind: "round", round })}>
                <FileDiff />
              </RowAction>
            ) : undefined
          }
        >
          {tasks.map((n) => {
            const m = people.get(memberIdOf(n));
            return <TaskChanges key={n.id} run={run} task={n} who={m?.name ?? n.role} />;
          })}
        </TreeSection>
      ))}
    </div>
  );
}

// A small icon action inside a row, the same in every sidebar tab.
export function RowAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="size-5 shrink-0 rounded text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
    </Button>
  );
}

function TaskChanges({ run, task, who }: { run: Run; task: NodeState; who: string }) {
  const changes = task.changes;
  const { revert, dialog } = useRevert(run.id);
  const live = isLiveRun(run);
  if (!changes) return null;
  const left = changes.files.filter((f) => !changes.reverted?.includes(f.path)).map((f) => f.path);
  const canUndo = !!changes.before && !!changes.after;
  return (
    <>
      <TreeSection
        title={task.title}
        hint={who}
        count={changes.files.length}
        icon={<MiniFace seed={memberIdOf(task)} className="size-4 shrink-0 rounded-full" />}
        actions={
          canUndo && left.length > 0 ? (
            <RowAction label={live ? tw.waitLive : tw.undoTask} disabled={live} onClick={() => revert(task.id, left)}>
              <Undo2 />
            </RowAction>
          ) : undefined
        }
      >
        <ul className="flex flex-col">
          {/* By path, so a folder's files sit together; the name stays plain and only the letter says what changed,
              the way a git client lists them. */}
          {[...changes.files]
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((f) => {
              const mark = CHANGE_MARK[f.change];
              const undone = changes.reverted?.includes(f.path);
              const name = baseName(f.path);
              return (
                <TreeRow
                  key={f.path}
                  depth={1}
                  icon={<FileIcon name={name} muted />}
                  label={name}
                  struck={undone || f.change === "deleted"}
                  trail={f.path.slice(0, -name.length - 1) || undefined}
                  end={
                    undone ? (
                      <span className="text-[11px] text-muted-foreground">{tw.reverted}</span>
                    ) : (
                      <span className={cn("inline-block w-3 text-center font-mono text-[11px] font-medium", mark.tone)}>{mark.letter}</span>
                    )
                  }
                  title={`${f.path} · ${tw.change[f.change]}`}
                  onClick={() => openReview({ kind: "node", node: task.id }, f.path)}
                />
              );
            })}
        </ul>
      </TreeSection>
      {dialog}
    </>
  );
}
