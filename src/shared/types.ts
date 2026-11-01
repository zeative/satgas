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
}

export interface RunSummary {
  id: string;
  title?: string;
  prompt: string;
  cwd: string;
  status: RunStatus;
  createdAt: number;
  endedAt?: number;
  nodeCount: number;
}

// "planner" is the pseudo node id for the Komandan's own log stream.
export type ServerEvent =
  | { type: "snapshot"; run: Run; logs: Record<string, LogLine[]> }
  | { type: "run"; id: string; patch: Partial<Run> }
  | { type: "node"; runId: string; id: string; patch: Partial<NodeState> }
  | { type: "logs"; runId: string; batch: Record<string, LogLine[]> }
  | { type: "summary"; run: RunSummary }
  | { type: "removed"; id: string };

export type ClientMessage = { type: "watch"; runId: string | null };
