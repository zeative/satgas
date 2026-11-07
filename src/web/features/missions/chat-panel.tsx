import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  Eye,
  EyeOff,
  FileDown,
  FilePen,
  FileText,
  GitPullRequest,
  Globe,
  Hammer,
  Image as ImageIcon,
  Info,
  KeyRound,
  ListTodo,
  Maximize2,
  MessageCircle,
  MessageCircleQuestion,
  MessagesSquare,
  PanelRightClose,
  Paperclip,
  Pencil,
  Plug,
  Search,
  Shapes,
  ShieldCheck,
  Square,
  SquareDashedMousePointer,
  SquarePen,
  SquareTerminal,
  Users,
  Webhook,
  Wrench,
  X,
} from "lucide-react";
import {
  type ComponentType,
  lazy,
  memo,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ClaudeMark, CodexMark } from "@/components/brand-marks";
import { Markdown } from "@/components/markdown";
import { OutboundLink } from "@/components/outbound-link";
import { RichText } from "@/components/rich-text";
import { StatusIcon } from "@/components/status";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { fmtElapsed, isMac, kindName, t } from "@/i18n";
import { cancelMission, isLiveRun } from "@/lib/actions";
import { useDraft } from "@/lib/drafts";
import { splitQuotes, withQuotes } from "@/lib/quote";
import { cn } from "@/lib/utils";
import { setBoardView } from "@/stores/board-view";
import { useActiveSession } from "@/stores/chat-session";
import { undoMemory } from "@/stores/memory";
import {
  answerSecret,
  approveTask,
  editQueued,
  moveQueued,
  sendPrompt,
  undoBoardEdit,
  unqueuePrompt,
  uploadAttachment,
  useRuns,
} from "@/stores/runs";
import { useSelection } from "@/stores/selection";
import type { Card } from "../../../shared/board";
import { stripBlocks } from "../../../shared/board-blocks";
import { type BoardEdit, countTotal } from "../../../shared/board-edit";
import type { MemoryRecord } from "../../../shared/memory";
import { cardLabel } from "../../../shared/refs";
import type { SecretAsk } from "../../../shared/secrets";
import { MAIN_SESSION, sessionOf, sessionsOf } from "../../../shared/sessions";
import type { SetupRecord } from "../../../shared/setup";
import type { TeamAsk, TeamTalk } from "../../../shared/talk";
import { crew, type Member, memberIdOf } from "../../../shared/team";
import type { Aside, NodeState, PlanDraft, QueuedPrompt, RoundOrigin, Run } from "../../../shared/types";
import { keyedSrc } from "../board/context";
import { requestSnapshot } from "../board/export";
import { MiniFace } from "../team/face";
import { actDetail, actVerb, pathParts, shortPath } from "./act-label";
import { type Act, type Item, summarize, timeline } from "./activity";
import { AttachmentTiles, attach, SightNote, useFileDrop, useSight } from "./attachments";
import { BoardName } from "./board-name";
import { clearQuotes, QuoteChips, useBoardQuotes } from "./cite";
import { DropHint, FilePicker } from "./composer";
import { ComposerMenu } from "./composer-menu";
import { ModelPicker } from "./model-picker";
import { ProviderNotice, useNeedsProvider } from "./provider-gate";
import { AskedNote, QuestionComposer } from "./questions";
import { type Round, roundsOf } from "./rounds";
import { SessionBar, SessionEmpty, sessionTitle } from "./sessions";
import { SetupLine } from "./setup-line";
import { KIND_ICON, knownFromRefs, TokenField, TokenText, useTokenCatalog } from "./token-field";

const MARK = { claude: ClaudeMark, codex: CodexMark };

// Lets the chat point at something on the board; the canvas listens and brings it into view.
export const focusOnBoard = (id: string) => window.dispatchEvent(new CustomEvent("satgas:focus", { detail: id }));

interface Props {
  run: Run;
  onOpenTask: (id: string) => void;
  onOpenReport: () => void;
  onHide: () => void;
  className?: string;
  // Chat Only: the chat fills the page, and what the team made shows in it instead of only on the canvas.
  page?: boolean;
  onOpenCanvas?: (cardId?: string) => void;
}

// The chat shows the run's words and the cards agents made, never card positions; moving a card must not re-render it.
const madeCards = (run: Run) => (run.board?.cards ?? []).filter((c) => c.from);
function sameChat(a: Props, b: Props): boolean {
  const x = a.run;
  const y = b.run;
  // Every run field the chat reads must be listed here, or changes to it never reach the screen until a reload.
  const fields = [
    "id",
    "title",
    "icon",
    "prompt",
    "rounds",
    "answers",
    "asks",
    "refs",
    "files",
    "imageNotes",
    "fileKey",
    "nodes",
    "status",
    "startedAt",
    "createdAt",
    "error",
    "team",
    "edits",
    "setups",
    "talk",
    "draft",
    "queue",
    "asides",
    "replies",
    "origins",
    "secrets",
    "memories",
    "selected",
    "sessions",
    "roundSessions",
  ] as const;
  if (fields.some((k) => x[k] !== y[k])) return false;
  if (
    a.onOpenTask !== b.onOpenTask ||
    a.onOpenReport !== b.onOpenReport ||
    a.onHide !== b.onHide ||
    a.className !== b.className ||
    a.page !== b.page ||
    a.onOpenCanvas !== b.onOpenCanvas
  )
    return false;
  if (x.board === y.board) return true;
  const ca = madeCards(x);
  const cb = madeCards(y);
  return ca.length === cb.length && ca.every((c, i) => c.id === cb[i]?.id && c.title === cb[i]?.title && c.kind === cb[i]?.kind);
}

function liveStatus(run: Run, last: Round | undefined): string {
  if (run.status === "planning") return t.plotting;
  if (run.status === "asking") return last?.asked ? t.ask.count(last.asked.questions.length) : t.run.asking;
  const tasks = last?.tasks ?? [];
  if (run.status === "running") return t.chat.progress(tasks.filter((n) => n.status === "done").length, tasks.length);
  if (run.status === "done" && last?.report) return t.chat.reportReady;
  return t.run[run.status];
}

