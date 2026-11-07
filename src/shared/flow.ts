import type { Card } from "./board";
import type { NodeState } from "./types";

export interface FlowLink {
  id: string;
  source: string;
  target: string;
}

// The card that stands for a task in the flow: the first one it made, so a later screenshot never takes its place.
function anchors(cards: Card[]): Map<string, string> {
  const first = new Map<string, Card>();
  for (const c of cards) {
    if (!c.from || c.kind === "drawing") continue;
    const seen = first.get(c.from);
    if (!seen || c.createdAt < seen.createdAt || (c.createdAt === seen.createdAt && (c.y < seen.y || (c.y === seen.y && c.x < seen.x))))
      first.set(c.from, c);
  }
  return new Map([...first].map(([task, c]) => [task, c.id]));
}

// The cards a task's work came from: those of the tasks it waited on (`dependsOn`) or continued from an earlier round
// (`after`). A task that made no card passes its own inputs through, so a chain never breaks at a step that only ran
// commands.
export function flowSources(nodes: NodeState[], cards: Card[]): (taskId: string) => string[] {
  const anchor = anchors(cards);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, string[]>();
  const sourcesOf = (id: string, path: Set<string>): string[] => {
    const hit = memo.get(id);
    if (hit) return hit;
    const node = byId.get(id);
    if (!node || path.has(id)) return [];
    path.add(id);
    const found = new Set<string>();
    for (const up of [...node.dependsOn, ...(node.after ?? [])]) {
      const card = anchor.get(up);
      if (card) found.add(card);
      else for (const c of sourcesOf(up, path)) found.add(c);
    }
    path.delete(id);
    const list = [...found];
    memo.set(id, list);
    return list;
  };
  return (taskId) => sourcesOf(taskId, new Set());
}

// How the work flowed, card to card: each task's first card, from the cards its work came from.
export function flowLinks(nodes: NodeState[], cards: Card[]): FlowLink[] {
  const anchor = anchors(cards);
  const sources = flowSources(nodes, cards);
  const links: FlowLink[] = [];
  for (const node of nodes) {
    const target = anchor.get(node.id);
    if (!target) continue;
    for (const source of sources(node.id)) if (source !== target) links.push({ id: `flow:${source}>${target}`, source, target });
  }
  return links;
}
