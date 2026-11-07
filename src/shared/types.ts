import type { Board, BoardOp, CardKind } from "./board";
import type { BoardEdit, CanvasEvent, EditCommand } from "./board-edit";
import type { Recovery } from "./failures";
import type { MemoryCommand, MemoryRecord } from "./memory";
import type { Lane } from "./pipeline";
import type { Asked, Question } from "./questions";
import type { Refs } from "./refs";
import type { SecretAsk } from "./secrets";
import type { ChatSession } from "./sessions";
import type { SetupCommand, SetupRecord } from "./setup";
import type { TeamTalk } from "./talk";
import type { Hire, Member } from "./team";

export type AgentKind = "claude" | "codex";

export type NodeStatus = "pending" | "running" | "done" | "failed" | "skipped" | "cancelled";

// asking: the planner put questions to the person and waits for the answers before it plans.
export type RunStatus = "planning" | "asking" | "running" | "done" | "failed" | "cancelled";

export interface PlanNode {
  id: string;
  title: string;
  role: string;
  agent: AgentKind;
  task: string;
  dependsOn: string[];
  // The team member the lead gave this task to; older boards have none.
  member?: string;
  // read: the task only looks (lookups, research, reviews) and gets no file-editing tools; absent means it may write.
  access?: "read" | "write";
  // Why the task needs the person's Allow before it starts: something outside the workspace that is hard to undo.
  approval?: string;
}

export interface Plan {
  // Tokens the lead spent on this plan, as its CLI reported them.
  usage?: Usage;
  title: string;
  summary: string;
  nodes: PlanNode[];
  // A request that needs no work (a greeting, a quick question) is answered here instead, with no tasks.
  reply?: string;
  // Asked instead of planning when the request leaves open a choice that changes the work; no tasks then.
  questions?: Question[];
  // People the lead hires for this request because nobody on the team fits the work.
  hires?: Hire[];
  // Changes the lead makes to the canvas itself (delete, move, arrange, edit, connect), applied before any task runs.
  board?: EditCommand[];
  // Satgas setup the lead changes from the person's message (connectors, skills, tools, agents), applied before tasks.
  setup?: SetupCommand[];
  // What the lead learned about the person or turned into a rule from this message.
  memory?: MemoryCommand[];
  // Work the person asked to happen on its own (every morning, every hour), set up as this board's schedules.
  schedules?: PlannedSchedule[];
}

// every: minutes between runs, or 0 for a time of day (at, on the weekdays given, 0 is Sunday; none means every day).
export interface PlannedSchedule {
  title: string;
  prompt: string;
  every: number;
  at: string;
  weekdays: number[];
}

export interface LogLine {
  // Per-run sequence number; lets clients drop lines they already got in a snapshot.
  seq: number;
  t: number;
  kind: "text" | "think" | "tool" | "error" | "info";
  text: string;
  // On the lead's lines, which all share one log: the round they belong to.
  round?: number;
}

// The lead's plan while it is being written, so the chat shows it take shape instead of a still label.
export interface PlanDraft {
  round: number;
  thinking?: string;
  summary?: string;
  reply?: string;
  hires: { name: string; role: string }[];
  tasks: { title: string; member?: string }[];
  questions: string[];
  // Memories and rules the lead is saving, as it writes them.
  memory?: { op: "remember" | "rule" | "forget"; text: string }[];
  // Changes to the canvas and to Satgas's setup, as it writes them: every action shows before it happens.
  board?: { op: string; count: number }[];
  setup?: { op: string; name: string; on?: boolean }[];
}

// Tokens one agent run spent: everything it read (cached included) and what it wrote.
export interface ModelUsage {
  // Input that was neither read from nor written to the cache.
  input: number;
  read: number;
  write: number;
  output: number;
  // The CLI's own figure at list price; absent where it does not apply, like a gateway or Codex.
  cost?: number;
}

export interface Usage {
  // All input, cached included.
  input: number;
  cached: number;
  output: number;
  byModel?: Record<string, ModelUsage>;
}

export interface NodeState extends PlanNode {
  status: NodeStatus;
  // Waiting for the person's Allow (see approval), since when; and how they answered.
  held?: number;
  approved?: "allowed" | "declined";
  startedAt?: number;
  endedAt?: number;
  output?: string;
  error?: string;
  // Upstream node whose failure caused this node to be skipped.
  blockedBy?: string;
  // A failure of the system around the work (provider, key, network): what it was and where the task ran again.
  recovery?: Recovery;
  // Tokens the task's agent spent, as its CLI reported them.
  usage?: Usage;
  // The Claude Code session the task ran in, so it can be continued with its whole history.
  session?: string;
  // The git branch holding this task's work when it could not be merged back (a conflict, or the task stopped).
  branch?: string;
  // The files the task changed, with the board-history checkpoints around it for diffs and undo.
  changes?: TaskChanges;
  // 0 for the first prompt, then one more for every follow-up prompt on the same board.
  round?: number;
  // Earlier-round tasks this one continues from; drawn as edges and passed as context, never scheduled on.
  after?: string[];
  x: number;
  y: number;
}