// The board's conversation: every prompt with what the agents did about it, and the one door for the next step.
export const ChatPanel = memo(function ChatPanel({ run, onOpenTask, onOpenReport, onHide, className, page, onOpenCanvas }: Props) {
  const navigate = useNavigate();
  const rounds = useMemo(() => roundsOf(run), [run]);
  const scroller = useRef<HTMLDivElement>(null);
  const live = isLiveRun(run);
  const last = rounds.at(-1);
  // The chat shows one session at a time; the round running now may belong to another one.
  const active = useActiveSession(run);
  const shown = useMemo(() => rounds.filter((r) => sessionOf(run, r.index) === active), [rounds, run, active]);
  const here = !!last && sessionOf(run, last.index) === active;
  const busyElsewhere = live && !here;
  const working = busyElsewhere && last ? sessionsOf(run).find((x) => x.id === sessionOf(run, last.index)) : undefined;
  const queued = (run.queue ?? []).filter((q) => (q.session ?? MAIN_SESSION) === active);
  const queuedElsewhere = (run.queue?.length ?? 0) - queued.length;
  // Questions waiting on the person take over the composer until they are answered or set aside.
  const asking = here && run.status === "asking" && last?.asked && !last.asked.answers ? last.asked : undefined;

  // The thread sticks to its end while it grows, streamed text included, until the person scrolls up to read; sending
  // or the button sticks it again. A smooth scroll down passes through "not at the end", so it is not read as leaving.
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const gliding = useRef(false);
  const [away, setAway] = useState(false);
  const toBottom = useCallback((smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = true;
    gliding.current = smooth;
    setAway(false);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const gap = () => el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only moving up lets go: the view shrinking under the composer also opens a gap, without anyone scrolling.
    let lastTop = el.scrollTop;
    const onScroll = () => {
      const up = el.scrollTop < lastTop - 1;
      lastTop = el.scrollTop;
      if (gliding.current) {
        if (gap() < 2) gliding.current = false;
        return;
      }
      if (gap() < 48) pinned.current = true;
      else if (up) pinned.current = false;
      setAway(!pinned.current && gap() > 240);
    };
    // A wheel or a touch is the person taking over, even in the middle of a glide.
    const takeOver = () => {
      gliding.current = false;
    };
    const grown = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
      else setAway(gap() > 240);
    });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", takeOver, { passive: true });
    el.addEventListener("touchstart", takeOver, { passive: true });
    grown.observe(inner);
    // The composer growing or a panel resizing shrinks the view without any scroll, so that counts too.
    grown.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", takeOver);
      el.removeEventListener("touchstart", takeOver);
      grown.disconnect();
    };
  }, []);
  // Another session is another thread, so it opens at its end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: jump only when the session changes.
  useEffect(() => toBottom(false), [active]);

  return (
    <aside
      aria-label={t.chat.label}
      className={cn("flex flex-col overflow-hidden", page ? "bg-background" : "rounded-2xl border bg-card shadow-lg", className)}
    >
      {!page && (
        <header className="flex h-12 shrink-0 items-center gap-1 border-b ps-3.5 pe-1.5">
          <div className="flex min-w-0 flex-1 items-center">
            {run.icon && <span className="me-1.5 shrink-0 text-sm">{run.icon}</span>}
            <BoardName run={run} as="h2" className="text-sm font-medium" />
          </div>
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
          {/* Chat Only is this panel grown to the whole page; the way there lives on the panel itself. */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.view.chat}
            title={`${t.view.chat} (${isMac ? "⌘J" : "Ctrl J"})`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setBoardView(run.id, "chat")}
          >
            <Maximize2 />
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
      )}
      {!page && <SessionBar run={run} />}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scroller}
          data-cite
          // Both gutters kept, so the column lines up with the composer whether or not the thread scrolls.
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto",
            page ? "items-center px-6 pt-8 pb-8 [scrollbar-gutter:stable_both-edges]" : "px-3.5 py-4",
          )}
        >
          <div ref={content} className={cn("flex w-full flex-col", page ? "max-w-3xl gap-10" : "gap-6")}>
            {!page && <p className="text-center text-xs text-muted-foreground">{t.chat.disclaimer}</p>}
            {/* Screen readers hear where the work stands, not every streamed line. */}
            <p role="status" className="sr-only">
              {liveStatus(run, last)}
            </p>
            {shown.length === 0 && <SessionEmpty />}
            {shown.map((r) => (
              <RoundView
                key={r.index}
                run={run}
                round={r}
                latest={r === last}
                onOpenTask={onOpenTask}
                onOpenReport={onOpenReport}
                onOpenCanvas={page ? onOpenCanvas : undefined}
                page={page}
              />
            ))}
            {working && (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-signal" />
                {t.session.busyElsewhere(sessionTitle(working))}
              </p>
            )}
            {queued.length ? <QueuedBubble runId={run.id} items={queued} known={knownFromRefs(undefined, run.board?.cards)} /> : null}
            {queuedElsewhere > 0 && (
              <p className="text-end text-[11px] text-muted-foreground">{t.session.waitingElsewhere(queuedElsewhere)}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => toBottom()}
          tabIndex={away ? 0 : -1}
          aria-hidden={!away}
          className={cn(
            "absolute bottom-3 left-1/2 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-3 text-xs shadow-sm transition-[opacity,transform] duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            away ? "opacity-100" : "pointer-events-none translate-y-1 opacity-0",
          )}
        >
          <ChevronDown className="size-3.5" aria-hidden="true" />
          {t.chat.scrollEnd}
        </button>
      </div>

      <div className={cn(page && "px-6 pb-3 [scrollbar-gutter:stable_both-edges]")}>
        {/* The composers keep their side-panel inset; here they span the column the messages use and sit raised on the dark page. */}
        <div className={cn(page && "mx-auto w-full max-w-3xl *:mx-0 dark:*:bg-card")}>
          {asking && last ? (
            <QuestionComposer key={`${run.id}:${last.index}`} run={run} asked={asking} />
          ) : (
            <ChatComposer run={run} live={live} onSent={toBottom} />
          )}
        </div>
        {page && <p className="pt-2 text-center text-[11px] text-muted-foreground">{t.chat.disclaimer}</p>}
      </div>
    </aside>
  );
}, sameChat);

function RoundView({
  run,
  round,
  latest,
  onOpenTask,
  onOpenReport,
  onOpenCanvas,
  page,
}: {
  run: Run;
  round: Round;
  latest: boolean;
  onOpenTask: (id: string) => void;
  onOpenReport: () => void;
  // Chat Only: cards show here in full, each a click away from its place on the canvas.
  onOpenCanvas?: (cardId?: string) => void;
  page?: boolean;
}) {
  const now = useNow(latest && isLiveRun(run));
  const planning = latest && run.status === "planning";
  const people = useMemo(() => new Map(crew(run).map((m) => [m.id, m])), [run]);
  const hired = (run.team ?? []).filter((m) => m.round === round.index);
  const done = round.tasks.filter((n) => n.status === "done").length;
  const failed = round.tasks.find((n) => n.status === "failed");
  const started = run.startedAt ?? run.createdAt;

  return (
    <section className={cn("flex flex-col", page ? "gap-4" : "gap-3")}>
      {run.origins?.[round.index] && <OriginLine origin={run.origins[round.index] as RoundOrigin} />}
      <UserBubble text={round.prompt} known={knownFromRefs(round.refs, run.board?.cards)} />
      {run.selected?.[round.index] && <SentContext cards={run.board?.cards ?? []} ids={run.selected[round.index] as string[]} />}
      {round.files.length > 0 && <SentFiles run={run} files={round.files} />}
      {round.asked && <AskedNote asked={round.asked} waiting={latest && run.status === "asking"} />}
      {/* What the lead already said about these words while the team was still on the round before. */}
      {run.replies?.[round.index]?.map((r) => (
        <Report key={r} text={r} page={page} />
      ))}

      <div className="flex flex-col gap-2.5 text-sm">
        <LeadTrace round={round.index} planning={planning} cwd={run.cwd} />
        {planning ? (
          <LeadDraft
            draft={run.draft?.round === round.index ? run.draft : undefined}
            people={people}
            elapsed={fmtElapsed(now - started)}
            page={page}
          />
        ) : (
          round.tasks.length > 0 && (
            <>
              <LeadActions run={run} round={round.index} />
              {/* One line for the plan: how big it is, how far along, and who joined for it. */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                <span>{t.chat.planned(round.tasks.length)}</span>
                {latest && isLiveRun(run) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{t.chat.progress(done, round.tasks.length)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fmtElapsed(now - started)}</span>
                  </>
                )}
                {hired.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{t.chat.hired}</span>
                    {hired.map((m) => (
                      <span key={m.id} className="inline-flex items-center gap-1.5" title={`${m.name} · ${m.role}`}>
                        <MiniFace seed={m.id} className="size-4" />
                        <span className="text-foreground">{m.name}</span>
                      </span>
                    ))}
                  </>
                )}
              </p>
              <TaskList round={round} people={people} onOpenTask={onOpenTask} cwd={run.cwd} />
            </>
          )
        )}

        {run.secrets?.some((a) => round.tasks.some((n) => n.id === a.nodeId)) && (
          <SecretList run={run} asks={(run.secrets ?? []).filter((a) => round.tasks.some((n) => n.id === a.nodeId))} people={people} />
        )}
        {round.tasks.some((n) => n.approval && (n.held || n.approved)) && <ApprovalList run={run} tasks={round.tasks} people={people} />}
        {run.talk?.[round.index] && <TalkList talk={run.talk[round.index] as TeamTalk} people={people} />}
        {round.tasks.some((n) => n.recovery) && <RecoveryNotes tasks={round.tasks} people={people} />}
        {run.asides?.[round.index]?.length ? <AsideList run={run} asides={run.asides[round.index] as Aside[]} /> : null}
        {failed && !failed.recovery && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 px-3 py-2 text-xs text-destructive"
          >
            <p className="min-w-0">
              <span className="font-medium">{failed.title}</span> · <RichText text={failed.error ?? t.run.failed} />
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
            <RichText text={run.error} />
          </p>
        )}
        {round.outcome && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusIcon status={round.outcome === "cancelled" ? "cancelled" : "skipped"} className="size-3.5" />
            {round.outcome === "cancelled" ? t.run.cancelled : t.chat.noPlan}
          </p>
        )}

        {round.answer && <Report text={round.answer} page={page} />}
        {round.report && <Report text={round.report} page={page} onOpen={latest ? onOpenReport : undefined} />}

        {!round.tasks.length && <LeadActions run={run} round={round.index} />}
        {round.cards.length > 0 &&
          (onOpenCanvas ? (
            <Suspense fallback={<MadeList cards={round.cards} />}>
              <CardPreviews run={run} cards={round.cards} onOpen={onOpenCanvas} />
            </Suspense>
          ) : (
            <MadeList cards={round.cards} />
          ))}
        <RoundFiles runId={run.id} cards={round.cards} tasks={round.tasks} />
      </div>
    </section>
  );
}

