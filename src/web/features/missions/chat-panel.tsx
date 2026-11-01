import { useNavigate } from "@tanstack/react-router";
import {
  AppWindow,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  FilePen,
  Files,
  FileText,
  Frame,
  Globe,
  Hammer,
  Image,
  PanelRightClose,
  PenLine,
  Plug,
  Search,
  Shapes,
  Square,
  SquarePen,
  SquareTerminal,
  StickyNote,
  Table2,
  Type,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ClaudeMark, CodexMark } from "@/components/brand-marks";
import { Markdown } from "@/components/markdown";
import { StatusIcon } from "@/components/status";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, lang, t } from "@/i18n";
import { cancelMission, isLiveRun } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { sendPrompt, useRuns } from "@/stores/runs";
import type { NodeState, Run } from "../../../shared/types";
import { type Act, summarize, timeline } from "./activity";
import { ComposerMenu } from "./composer-menu";
import { ModelPicker } from "./model-picker";
import { type Round, roundsOf } from "./rounds";

const MARK = { claude: ClaudeMark, codex: CodexMark };
// Each chip says what kind of thing it points at.
const KIND_ICON = {
  note: StickyNote,
  doc: FileText,
  table: Table2,
  image: Image,
  preview: AppWindow,
  code: Code2,
  files: Files,
  drawing: PenLine,
  text: Type,
  shape: Shapes,
  frame: Frame,
};

// Lets the chat point at something on the board; the canvas listens and brings it into view.
export const focusOnBoard = (id: string) => window.dispatchEvent(new CustomEvent("satgas:focus", { detail: id }));

interface Props {
  run: Run;
  onOpenTask: (id: string) => void;
  onOpenReport: () => void;
  onHide: () => void;
  className?: string;
}

// The chat shows the run's words and the cards agents made, never card positions; moving a card must not re-render it.
const madeCards = (run: Run) => (run.board?.cards ?? []).filter((c) => c.from);
function sameChat(a: Props, b: Props): boolean {
  const x = a.run;
  const y = b.run;
  const fields = ["id", "title", "icon", "prompt", "rounds", "nodes", "status", "startedAt", "createdAt", "error"] as const;
  if (fields.some((k) => x[k] !== y[k])) return false;
  if (a.onOpenTask !== b.onOpenTask || a.onOpenReport !== b.onOpenReport || a.onHide !== b.onHide || a.className !== b.className)
    return false;
  if (x.board === y.board) return true;
  const ca = madeCards(x);
  const cb = madeCards(y);
  return ca.length === cb.length && ca.every((c, i) => c.id === cb[i]?.id && c.title === cb[i]?.title && c.kind === cb[i]?.kind);
}

function liveStatus(run: Run, last: Round | undefined): string {
  if (run.status === "planning") return t.plotting;
  const tasks = last?.tasks ?? [];
  if (run.status === "running") return t.chat.progress(tasks.filter((n) => n.status === "done").length, tasks.length);
  if (run.status === "done" && last?.report) return t.chat.reportReady;
  return t.run[run.status];
}

// The board's conversation: every prompt with what the agents did about it, and the one door for the next step.
export const ChatPanel = memo(function ChatPanel({ run, onOpenTask, onOpenReport, onHide, className }: Props) {
  const navigate = useNavigate();
  const rounds = useMemo(() => roundsOf(run), [run]);
  const scroller = useRef<HTMLDivElement>(null);
  const live = isLiveRun(run);
  const last = rounds.at(-1);

  // Follow the conversation as it grows, the way a chat does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when rounds, tasks or the report change.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rounds.length, last?.tasks.length, last?.report.length, run.status]);

  return (
    <aside aria-label={t.chat.label} className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-lg", className)}>
      <header className="flex h-12 shrink-0 items-center gap-1 border-b ps-3.5 pe-1.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" title={run.title ?? run.prompt}>
          {run.icon && <span className="me-1.5">{run.icon}</span>}
          {run.title ?? run.prompt}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.chat.newBoard}
          title={t.chat.newBoard}
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void navigate({ to: "/" }).then(() => document.getElementById("mission")?.focus())}
        >
          <SquarePen />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.chat.hide}
          title={t.chat.hide}
          className="text-muted-foreground hover:text-foreground"
          onClick={onHide}
        >
          <PanelRightClose />
        </Button>
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3.5 py-4">
        <p className="text-center text-xs text-muted-foreground">{t.chat.disclaimer}</p>
        {/* Screen readers hear where the work stands, not every streamed line. */}
        <p role="status" className="sr-only">
          {liveStatus(run, last)}
        </p>
        {rounds.map((r) => (
          <RoundView key={r.index} run={run} round={r} latest={r === last} onOpenTask={onOpenTask} onOpenReport={onOpenReport} />
        ))}
      </div>

      <ChatComposer run={run} live={live} />
    </aside>
  );
}, sameChat);