export interface Run {
  id: string;
  prompt: string;
  cwd: string;
  status: RunStatus;
  createdAt: number;
  endedAt?: number;
  title?: string;
  summary?: string;
  error?: string;
  nodes: NodeState[];
  board?: Board;
  // Follow-up prompts given on the board after the first one, oldest first.
  rounds?: string[];
  // When the current round started; createdAt for the first.
  startedAt?: number;
  // One emoji people pick for the board; "" or absent means none.
  icon?: string;
  // The person renamed the board, so the planner no longer names it.
  named?: boolean;
  // Added by the server for the page, never saved: the key its file URLs carry (sandboxed previews can't send the
  // sign-in cookie), and whether its workspace is its own, so deleting the board deletes those files too.
  fileKey?: string;
  ownWorkspace?: boolean;
  // Tokens the lead spent planning, by round, and when.
  leadUsage?: Record<number, Usage & { at: number }>;
  // Replies the planner gave instead of planning work, by round (0 is the first prompt).
  answers?: Record<number, string>;
  // Questions the planner asked before planning a round, with the person's answers once given.
  asks?: Record<number, Asked>;
  // What each round's `/` and `@` tokens pointed at.
  refs?: Record<number, Refs>;
  // Files attached to each round's prompt, as paths inside the workspace (`attachments/…`).
  files?: Record<number, string[]>;
  // The person's browser language (BCP 47), the tie-breaker when a prompt's own language is unclear.
  lang?: string;
  // Attached images a vision model described for agents whose model cannot see, by the image's path.
  imageNotes?: Record<string, ImageNote>;
  // The people the lead hired on this board, in hiring order.
  team?: Member[];
  // The lead's one-line plan for each round, by round.
  plans?: Record<number, string>;
  // What the lead and agents changed on the canvas in each round, with the way back.
  edits?: Record<number, BoardEdit>;
  // Setup the lead changed from the person's messages, by round: connectors, skills, tools and agents.
  setups?: Record<number, SetupRecord>;
  // What the team said to each other while working, by round: shared notes and short questions.
  talk?: Record<number, TeamTalk>;
  // The plan being written right now; gone once the lead is done.
  draft?: PlanDraft;
  // Messages sent while the team was working: delivered to running agents at once, then run together as the next round.
  queue?: QueuedPrompt[];
  // Per round: the teammates who already got that round's messages mid-task, so the lead plans only what is left.
  steered?: Record<number, string[]>;
  // Home organizing: kept on top, put away, or hidden until a time; and when the person last looked at the board.
  pinned?: boolean;
  archived?: boolean;
  snoozedUntil?: number;
  seenAt?: number;
  // The person asked to see it again as unread.
  markedUnread?: boolean;
  // Keys and passwords agents asked for mid-task, without the values.
  secrets?: SecretAsk[];
  // Set on a fork: the board it was copied from, which it can merge back into.
  forkOf?: ForkOf;
  // Pull requests this board's work opened or the person linked, and whether Satgas watches them.
  pulls?: PullLink[];
  // Rounds started by something other than the person typing, by round: a watched PR, a schedule, a webhook.
  origins?: Record<number, RoundOrigin>;
  // What the lead remembered or turned into a rule in each round, with the way back.
  memories?: Record<number, MemoryRecord>;
  // The person asked Satgas not to learn anything from this board.
  noMemory?: boolean;
  // Cards that were selected on the canvas when each round's message was sent: the context it is about.
  selected?: Record<number, string[]>;
  // What the person did on the canvas by hand, and when the lead last read it, so each plan hears only what is new.
  canvasLog?: CanvasEvent[];
  canvasReadAt?: number;
  // Chat sessions beyond the main one, and which session each round belongs to (absent means the main one).
  sessions?: ChatSession[];
  roundSessions?: Record<number, string>;
}

export interface GitInfo {
  repo: boolean;
  branch?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  // Files changed or new in the folder, not yet committed.
  dirty?: number;
  commits?: { sha: string; subject: string; author: string; at: number }[];
  // Branches Satgas made (task branches and forks), and whether they are already in the current branch.
  branches?: { name: string; merged: boolean; at: number }[];
}

export interface TaskChanges {
  // Commits in the board's own history before and after the task; missing when git was not available.
  before?: string;
  after?: string;
  // Paths relative to the board's folder.
  files: { path: string; change: "added" | "modified" | "deleted" }[];
  // Files the person put back as they were before the task.
  reverted?: string[];
}

export interface ForkOf {
  id: string;
  title: string;
  // The original's folder, which outlives the original board when it was a folder someone picked.
  cwd: string;
  // When it was forked, or last merged back.
  at: number;
  // The repository root and branch, when the fork is a git worktree.
  repo?: string;
  branch?: string;
}

export interface RoundOrigin {
  kind: "pull" | "schedule" | "webhook" | "channel" | "connect";
  // What started it, for the chat: "PR #12", or the schedule's title.
  label: string;
}