// Card bodies bring the board's renderer along; only Chat Only shows them here, and only once a round has made cards.
const CardPreviews = lazy(() => import("./card-previews").then((m) => ({ default: m.CardPreviews })));

const TASKS_SHOWN = 8;

// A long plan folds to its first few rows, and whatever is running, failed or waiting on the person stays out in the open.
function TaskList({
  round,
  people,
  onOpenTask,
  cwd,
}: {
  round: Round;
  people: Map<string, Member>;
  onOpenTask: (id: string) => void;
  cwd?: string;
}) {
  const [open, setOpen] = useState(false);
  const urgent = (n: NodeState) => n.status === "running" || n.status === "failed" || !!n.held;
  const folds = round.tasks.length > TASKS_SHOWN + 2;
  const shown = folds && !open ? round.tasks.filter((n, i) => i < TASKS_SHOWN || urgent(n)) : round.tasks;
  return (
    <ul className="flex flex-col overflow-hidden rounded-xl border">
      {shown.map((n) => (
        <TaskRow
          key={n.id}
          task={n}
          member={people.get(memberIdOf(n))}
          isFinal={round.finals.has(n.id)}
          onOpen={() => onOpenTask(n.id)}
          cwd={cwd}
        />
      ))}
      {folds && (
        <li>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-full items-center gap-1.5 ps-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
          >
            {open ? t.chat.showLess : t.chat.madeMore(round.tasks.length - shown.length)}
            {open ? <ChevronUp className="size-3" aria-hidden="true" /> : <ChevronDown className="size-3" aria-hidden="true" />}
          </button>
        </li>
      )}
    </ul>
  );
}

const AGENT_NAME = { claude: "Claude Code", codex: "Codex" } as const;

// The lead's plan taking shape while it is written: what it is thinking, the approach, who it hires and each task as
// it lands, so planning reads as work in progress rather than a still label.
function LeadDraft({ draft, people, elapsed, page }: { draft?: PlanDraft; people: Map<string, Member>; elapsed: string; page?: boolean }) {
  const hired = new Map((draft?.hires ?? []).map((h) => [h.name.toLowerCase(), h]));
  const nameOf = (member?: string) => (member ? (people.get(member)?.name ?? hired.get(member.toLowerCase())?.name ?? member) : undefined);
  const row = "satgas-step-in flex min-w-0 items-center gap-1.5";
  const td = t.draft;
  // Every action the lead is writing, in the order it acts, each on its own line, so nothing happens out of sight.
  const actions: { key: string; icon: typeof Brain; verb: string; target?: string }[] = [
    ...(draft?.memory ?? []).map((m, i) => ({
      key: `m-${i}`,
      icon: Brain,
      verb: m.op === "rule" ? t.memory.addingRule : m.op === "forget" ? t.memory.forgetting : t.memory.remembering,
      target: m.text,
    })),
    ...(draft?.setup ?? []).map((c, i) => ({ key: `s-${i}`, icon: Plug, verb: td.setup(c.op, c.on), target: c.name })),
    ...(draft?.board ?? []).map((b, i) => ({ key: `b-${i}`, icon: SquareDashedMousePointer, verb: td.board(b.op, b.count) })),
    ...(draft?.hires ?? []).map((h) => ({ key: `h-${h.name}`, icon: Users, verb: td.hiring(h.name, h.role) })),
    ...(draft?.tasks ?? []).map((task, i) => ({
      key: `t-${i}`,
      icon: ListTodo,
      verb: task.title,
      target: nameOf(task.member),
    })),
    ...(draft?.questions.length ? [{ key: "q", icon: MessageCircleQuestion, verb: td.questions(draft.questions.length) }] : []),
  ];
  const last = actions.at(-1);
  // The status line says what the lead is doing right now: thinking, answering, or the action it is writing.
  const status = last ? (last.key.startsWith("t-") ? td.planningTasks : last.verb) : draft?.reply ? td.answering : t.plotting;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <StatusIcon status="planning" />
        <span className="satgas-shimmer truncate">{status}</span>
        <span className="shrink-0 text-xs tabular-nums">· {elapsed}</span>
      </p>
      {draft && (draft.thinking || draft.summary) && (
        // The lead's working-out: small, muted and on a thread, so it never reads like the answer below it.
        <div className="ms-1.5 flex flex-col gap-1 border-s border-dashed ps-3 text-xs leading-5 text-muted-foreground">
          <p className="flex min-w-0 items-start gap-1.5">
            <Brain className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className={cn("[overflow-wrap:break-word]", !draft.summary && "line-clamp-2")}>
              {draft.summary ?? draft.thinking?.split("\n").filter(Boolean).at(-1)}
            </span>
          </p>
        </div>
      )}
      {/* The answer itself, as it streams: the same face as the reply it becomes. */}
      {draft?.reply && (
        <Markdown
          text={draft.reply}
          className={cn("max-w-[68ch] gap-4 text-foreground", page ? "text-sm leading-6" : "text-[13px] leading-[22px]")}
        />
      )}
      {/* Then the actions, after the words, as T3 Code shows tool calls: one live row naming the newest, all a click away. */}
      {last && (
        <ActionRow
          icon={last.icon}
          live
          summary={`${last.verb}${last.target ? ` ${last.target}` : ""}${actions.length > 1 ? ` · ${t.draft.more(actions.length - 1)}` : ""}`}
        >
          <ul className="flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
            {actions.map((a) => (
              <li key={a.key} className={row}>
                <a.icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="shrink-0">{a.verb}</span>
                {a.target && <span className="min-w-0 truncate text-foreground">{a.target}</span>}
              </li>
            ))}
          </ul>
        </ActionRow>
      )}
    </div>
  );
}

