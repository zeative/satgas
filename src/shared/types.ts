import type { Board, BoardOp, CardKind } from "./board";

export type AgentKind = "claude" | "codex";

export type NodeStatus = "pending" | "running" | "done" | "failed" | "skipped" | "cancelled";

export type RunStatus = "planning" | "running" | "done" | "failed" | "cancelled";

export interface PlanNode {
  id: string;
  title: string;
  role: string;
  agent: AgentKind;
  task: string;
  dependsOn: string[];
}

export interface Plan {
  title: string;
  summary: string;
  nodes: PlanNode[];
}

export interface LogLine {
  // Per-run sequence number; lets clients drop lines they already got in a snapshot.
  seq: number;
  t: number;
  kind: "text" | "tool" | "error" | "info";
  text: string;
}

export interface NodeState extends PlanNode {
  status: NodeStatus;
  startedAt?: number;
  endedAt?: number;
  output?: string;
  error?: string;
  // Upstream node whose failure caused this node to be skipped.
  blockedBy?: string;
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
  // Added by the server for the page, never saved: the key its file URLs carry (sandboxed previews can't send the
  // sign-in cookie), and whether its workspace is its own, so deleting the board deletes those files too.
  fileKey?: string;
  ownWorkspace?: boolean;
}

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
}

// "planner" is the pseudo node id for the Komandan's own log stream.
export type ServerEvent =
  | { type: "snapshot"; run: Run; logs: Record<string, LogLine[]> }
  | { type: "run"; id: string; patch: Partial<Run> }
  | { type: "node"; runId: string; id: string; patch: Partial<NodeState> }
  | { type: "logs"; runId: string; batch: Record<string, LogLine[]> }
  | { type: "summary"; run: RunSummary }
  | { type: "removed"; id: string }
  // origin lets the tab that made the change skip its own echo.
  | { type: "board"; runId: string; ops: BoardOp[]; origin?: string };

export type ClientMessage = { type: "watch"; runId: string | null };

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

// A board icon is one emoji (with its modifiers and joiners), never free text.
export function cleanIcon(v: unknown): string | null {
  if (v === "" || v === null) return "";
  if (typeof v !== "string" || v.length > 16 || !/^\p{Extended_Pictographic}/u.test(v)) return null;
  return /[\p{L}\p{N}\s]/u.test(v.replace(/[\u200d\ufe0f\u{1f3fb}-\u{1f3ff}]/gu, "")) ? null : v;
}
