import type { Plan, PlanNode } from "./types";

// Sized for the React Flow UI task node (w-60) so columns and rows never overlap.
export const NODE_W = 240;
export const NODE_H = 104;
const GAP_X = 88;
const GAP_Y = 32;

export const MAX_NODES = 12;

export function validatePlan(plan: Plan): string | null {
  if (!plan.nodes?.length) return "The plan contains no tasks.";
  if (plan.nodes.length > MAX_NODES) return `The plan is too large (${plan.nodes.length} tasks, max ${MAX_NODES}).`;
  const ids = new Set<string>();
  for (const n of plan.nodes) {
    if (!n.id) return "A task is missing its id.";
    if (ids.has(n.id)) return `Duplicate task id: ${n.id}.`;
    ids.add(n.id);
  }
  for (const n of plan.nodes) {
    for (const d of n.dependsOn) {
      if (!ids.has(d)) return `Task ${n.id} depends on unknown task ${d}.`;
      if (d === n.id) return `Task ${n.id} depends on itself.`;
    }
  }
  if (depths(plan.nodes) === null) return "The plan has a dependency cycle.";
  return null;
}

// Longest-path depth per node; null when the graph has a cycle.
export function depths(nodes: PlanNode[]): Map<string, number> | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number | null => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return null;
    visiting.add(id);
    let d = 0;
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      const dd = visit(dep);
      if (dd === null) return null;
      d = Math.max(d, dd + 1);
    }
    visiting.delete(id);
    memo.set(id, d);
    return d;
  };
  for (const n of nodes) if (visit(n.id) === null) return null;
  return memo;
}

// Left-to-right layered layout; each column is vertically centered against the tallest one.
export function layout<T extends PlanNode>(nodes: T[]): (T & { x: number; y: number })[] {
  const d = depths(nodes);
  const column = (n: T, i: number) => (d ? (d.get(n.id) ?? 0) : i);
  const cols = new Map<number, T[]>();
  nodes.forEach((n, i) => {
    const c = column(n, i);
    cols.set(c, [...(cols.get(c) ?? []), n]);
  });
  const tallest = Math.max(...[...cols.values()].map((c) => c.length));
  return nodes.map((n, i) => {
    const c = column(n, i);
    const col = cols.get(c) ?? [n];
    const offset = ((tallest - col.length) * (NODE_H + GAP_Y)) / 2;
    return { ...n, x: c * (NODE_W + GAP_X), y: offset + col.indexOf(n) * (NODE_H + GAP_Y) };
  });
}

// Stable call signs (T-01, T-02, …) in reading order: column first, then row.
export function taskCodes(nodes: { id: string; x: number; y: number }[]): Map<string, string> {
  const ordered = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  return new Map(ordered.map((n, i) => [n.id, `T-${String(i + 1).padStart(2, "0")}`]));
}

// The tasks of the latest prompt on the board.
export function latestRound<T extends { round?: number }>(nodes: T[]): T[] {
  const last = Math.max(0, ...nodes.map((n) => n.round ?? 0));
  return nodes.filter((n) => (n.round ?? 0) === last);
}

export function sinks<T extends PlanNode>(nodes: T[]): T[] {
  const used = new Set(nodes.flatMap((n) => n.dependsOn));
  return nodes.filter((n) => !used.has(n.id));
}