// What the team told each other this round, folded: decisions they posted and the few questions between them.
function TalkList({ talk, people }: { talk: TeamTalk; people: Map<string, Member> }) {
  const [open, setOpen] = useState(false);
  const count = talk.notes.length + talk.asks.length;
  if (!count) return null;
  const name = (id: string) => people.get(id)?.name ?? id;
  const items = [
    ...talk.notes.map((n) => ({ at: n.at, key: n.id, el: <TalkNote from={n.from} text={n.text} name={name} /> })),
    ...talk.asks.map((a) => ({ at: a.at, key: a.id, el: <TalkAsk ask={a} name={name} /> })),
  ].sort((a, b) => a.at - b.at);
  return (
    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1.5 rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <MessagesSquare className="size-3.5" aria-hidden="true" />
        {t.talk.title(count)}
        <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} aria-hidden="true" />
      </button>
      {open && (
        <ol className="ms-1.5 flex flex-col gap-2 border-s ps-3">
          {items.map((i) => (
            <li key={i.key}>{i.el}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TalkNote({ from, text, name }: { from: string; text: string; name: (id: string) => string }) {
  return (
    <p className="[overflow-wrap:break-word]">
      <span className="font-medium text-foreground">{name(from)}</span> {t.talk.noted}: {text}
    </p>
  );
}

function TalkAsk({ ask, name }: { ask: TeamAsk; name: (id: string) => string }) {
  return (
    <div className="flex flex-col gap-0.5 [overflow-wrap:break-word]">
      <p>
        <span className="font-medium text-foreground">{name(ask.from)}</span> →{" "}
        <span className="font-medium text-foreground">{name(ask.to)}</span>: {ask.question}
      </p>
      <p className="ps-3">
        {ask.state === "answered" ? (
          <>
            <span className="font-medium text-foreground">{name(ask.to)}</span>: {ask.answer}
          </>
        ) : ask.state === "waiting" ? (
          <span className="satgas-shimmer">{t.talk.waiting}</span>
        ) : ask.state === "timeout" ? (
          t.talk.noAnswer
        ) : (
          t.talk.unreachable
        )}
      </p>
    </div>
  );
}

// The lead's word on tasks the system failed (a provider refusal, a key, the network): why, and what it did about it.
function RecoveryNotes({ tasks, people }: { tasks: NodeState[]; people: Map<string, Member> }) {
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((n) => {
        const r = n.recovery;
        if (!r) return null;
        const name = people.get(memberIdOf(n))?.name ?? n.title;
        const next = !r.to
          ? t.recovery.noOther
          : n.status === "done"
            ? t.recovery.fixed(AGENT_NAME[r.to])
            : n.status === "failed"
              ? t.recovery.failedAgain(AGENT_NAME[r.to])
              : t.recovery.retrying(AGENT_NAME[r.to]);
        const bad = n.status === "failed";
        return (
          <div
            key={n.id}
            role={bad ? "alert" : undefined}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[13px] leading-5",
              bad && "border-destructive/30 text-destructive",
            )}
          >
            <MiniFace seed="Lead" className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 [overflow-wrap:break-word]">
              {t.recovery.stopped(name, t.recovery.why[r.kind])} {next}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// What the lead or agents changed on the canvas this round, in one line, with the way back.
function EditLine({ runId, round, edit }: { runId: string; round: number; edit: BoardEdit }) {
  const [pending, setPending] = useState(false);
  const c = edit.counts;
  const e = t.chat.edit;
  const parts = [
    c.removed && e.removed(c.removed),
    c.changed && e.changed(c.changed),
    c.moved && e.moved(c.moved),
    c.linked && e.linked(c.linked),
    c.unlinked && e.unlinked(c.unlinked),
  ].filter((p): p is string => !!p);
  if (!parts.length) return null;
  const text = parts.join(", ");
  const undo = async () => {
    setPending(true);
    try {
      await undoBoardEdit(runId, round);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <SquareDashedMousePointer className="size-3.5 shrink-0" aria-hidden="true" />
      <span className={cn("min-w-0 flex-1", edit.undone && "line-through")}>{text.charAt(0).toUpperCase() + text.slice(1)}</span>
      {edit.undone ? (
        <span className="shrink-0">{e.undone}</span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => void undo()}
          className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {e.undo}
        </button>
      )}
    </p>
  );
}

// One folded row of actions, the way T3 Code shows a run of tool calls: what was done in a line, the details a click
// away. Live while the lead is still writing them.
function ActionRow({
  icon: Icon,
  summary,
  live = false,
  children,
}: {
  icon: typeof Hammer;
  summary: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex min-h-6 items-center gap-2 rounded-md text-start text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className={cn("min-w-0 truncate", live && "satgas-shimmer")}>{summary}</span>
        <ChevronRight
          className={cn(
            "size-3 shrink-0 opacity-0 transition-[transform,opacity] group-hover:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      </button>
      {open && <div className="mb-1 ms-[7px] flex flex-col gap-1.5 border-s ps-3 pt-1">{children}</div>}
    </div>
  );
}

// What the lead did around its answer (canvas changes, setup, memory), in one folded row with each change and its undo
// inside. Setup waiting on the person (Allow, a key to type) stays out in the open, since it needs them.
function LeadActions({ run, round }: { run: Run; round: number }) {
  const edit = run.edits?.[round] as BoardEdit | undefined;
  const setup = run.setups?.[round] as SetupRecord | undefined;
  const memory = run.memories?.[round] as MemoryRecord | undefined;
  const waiting = !!setup && (setup.pending.some((p) => p.state === "waiting") || setup.keys.length > 0);
  const parts = [
    memory && memoryHead(memory),
    setup && !waiting && setup.applied.length > 0 && t.draft.setupDone(setup.applied.length),
    edit && countTotal(edit.counts) > 0 && t.draft.canvasDone(countTotal(edit.counts)),
  ].filter((p): p is string => !!p);
  return (
    <>
      {waiting && setup && <SetupLine runId={run.id} round={round} rec={setup} />}
      {parts.length > 0 && (
        <ActionRow icon={Hammer} summary={parts.join(" · ")}>
          {memory && <MemoryLine runId={run.id} round={round} rec={memory} />}
          {setup && !waiting && <SetupLine runId={run.id} round={round} rec={setup} />}
          {edit && <EditLine runId={run.id} round={round} edit={edit} />}
        </ActionRow>
      )}
    </>
  );
}

const memoryHead = (rec: MemoryRecord) => {
  const added = rec.changes.filter((c) => c.op === "added");
  const rules = added.filter((c) => c.kind === "rule").length;
  const memories = added.length - rules;
  return (
    [memories && t.memory.remembered(memories), rules && t.memory.ruleAdded(rules)].filter(Boolean).join(" · ") ||
    t.memory.changed(rec.changes.length)
  );
};

// What the lead remembered or turned into a rule this round, each change named, with one undo for the round.
function MemoryLine({ runId, round, rec }: { runId: string; round: number; rec: MemoryRecord }) {
  const [pending, setPending] = useState(false);
  const tm = t.memory;
  const head = memoryHead(rec);
  const undo = async () => {
    setPending(true);
    try {
      await undoMemory(runId, round);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <p className="flex items-center gap-2">
        <Brain className="size-3.5 shrink-0" aria-hidden="true" />
        <Link
          to="/memory"
          // A round that mostly made rules opens the Rules tab, where they are.
          search={rec.changes.filter((c) => c.kind === "rule").length * 2 >= rec.changes.length ? { tab: "rules" } : {}}
          className={cn("min-w-0 flex-1 truncate hover:text-foreground", rec.undone && "line-through")}
        >
          {head}
        </Link>
        {rec.undone ? (
          <span className="shrink-0">{tm.undone}</span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => void undo()}
            className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {tm.undo}
          </button>
        )}
      </p>
      <ul className={cn("ms-5.5 flex flex-col gap-0.5", rec.undone && "line-through")}>
        {rec.changes.map((c) => (
          <li key={`${c.op}:${c.id}`} className="truncate" title={c.text}>
            {tm.change[c.op][c.kind]}: <span className="text-foreground">{c.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Documents people download (PDF, Word, Excel, PowerPoint and the like), straight from the chat.
const DOCUMENT = /\.(pdf|docx?|pptx?|xlsx?|csv|tsv|odt|ods|odp|rtf|epub|zip|key|numbers|pages)$/i;

function RoundFiles({ runId, cards, tasks }: { runId: string; cards: Card[]; tasks: NodeState[] }) {
  const prefix = `/api/runs/${runId}/files/`;
  const paths = new Set<string>();
  for (const c of cards) {
    if (c.src?.startsWith(prefix)) paths.add(decodeURIComponent(c.src.slice(prefix.length)));
  }
  for (const n of tasks) for (const f of n.changes?.files ?? []) if (f.change !== "deleted") paths.add(f.path);
  const docs = [...paths].filter((p) => DOCUMENT.test(p));
  if (!docs.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{t.chat.files}</p>
      <ul className="flex flex-wrap gap-1">
        {docs.map((p) => (
          <li key={p} className="min-w-0">
            <a
              href={`${prefix}${p.split("/").map(encodeURIComponent).join("/")}`}
              download={p.split("/").pop()}
              title={p}
              className="flex h-6 max-w-56 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <FileDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{p.split("/").pop()}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// What a round put on the board: one quiet row per card, icons in one column, the first few shown and the rest a click away.
const MADE_SHOWN = 8;
function MadeList({ cards }: { cards: Card[] }) {
  const [open, setOpen] = useState(false);
  // Folding away a single chip saves nothing.
  const folds = cards.length > MADE_SHOWN + 1;
  const shown = folds && !open ? cards.slice(0, MADE_SHOWN) : cards;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">
        {t.chat.made} <span className="font-mono tabular-nums">{cards.length}</span>
      </p>
      {/* Small chips that wrap, several to a line; each zooms the board to its card. */}
      <ul className="flex flex-wrap gap-1">
        {shown.map((c) => {
          const Icon = KIND_ICON[c.kind];
          const label = chipLabel(c);
          return (
            <li key={c.id} className="min-w-0">
              <button
                type="button"
                onClick={() => focusOnBoard(c.id)}
                title={label}
                className="flex h-6 max-w-48 items-center gap-1.5 rounded-md bg-muted px-2 text-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            </li>
          );
        })}
        {folds && (
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {open ? t.chat.showLess : t.chat.madeMore(cards.length - MADE_SHOWN)}
              {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

// Frames, stickies and text carry their name in the text itself, so the chip reads it instead of a bare kind.
const NAMED_BY_TEXT = new Set<Card["kind"]>(["frame", "note", "text"]);
function chipLabel(c: Card) {
  const line = NAMED_BY_TEXT.has(c.kind) ? c.text?.trim().split("\n")[0] : undefined;
  return c.title || line || kindName(c);
}

// A task in the chat: its status and agent, and on demand what the agent said and did, folded like a coding chat.
function TaskRow({
  task,
  member,
  isFinal,
  onOpen,
  cwd,
}: {
  task: NodeState;
  member?: Member;
  isFinal: boolean;
  onOpen: () => void;
  cwd?: string;
}) {
  const Mark = MARK[task.agent];
  const lines = useRuns((s) => s.logs[task.id]);
  const live = task.status === "running";
  // A working task shows what it is doing and folds when it is done, unless the person chose otherwise.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? live;
  // A final task's closing message is the report shown under the task list, so its timeline leaves it out.
  const items = useMemo(() => {
    const report = isFinal ? task.output?.trim() : undefined;
    // Native-card blocks show up as cards, not as raw fences in the activity.
    return timeline(lines ?? [])
      .filter((i) => !(i.type === "text" && report && i.text === report))
      .map((i) => (i.type === "text" ? { ...i, text: stripBlocks(i.text) } : i))
      .filter((i) => i.type !== "text" || i.text);
  }, [lines, task.output, isFinal]);
  const summary = useMemo(
    () =>
      summarize(
        items.flatMap((i) => (i.type === "group" ? i.acts : [])),
        t.actlog,
      ),
    [items],
  );

  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setChosen(!open)}
          title={open ? t.actlog.hide : t.actlog.show}
          className="flex min-h-9 min-w-0 flex-1 items-center gap-2.5 py-1.5 ps-3 pe-2.5 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          <StatusIcon status={task.status} />
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px]", live && "satgas-shimmer")}>{task.title}</span>
            {!open && summary && <span className="block truncate text-[11px] text-muted-foreground">{summary}</span>}
          </span>
          {/* Who does it, with the agent that runs them as a badge, so the row carries one mark instead of a name and two logos. */}
          <span
            className="relative shrink-0"
            title={member ? `${member.name} · ${member.role} · ${AGENT_NAME[task.agent]}` : AGENT_NAME[task.agent]}
          >
            {member ? <MiniFace seed={member.id} className="size-5" /> : <Mark className="size-4" />}
            {member && (
              <span className="absolute -end-1 -bottom-1 flex size-3 items-center justify-center rounded-full bg-background">
                <Mark className="size-2.5" />
              </span>
            )}
          </span>
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        </button>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${t.chat.openTask}: ${task.title}`}
          title={t.chat.openTask}
          className="flex size-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
        >
          <ArrowUpRight className="size-3.5" />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-0.5 border-t px-3 py-1.5">
          {items.length === 0 ? (
            <p className={cn("py-1 text-xs text-muted-foreground", live && "satgas-shimmer")}>
              {live ? t.plotting : task.status === "done" ? t.actlog.none : t.actlog.empty}
            </p>
          ) : (
            <ActivityRows items={items} live={live} cwd={cwd} />
          )}
        </div>
      )}
    </li>
  );
}

const ACT_ICON = {
  skill: BookOpen,
  edit: FilePen,
  command: SquareTerminal,
  read: Eye,
  image: ImageIcon,
  search: Search,
  web: Globe,
  mcp: Plug,
  other: Wrench,
  canvas: Shapes,
  card: SquareDashedMousePointer,
  attached: Paperclip,
  upstream: CornerDownRight,
  memory: Brain,
  secret: KeyRound,
};
const SHOWS_PATH = new Set<Act["kind"]>(["read", "image", "edit", "attached"]);
const ROWS_SHOWN = 12;
type Row = Exclude<Item, { type: "group" }> | { type: "act"; act: Act };

// Everything an agent did, one row each and newest last, so nothing it read or ran hides behind a count.
function ActivityRows({ items, live, cwd }: { items: Item[]; live: boolean; cwd?: string }) {
  const [all, setAll] = useState(false);
  const rows = useMemo(() => items.flatMap<Row>((i) => (i.type === "group" ? i.acts.map((act) => ({ type: "act", act })) : [i])), [items]);
  const hidden = all ? 0 : Math.max(0, rows.length - ROWS_SHOWN);
  return (
    <div className="flex flex-col gap-0.5">
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex min-h-6 items-center gap-2 rounded-md text-start text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" />
          {t.actlog.earlier(hidden)}
        </button>
      )}
      {rows.slice(hidden).map((row, i) => {
        const key = hidden + i;
        const now = live && key === rows.length - 1;
        if (row.type === "act") return <ActRow key={key} act={row.act} live={now} cwd={cwd} />;
        if (row.type === "think") return <TraceRow key={key} Icon={Brain} live={now} body={row.text} />;
        if (row.type === "note") return <TraceRow key={key} Icon={Info} live={now} body={row.text} />;
        if (row.type === "error")
          return (
            <p key={key} className="py-0.5 text-xs text-destructive">
              {row.text}
            </p>
          );
        return (
          <div key={key} className="py-0.5 [&_*]:text-xs [&_*]:leading-5">
            <Markdown text={row.text} />
          </div>
        );
      })}
    </div>
  );
}

function ActRow({ act, live, cwd }: { act: Act; live: boolean; cwd?: string }) {
  const detail = actDetail(act);
  const short = cwd ? shortPath(detail, cwd) : detail;
  const path = SHOWS_PATH.has(act.kind) ? pathParts(short) : null;
  const runId = useRuns((s) => s.run?.id);
  // Opened, a step shows what it gave back, as a terminal or a viewer would: the output, and the picture it returned.
  const result =
    act.out || (act.image && runId) ? (
      <div className="flex flex-col gap-2">
        {act.out && (
          <pre
            className={cn(
              "nowheel max-h-64 overflow-auto rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-[18px] whitespace-pre text-muted-foreground",
              act.failed && "border-destructive/30 text-destructive",
            )}
          >
            {act.out}
          </pre>
        )}
        {act.image && runId && (
          <img
            src={`/api/runs/${runId}/assets/${act.image}`}
            alt=""
            loading="lazy"
            className="max-h-64 w-fit max-w-full rounded-md border object-contain"
          />
        )}
      </div>
    ) : undefined;
  return (
    <TraceRow
      Icon={ACT_ICON[act.kind]}
      live={live}
      verb={actVerb(act)}
      body={short}
      result={result}
      line={
        path ? (
          <>
            <span className="font-mono text-[11px] text-foreground/80">{path.name}</span>
            {path.dir && <span className="ms-1.5 font-mono text-[11px]">{path.dir}</span>}
          </>
        ) : undefined
      }
    />
  );
}

// One line that opens to its whole text, for the long command, path or thought a single row cuts short.
function TraceRow({
  Icon,
  verb,
  body,
  line,
  result,
  live,
}: {
  Icon: ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
  verb?: string;
  body: string;
  line?: ReactNode;
  // What opening the row shows under it, past the whole text: a step's output.
  result?: ReactNode;
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  const row = (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      className="group flex min-h-6 w-full items-start gap-2 rounded-md text-start text-xs leading-6 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Icon className="mt-[5px] size-3.5 shrink-0" aria-hidden="true" />
      <span className={cn("min-w-0 flex-1", open ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "truncate", live && "satgas-shimmer")}>
        {verb && <span className={cn(body && "me-1.5")}>{verb}</span>}
        {open || !line ? <span className={cn(verb !== undefined && "font-mono text-[11px]")}>{body}</span> : line}
      </span>
      <ChevronRight
        className={cn(
          "mt-[6px] size-3 shrink-0 opacity-0 transition-[transform,opacity] group-hover:opacity-100",
          open && "rotate-90 opacity-100",
        )}
      />
    </button>
  );
  if (!result) return row;
  return (
    <div>
      {row}
      {open && <div className="ms-[22px] mt-1 mb-1.5">{result}</div>}
    </div>
  );
}

// What the lead read before planning. It uses no tools, so this comes from what Satgas handed it.
function LeadTrace({ round, planning, cwd }: { round: number; planning: boolean; cwd?: string }) {
  const lines = useRuns((s) => s.logs.planner);
  const items = useMemo(() => timeline((lines ?? []).filter((l) => l.round === round && l.kind !== "text")), [lines, round]);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? planning;
  const count = items.reduce((n, i) => n + (i.type === "group" ? i.acts.length : 0), 0);
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setChosen(!open)}
        className="flex min-h-6 items-center gap-2 rounded-md text-start text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Eye className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">{t.actlog.lead(count)}</span>
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="ms-[7px] border-s ps-3">
          <ActivityRows items={items} live={planning} cwd={cwd} />
        </div>
      )}
    </div>
  );
}

// Long prompts fold to a few lines, like the reference chat; the full text is one click away.
// What was attached to a prompt, under its bubble: thumbnails for images, names for the rest; each opens in a tab.
function SentFiles({ run, files }: { run: Run; files: string[] }) {
  // Said once under the files when a vision model read the images for a model that cannot see.
  const notes = files.flatMap((f) => (run.imageNotes?.[f] ? [run.imageNotes[f]] : []));
  const by = notes.find((n) => n.by)?.by;
  const unread = notes.some((n) => n.error);
  return (
    <div className="ms-8 -mt-1.5 flex flex-col items-end gap-1">
      <SentList run={run} files={files} />
      {(by || unread) && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {by ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
          {by ? t.attach.readNote(by) : t.attach.unread}
        </p>
      )}
    </div>
  );
}

function SentList({ run, files }: { run: Run; files: string[] }) {
  return (
    <ul aria-label={t.attach.label} className="flex flex-wrap justify-end gap-1.5">
      {files.map((path) => {
        const name = path.split("/").pop() ?? path;
        const href = keyedSrc(`/api/runs/${run.id}/files/${path.split("/").map(encodeURIComponent).join("/")}`, run.id, run.fileKey);
        const image = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(name);
        return (
          <li key={path}>
            <OutboundLink
              href={href}
              title={name}
              className={cn(
                "flex overflow-hidden rounded-lg border bg-muted text-xs transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                image ? "size-14" : "h-7 max-w-48 items-center gap-1.5 px-2",
              )}
            >
              {image ? (
                <img src={href} alt={name} loading="lazy" className="size-full object-cover" />
              ) : (
                <>
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{name}</span>
                </>
              )}
            </OutboundLink>
          </li>
        );
      })}
    </ul>
  );
}

// A fold keeps ten lines in view, and only folds when it would hide at least three more; a short message stays whole.
const FOLD_LINES = 10;
const FOLD_SLACK = 3;

function useFold<T extends HTMLElement>(text: string, lineHeight: number, lines = FOLD_LINES) {
  const ref = useRef<T>(null);
  const [tall, setTall] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: new text can change the height while folded, which the observer cannot see.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // scrollHeight is the full text even while folded, so a resize can unfold it again.
    const measure = () => setTall(el.scrollHeight > lineHeight * (lines + FOLD_SLACK));
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, [text, lineHeight, lines]);
  return [ref, tall] as const;
}

function UserBubble({ text: sent, known }: { text: string; known: (kind: "/" | "@", name: string) => boolean }) {
  const [open, setOpen] = useState(false);
  // Passages cited from the chat open the message; they show as quotes, the words written after them as the message.
  const { quotes, rest: text } = useMemo(() => splitQuotes(sent), [sent]);
  const [ref, long] = useFold<HTMLParagraphElement>(text, 20);
  return (
    <div className="ms-8 flex flex-col items-end">
      <div className="flex max-w-full flex-col gap-1 rounded-2xl bg-muted px-3.5 py-2.5 text-sm">
        {quotes.map((q) => (
          <blockquote
            key={q}
            className="mb-1 line-clamp-3 border-s-2 border-foreground/20 ps-2.5 text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
          >
            {q}
          </blockquote>
        ))}
        <p ref={ref} className={cn("whitespace-pre-wrap [overflow-wrap:break-word]", long && !open && "line-clamp-10")}>
          <TokenText text={text} known={known} links />
        </p>
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

const NONE: string[] = [];

// Ink the person drew since the lead last read the board goes with the message as a picture, with the cards it marks,
// because a stroke's meaning (a word, an arrow, a circle) only shows when someone looks at it.
async function sketchAttachment(run: Run): Promise<string | null> {
  const cards = run.board?.cards ?? [];
  const ink = cards.filter((c) => c.kind === "drawing" && !c.from && c.createdAt > (run.canvasReadAt ?? 0));
  if (!ink.length) return null;
  const touches = (a: Card, b: Card) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const marked = cards.filter((c) => c.kind !== "drawing" && c.kind !== "frame" && ink.some((d) => touches(d, c)));
  const png = await requestSnapshot([...ink, ...marked].map((c) => c.id));
  if (!png) return null;
  try {
    const blob = await (await fetch(png)).blob();
    return await uploadAttachment({ name: `canvas-sketch-${Date.now().toString(36)}.png`, type: "image/png", blob });
  } catch {
    return null;
  }
}

// What the next message is about: the cards selected on the board, by name, with a way to leave them out.
function ContextChip({ cards, ids, onClear }: { cards: Card[]; ids: string[]; onClear: () => void }) {
  const picked = ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);
  if (!picked.length) return null;
  const shown = picked.slice(0, 2);
  const rest = picked.slice(2);
  const name = (c: Card) => cardLabel(c) || kindName(c);
  const link =
    "min-w-0 truncate rounded text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  return (
    <div className="flex items-center gap-1.5 px-2.5 pt-2 text-xs">
      <span className="flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-muted ps-2 pe-1 text-muted-foreground">
        <SquareDashedMousePointer className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="shrink-0">{t.chat.context}</span>
        {/* Each name takes the board to its card. */}
        {shown.map((c, i) => (
          <span key={c.id} className="flex min-w-0 items-center">
            <button type="button" onClick={() => focusOnBoard(c.id)} title={name(c)} className={link}>
              {name(c)}
            </button>
            {i < shown.length - 1 && <span aria-hidden="true">,</span>}
          </span>
        ))}
        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => rest[0] && focusOnBoard(rest[0].id)}
            title={rest.map(name).join(", ")}
            className="shrink-0 rounded tabular-nums hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            +{rest.length}
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          aria-label={t.chat.clearContext}
          title={t.chat.clearContext}
          className="flex size-4 shrink-0 items-center justify-center rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3" />
        </button>
      </span>
    </div>
  );
}

// The cards a sent message was about, under its bubble; each one takes the board to it.
function SentContext({ cards, ids }: { cards: Card[]; ids: string[] }) {
  const shown = ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);
  if (!shown.length) return null;
  return (
    <div className="ms-8 flex flex-wrap items-center justify-end gap-1 text-[11px] text-muted-foreground">
      <SquareDashedMousePointer className="size-3 shrink-0" aria-hidden="true" />
      {shown.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => focusOnBoard(c.id)}
          className="max-w-40 truncate rounded px-1 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {cardLabel(c) || kindName(c)}
        </button>
      ))}
    </div>
  );
}

// Messages sent while the team works, together in one bubble like Claude Code's queue, with where they went: straight to
// the teammates working now, or to the next round when nobody could take them yet. One still waiting can be reworded,
// moved up or taken back.
function QueuedBubble({
  runId,
  items,
  known,
}: {
  runId: string;
  items: QueuedPrompt[];
  known: (kind: "/" | "@", name: string) => boolean;
}) {
  const heard = [...new Set(items.flatMap((q) => q.heard ?? []))];
  const reading = items.some((q) => q.reading);
  const replies = items.flatMap((q) => (q.reply ? [q.reply] : []));
  return (
    <div className="flex flex-col gap-3">
      <div className="ms-8 flex flex-col items-end gap-1">
        <div className="flex min-w-0 max-w-full flex-col gap-2 rounded-2xl border border-dashed px-3.5 py-2.5 text-sm text-muted-foreground">
          <span className="sr-only">{t.chat.queued}: </span>
          {items.map((q, i) => (
            <QueuedItem key={q.id} runId={runId} item={q} before={i > 0 ? items[i - 1]?.id : undefined} known={known} />
          ))}
        </div>
        <p className={cn("text-[11px] text-muted-foreground", reading && "satgas-shimmer")}>
          {reading ? t.chat.leadReading : heard.length ? t.chat.passedTo(heard.join(", ")) : t.chat.nextRound}
        </p>
      </div>
      {replies.map((r) => (
        <Report key={r} text={r} />
      ))}
    </div>
  );
}

// Messages the lead answered mid-work stay where they were sent, with the lead's answer and who else heard them.
function AsideList({ run, asides }: { run: Run; asides: Aside[] }) {
  const known = knownFromRefs(undefined, run.board?.cards);
  return (
    <>
      {asides.map((a) => (
        <div key={a.id} className="flex flex-col gap-3">
          <div className="flex flex-col items-end gap-1">
            <UserBubble text={a.prompt} known={known} />
            {a.heard?.length ? <p className="text-[11px] text-muted-foreground">{t.chat.passedTo(a.heard.join(", "))}</p> : null}
          </div>
          <Report text={a.reply} />
        </div>
      ))}
    </>
  );
}

function QueuedItem({
  runId,
  item,
  before,
  known,
}: {
  runId: string;
  item: QueuedPrompt;
  before?: string;
  known: (kind: "/" | "@", name: string) => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.prompt);
  const [busy, setBusy] = useState(false);
  const waiting = !item.sent?.length;
  const run = (job: Promise<unknown>, after?: () => void) => {
    setBusy(true);
    void job
      .then(() => after?.())
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  };
  if (editing)
    return (
      <form
        className="flex flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(editQueued(runId, item.id, text), () => setEditing(false));
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          aria-label={t.queue.edit}
          rows={Math.min(6, text.split("\n").length + 1)}
          // biome-ignore lint/a11y/noAutofocus: the person just asked to edit this message.
          autoFocus
          className="w-full resize-none rounded-lg border bg-background px-2.5 py-1.5 text-[13px] leading-5 text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <div className="flex justify-end gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setEditing(false)}>
            {t.queue.cancel}
          </Button>
          <Button type="submit" size="sm" className="h-7" disabled={busy || !text.trim()}>
            {t.queue.save}
          </Button>
        </div>
      </form>
    );
  const action = "size-6 text-muted-foreground hover:text-foreground [&_svg]:size-3.5";
  const { quotes, rest } = splitQuotes(item.prompt);
  return (
    <div className="group/queued relative">
      {quotes.map((q) => (
        <blockquote key={q} className="mb-1 line-clamp-2 border-s-2 border-foreground/20 ps-2.5 text-xs leading-5 whitespace-pre-wrap">
          {q}
        </blockquote>
      ))}
      <p className="line-clamp-6 whitespace-pre-wrap [overflow-wrap:break-word]">
        <TokenText text={rest} known={known} links />
      </p>
      {waiting && (
        <div className="absolute -top-1 -right-2 flex items-center rounded-lg border bg-card opacity-0 shadow-xs transition-opacity group-hover/queued:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={t.queue.edit}
            title={t.queue.edit}
            className={action}
            onClick={() => {
              setText(item.prompt);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
          {before && (
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={t.queue.moveUp}
              title={t.queue.moveUp}
              className={action}
              onClick={() => run(moveQueued(runId, item.id, before))}
            >
              <ArrowUp />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={t.queue.remove}
            title={t.queue.remove}
            className={action}
            onClick={() => run(unqueuePrompt(runId, item.id))}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}

const ORIGIN_ICON = { channel: MessageCircle, connect: Plug, pull: GitPullRequest, schedule: CalendarClock, webhook: Webhook } as const;

// A round nobody typed says what started it: a watched pull request, a schedule or a webhook.
function OriginLine({ origin }: { origin: RoundOrigin }) {
  const Icon = ORIGIN_ICON[origin.kind];
  return (
    <p className="ms-8 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{t.origin[origin.kind](origin.label)}</span>
    </p>
  );
}

// Secrets agents asked for in this round: a private field while one waits, a quiet line once it is settled.
function SecretList({ run, asks, people }: { run: Run; asks: SecretAsk[]; people: Map<string, Member> }) {
  const nameOf = (nodeId: string) => {
    const node = run.nodes.find((n) => n.id === nodeId);
    return node ? (people.get(memberIdOf(node))?.name ?? node.role) : nodeId;
  };
  return (
    <div className="flex flex-col gap-2">
      {asks.map((a) =>
        a.state === "waiting" ? (
          <SecretCard key={a.id} runId={run.id} ask={a} who={nameOf(a.nodeId)} />
        ) : (
          <p key={a.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {a.state === "given" && (a.until ?? 0) > Date.now() ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {a.state === "given"
                ? (a.until ?? 0) > Date.now()
                  ? t.secret.given(a.label)
                  : t.secret.gone(a.label)
                : a.state === "declined"
                  ? t.secret.declined(a.label)
                  : t.secret.expired(a.label)}
            </span>
          </p>
        ),
      )}
    </div>
  );
}

// Tasks the lead held because they are hard to undo: one waiting gets its Allow here, answered ones leave a line.
function ApprovalList({ run, tasks, people }: { run: Run; tasks: NodeState[]; people: Map<string, Member> }) {
  return (
    <div className="flex flex-col gap-2">
      {tasks
        .filter((n) => n.approval && (n.held || n.approved))
        .map((n) =>
          n.held ? (
            <ApprovalCard key={n.id} runId={run.id} task={n} who={people.get(memberIdOf(n))?.name ?? n.role} />
          ) : (
            <p key={n.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{n.approved === "allowed" ? t.approval.allowed(n.title) : t.approval.declined(n.title)}</span>
            </p>
          ),
        )}
    </div>
  );
}

export function ApprovalCard({ runId, task, who }: { runId: string; task: NodeState; who: string }) {
  const [busy, setBusy] = useState(false);
  const answer = (allow: boolean) => {
    setBusy(true);
    void approveTask(runId, task.id, allow)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-signal/50 px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
          {t.approval.asks(who)}
        </p>
        <p className="text-sm font-medium">{task.title}</p>
        <p className="text-xs text-muted-foreground">{task.approval}</p>
      </div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">{t.approval.hint}</p>
        <Button type="button" variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => answer(false)}>
          {t.approval.decline}
        </Button>
        <Button type="button" size="sm" className="h-7" disabled={busy} onClick={() => answer(true)}>
          {t.approval.allow}
        </Button>
      </div>
    </div>
  );
}

export function SecretCard({ runId, ask, who }: { runId: string; ask: SecretAsk; who: string }) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const answer = (body: { value: string } | { decline: true }) => {
    setBusy(true);
    void answerSecret(runId, ask.id, body)
      .then(() => setValue(""))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-signal/50 bg-card px-3.5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) answer({ value });
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-sm font-medium break-words">{ask.label}</p>
          <p className="shrink-0 text-[11px] text-muted-foreground">{t.secret.asks(who)}</p>
        </div>
        {ask.reason && <p className="text-xs leading-5 text-muted-foreground">{ask.reason}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type={shown ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={ask.hint || t.secret.placeholder}
            aria-label={ask.label}
            // "off" is ignored on password fields; this keeps saved logins from filling a value meant for an agent.
            autoComplete="new-password"
            spellCheck={false}
            className="h-8 w-full rounded-lg border bg-background ps-2.5 pe-8 font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? t.secret.hide : t.secret.show}
            title={shown ? t.secret.hide : t.secret.show}
            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
        <Button type="submit" className="shrink-0" disabled={busy || !value.trim()}>
          {t.secret.give}
        </Button>
      </div>
      <div className="flex items-start gap-1.5">
        <ShieldCheck className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[11px] leading-4 text-muted-foreground">{t.secret.privacy}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => answer({ decline: true })}
          className="shrink-0 rounded text-[11px] leading-4 font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          {t.secret.decline}
        </button>
      </div>
    </form>
  );
}

// The report reads whole, at 13px on airy 22px lines capped near 68 characters a line; nothing folds it away.
function Report({ text, onOpen, page }: { text: string; onOpen?: () => void; page?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* The full-width chat reads like a document, so it gets body size; the side panel stays compact. */}
      <Markdown
        text={text}
        className={cn("max-w-[68ch] gap-4 text-foreground", page ? "text-sm leading-6" : "text-[13px] leading-[22px]")}
      />
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="w-fit rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t.chat.openReport}
        </button>
      )}
    </div>
  );
}

// The board's one door: the next prompt, with the same + menu and model picker as Home; Stop while agents work.
function ChatComposer({ run, live, onSent }: { run: Run; live: boolean; onSent: () => void }) {
  // Kept per board, so a reload or another tab shows the same unsent message and files.
  const saved = useDraft(`board:${run.id}`);
  const draft = saved.text;
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { over, handlers } = useFileDrop(saved);
  const sight = useSight(saved.files);
  const catalog = useTokenCatalog(run);
  const needsProvider = useNeedsProvider();

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

  // The cards selected on the board ride along as the message's context, unless the person set them aside.
  const selection = useSelection((st) => (st.runId === run.id ? st.ids : NONE));
  const [setAside, setSetAside] = useState("");
  const context = selection.join(",") === setAside ? NONE : selection;
  const quotes = useBoardQuotes(run.id);
  const send = async () => {
    const written = draft.trim();
    if (!written || sending || needsProvider) return;
    const prompt = withQuotes(written, quotes);
    setSending(true);
    try {
      const attachments = await Promise.all(saved.files.map(uploadAttachment));
      const sketch = await sketchAttachment(run);
      await sendPrompt(run.id, prompt, sketch ? [...attachments, sketch] : attachments, context);
      saved.clear();
      clearQuotes(run.id);
      onSent();
    } catch (e) {
      // The draft and its files stay so they can be sent again.
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
      {...handlers}
      className={cn(
        "relative m-2 mt-0 flex shrink-0 flex-col rounded-xl border bg-background transition-colors focus-within:border-foreground/25",
        over && "border-signal/60 focus-within:border-signal/60",
      )}
    >
      {over && <DropHint />}
      {needsProvider && <ProviderNotice />}
      {context.length > 0 && <ContextChip cards={run.board?.cards ?? []} ids={context} onClear={() => setSetAside(selection.join(","))} />}
      <QuoteChips runId={run.id} />
      <AttachmentTiles files={saved.files} onRemove={saved.removeFile} compact />
      <SightNote sight={sight} compact />
      <label htmlFor="next-prompt" className="sr-only">
        {t.nextPrompt}
      </label>
      <TokenField
        id="next-prompt"
        fieldRef={field}
        catalog={catalog}
        rows={2}
        value={draft}
        placeholder={live ? t.agentsWorking : t.nextPrompt}
        onValueChange={saved.setText}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-5 outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1 px-1.5 pt-1 pb-1.5">
        <ComposerMenu
          onAddFiles={() => picker.current?.click()}
          onSkill={(name) => {
            const token = `/${name}`;
            if (!draft.split(/\s+/).includes(token)) saved.setText(`${token} ${draft.trimStart()}`);
            field.current?.focus();
          }}
        />
        <ModelPicker />
        {/* While the team works, Stop sits beside Send: a message sent now waits its turn. */}
        {live && (
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
        )}
        <Button
          type="submit"
          size="icon"
          disabled={!draft.trim() || sending || needsProvider}
          aria-label={t.send}
          title={live ? `${t.send} · ${t.chat.queuedHint}` : t.send}
          className={cn(
            "size-8 rounded-full bg-signal text-signal-foreground hover:bg-signal/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100",
            !live && "ms-auto",
          )}
        >
          <ArrowUp />
        </Button>
      </div>
      <FilePicker inputRef={picker} onFiles={(files) => void attach(saved, files)} />
    </form>
  );
}