function RoundView({
  run,
  round,
  latest,
  onOpenTask,
  onOpenReport,
}: {
  run: Run;
  round: Round;
  latest: boolean;
  onOpenTask: (id: string) => void;
  onOpenReport: () => void;
}) {
  const now = useNow(latest && isLiveRun(run));
  const planning = latest && run.status === "planning";
  const done = round.tasks.filter((n) => n.status === "done").length;
  const failed = round.tasks.find((n) => n.status === "failed");
  const started = run.startedAt ?? run.createdAt;

  return (
    <section className="flex flex-col gap-3">
      <UserBubble text={round.prompt} />

      <div className="flex flex-col gap-2.5 text-sm">
        {planning ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <StatusIcon status="planning" />
            <span className="satgas-shimmer">{t.plotting}</span>
          </p>
        ) : (
          round.tasks.length > 0 && (
            <>
              <p className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                <span>{t.chat.planned(round.tasks.length)}</span>
                {latest && isLiveRun(run) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{t.chat.progress(done, round.tasks.length)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fmtElapsed(now - started)}</span>
                  </>
                )}
              </p>
              <ul className="flex flex-col overflow-hidden rounded-xl border">
                {round.tasks.map((n) => (
                  <TaskRow key={n.id} task={n} isFinal={round.finals.has(n.id)} onOpen={() => onOpenTask(n.id)} />
                ))}
              </ul>
            </>
          )
        )}

        {failed && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 px-3 py-2 text-xs text-destructive"
          >
            <p className="min-w-0">
              <span className="font-medium">{failed.title}</span> · {failed.error ?? t.run.failed}
            </p>
            <button
              type="button"
              onClick={() => onOpenTask(failed.id)}
              className="shrink-0 font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t.chat.openTask}
            </button>
          </div>
        )}
        {latest && run.status === "failed" && !failed && run.error && (
          <p role="alert" className="rounded-xl border border-destructive/30 px-3 py-2 text-xs text-destructive">
            {run.error}
          </p>
        )}
        {round.outcome && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusIcon status={round.outcome === "cancelled" ? "cancelled" : "skipped"} className="size-3.5" />
            {round.outcome === "cancelled" ? t.run.cancelled : t.chat.noPlan}
          </p>
        )}

        {round.report && <Report text={round.report} onOpen={latest ? onOpenReport : undefined} />}

        {round.cards.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">{t.chat.made}</p>
            <ul className="flex flex-wrap gap-1.5">
              {round.cards.map((c) => {
                const Icon = KIND_ICON[c.kind];
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => focusOnBoard(c.id)}
                      className="inline-flex h-7 max-w-56 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{c.title ?? t.board.kind[c.kind]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// A task in the chat: its status and agent, and on demand what the agent said and did, folded like a coding chat.
function TaskRow({ task, isFinal, onOpen }: { task: NodeState; isFinal: boolean; onOpen: () => void }) {
  const Mark = MARK[task.agent];
  const lines = useRuns((s) => s.logs[task.id]);
  const live = task.status === "running";
  // Work in progress is worth watching, so a running task starts open.
  const [open, setOpen] = useState(live);
  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);
  // A final task's closing message is the report shown under the task list, so its timeline leaves it out.
  const items = useMemo(() => {
    const report = isFinal ? task.output?.trim() : undefined;
    return timeline(lines ?? []).filter((i) => !(i.type === "text" && report && i.text === report));
  }, [lines, task.output, isFinal]);

  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          title={open ? t.actlog.hide : t.actlog.show}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 py-1.5 ps-3 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          <StatusIcon status={task.status} />
          <span className={cn("min-w-0 flex-1 truncate", live && "satgas-shimmer")}>{task.title}</span>
          <Mark className="size-3.5 shrink-0" />
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        </button>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${t.chat.openTask}: ${task.title}`}
          title={t.chat.openTask}
          className="flex size-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          <ArrowUpRight className="size-3.5" />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-1 border-t bg-muted/20 px-3 py-2">
          {items.length === 0 ? (
            <p className={cn("py-1 text-xs text-muted-foreground", live && "satgas-shimmer")}>{live ? t.plotting : t.actlog.empty}</p>
          ) : (
            items.map((item, i) =>
              item.type === "group" ? (
                // The newest group of a running task is the work happening now.
                // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows at the end, so positions are stable.
                <ActivityGroup key={i} acts={item.acts} live={live && i === items.length - 1} />
              ) : item.type === "error" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows at the end, so positions are stable.
                <p key={i} className="py-0.5 text-xs text-destructive">
                  {item.text}
                </p>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: the log only grows at the end, so positions are stable.
                <div key={i} className="py-0.5 [&_*]:text-[13px]">
                  <Markdown text={item.text} />
                </div>
              ),
            )
          )}
        </div>
      )}
    </li>
  );
}

const ACT_ICON = { edit: FilePen, command: SquareTerminal, read: FileText, search: Search, web: Globe, mcp: Plug, other: Wrench };

// One quiet row that sums up a run of tool calls; opening it lists each command, file or lookup.
function ActivityGroup({ acts, live = false }: { acts: Act[]; live?: boolean }) {
  const [open, setOpen] = useState(false);
  const onlyCommands = acts.every((a) => a.kind === "command");
  const Icon = onlyCommands ? SquareTerminal : Hammer;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-7 items-center gap-2 rounded-md text-start text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className={cn("min-w-0 truncate", live && "satgas-shimmer")}>{summarize(acts, t.actlog, lang)}</span>
        <ChevronRight
          className={cn(
            "size-3 shrink-0 opacity-0 transition-[transform,opacity] group-hover:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      </button>
      {open && (
        <ul className="mb-1 ms-[7px] flex flex-col border-s ps-3">
          {acts.map((a, i) => {
            const Glyph = ACT_ICON[a.kind];
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: a group's acts never reorder.
              <li key={i} className="flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
                <Glyph className="size-3 shrink-0" aria-hidden="true" />
                {a.server && <span className="shrink-0 text-foreground/80">{a.server}</span>}
                <span className="min-w-0 truncate font-mono text-[11px]" title={a.detail}>
                  {a.detail}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Long prompts fold to a few lines, like the reference chat; the full text is one click away.
function UserBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280 || text.split("\n").length > 5;
  return (
    <div className="ms-8 flex flex-col items-end">
      <div className="flex max-w-full flex-col gap-1 rounded-2xl bg-muted px-3.5 py-2.5 text-sm">
        <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", long && !open && "line-clamp-5")}>{text}</p>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {open ? t.chat.showLess : t.chat.showMore}
            {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Report({ text, onOpen }: { text: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn("relative overflow-hidden text-sm", !open && "max-h-48")}>
        <Markdown text={text} />
        {!open && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card" />}
      </div>
      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {open ? t.chat.showLess : t.chat.showMore}
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t.chat.openReport}
          </button>
        )}
      </div>
    </div>
  );
}

// The board's one door: the next prompt, with the same + menu and model picker as Home; Stop while agents work.
function ChatComposer({ run, live }: { run: Run; live: boolean }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!live) setStopping(false);
  }, [live]);

  // Grows with the text, up to about eight lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the draft.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const send = async () => {
    const prompt = draft.trim();
    if (!prompt || live || sending) return;
    setSending(true);
    try {
      await sendPrompt(run.id, prompt);
      setDraft("");
    } catch (e) {
      // The draft stays so it can be sent again.
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      aria-label={t.mission}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="m-2 mt-0 flex shrink-0 flex-col rounded-xl border bg-background transition-colors focus-within:border-foreground/25"
    >
      <label htmlFor="next-prompt" className="sr-only">
        {t.nextPrompt}
      </label>
      <textarea
        id="next-prompt"
        ref={field}
        rows={2}
        value={draft}
        placeholder={live ? t.agentsWorking : t.nextPrompt}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 pt-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1 px-1.5 pt-1 pb-1.5">
        <ComposerMenu />
        <ModelPicker />
        {live ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ms-auto"
            disabled={stopping}
            onClick={() => {
              setStopping(true);
              void cancelMission(run).then((ok) => ok || setStopping(false));
            }}
          >
            <Square />
            {stopping ? t.cancelling : t.stop}
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim() || sending}
            aria-label={t.send}
            title={t.send}
            className="ms-auto size-8 rounded-full bg-signal text-signal-foreground hover:bg-signal/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  );
}