export interface PullLink {
  url: string;
  repo: string;
  number: number;
  title?: string;
  state?: "open" | "merged" | "closed";
  checks?: "pending" | "passing" | "failing" | "none";
  review?: "approved" | "changes" | "none";
  conflict?: boolean;
  // Watched: failed checks, new comments and reviews, and conflicts start a round that fixes them.
  watch: boolean;
  // Rounds the watch already started for this PR; it stops at a cap so a stubborn failure cannot loop forever.
  fixes: number;
  checkedAt?: number;
  // Why the last check could not be made (gh missing, not signed in).
  error?: string;
  // What was already acted on, so each problem starts one round only.
  seen: { failedSha?: string; conflictSha?: string; feedback: number };
}

export interface QueuedPrompt {
  id: string;
  prompt: string;
  origin?: RoundOrigin;
  // Cards selected on the canvas when it was sent.
  cards?: string[];
  // The chat session it was sent in; absent for the main one.
  session?: string;
  files?: string[];
  lang?: string;
  at: number;
  // Tasks it already reached while they worked (ids), and the teammates who got it (names, for the chat).
  sent?: string[];
  heard?: string[];
}

export interface ImageNote {
  // The description's path in the workspace, next to the image.
  file?: string;
  // The model that looked at the image.
  by?: string;
  // Why no description could be made.
  error?: string;
}

// A BCP 47 tag like `id-ID` or `en`, or nothing; it ends up inside prompts, so nothing else gets through.
export const cleanLang = (v: unknown): string | undefined =>
  typeof v === "string" && /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$/i.test(v) ? v : undefined;

// The language's English name for prompts ("Indonesian"), or the tag itself when the runtime does not know it.
export function langName(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag.split("-")[0] ?? tag) ?? tag;
  } catch {
    return tag;
  }
}

// Raster images a vision model can look at; an SVG is text any agent reads.
export const isPicture = (path: string) => /\.(png|jpe?g|gif|webp)$/i.test(path);

// Just enough of a board to draw its thumbnail on the home page.
export interface BoardPreview {
  tasks: { x: number; y: number; status: NodeStatus }[];
  // Pairs of indexes into `tasks`.
  links: [number, number][];
  cards: { x: number; y: number; w: number; h: number; kind: CardKind }[];
}

export interface RunSummary {
  id: string;
  title?: string;
  icon?: string;
  prompt: string;
  cwd: string;
  status: RunStatus;
  createdAt: number;
  endedAt?: number;
  nodeCount: number;
  preview?: BoardPreview;
  pinned?: boolean;
  archived?: boolean;
  snoozedUntil?: number;
  // For isUnread, which the page works out itself so a snooze ending shows without a push.
  seenAt?: number;
  markedUnread?: boolean;
  // False when the board works in a folder the person picked, whose files outlive it.
  ownWorkspace?: boolean;
}

// A board that matched a search, with the line it matched in.
export interface SearchHit {
  id: string;
  snippet: string;
}

// Unread: finished since last opened, back from a snooze since then, or marked so. Boards from before seenAt existed
// count as read.
export function isUnread(r: Pick<Run, "endedAt" | "seenAt" | "snoozedUntil" | "markedUnread">, now = Date.now()): boolean {
  if (r.markedUnread) return true;
  if (r.seenAt === undefined) return false;
  if (r.endedAt && r.endedAt > r.seenAt) return true;
  return !!r.snoozedUntil && r.snoozedUntil <= now && r.snoozedUntil > r.seenAt;
}

// "planner" is the pseudo node id for the Komandan's own log stream.
export type ServerEvent =
  | { type: "snapshot"; run: Run; logs: Record<string, LogLine[]> }
  | { type: "run"; id: string; patch: Partial<Run> }
  | { type: "node"; runId: string; id: string; patch: Partial<NodeState> }
  | { type: "logs"; runId: string; batch: Record<string, LogLine[]> }
  | { type: "summary"; run: RunSummary }
  | { type: "removed"; id: string }
  | { type: "lane"; lane: Lane }
  // origin lets the tab that made the change skip its own echo.
  | { type: "board"; runId: string; ops: BoardOp[]; origin?: string };

export type ClientMessage = { type: "watch"; runId: string | null } | { type: "pipeline"; on: boolean };

export interface ModelInfo {
  id: string;
  name: string;
  // One quiet line from the source itself (Codex's description, a context size, a model size); never invented.
  desc?: string;
  // Reasoning levels the model takes, when the provider says.
  efforts?: string[];
  defaultEffort?: string;
}

// off: not set up, so hidden; failed: set up but the check did not pass, shown disabled with the reason.
export interface ProviderStatus {
  kind: import("./providers").ProviderKind;
  state: "ok" | "failed" | "off";
  error?: string;
  models: ModelInfo[];
}

// A board name people type: one line, at most 80 characters; null when nothing is left after trimming.
export function cleanTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const title = v.replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return title || null;
}

// A board icon is one emoji (with its modifiers and joiners), never free text.
export function cleanIcon(v: unknown): string | null {
  if (v === "" || v === null) return "";
  if (typeof v !== "string" || v.length > 16 || !/^\p{Extended_Pictographic}/u.test(v)) return null;
  return /[\p{L}\p{N}\s]/u.test(v.replace(/[\u200d\ufe0f\u{1f3fb}-\u{1f3ff}]/gu, "")) ? null : v;
}
