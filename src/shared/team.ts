import type { AgentKind, NodeState, PlanNode, Run } from "./types";

// A person on the board's team. The lead hires them the first time a request needs their kind of work; they stay for
// every later round, idle until they are given a task again.
export interface Member {
  // Lowercase, unique on the board; also the avatar's seed, so a member keeps one face.
  id: string;
  name: string;
  role: string;
  // Standing instructions: what they are good at and how they work, not about any one task.
  brief: string;
  agent: AgentKind;
  hiredAt: number;
  round: number;
}

// A new member as the lead writes them in a plan.
export interface Hire {
  id: string;
  name: string;
  role: string;
  brief: string;
  agent: AgentKind;
}

export const MAX_TEAM = 12;
export const LEAD_ID = "lead";
const PERSON_PREFIX = "m:";

export const personId = (memberId: string) => `${PERSON_PREFIX}${memberId}`;
export const memberOfPerson = (nodeId: string) => (nodeId.startsWith(PERSON_PREFIX) ? nodeId.slice(PERSON_PREFIX.length) : null);
export const isTeamNode = (nodeId: string) => nodeId === LEAD_ID || nodeId.startsWith(PERSON_PREFIX);

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40) || "member";

// Tasks planned before teams existed have no member; each distinct role stands in as one.
export const memberIdOf = (node: Pick<PlanNode, "role"> & { member?: string }) => node.member ?? `role-${slug(node.role)}`;

// The board's team in hiring order, with stand-ins for older tasks that were never given to a member.
export function crew(run: Pick<Run, "team" | "nodes" | "createdAt">): Member[] {
  const team = [...(run.team ?? [])];
  const known = new Set(team.map((m) => m.id));
  for (const n of run.nodes) {
    const id = memberIdOf(n);
    if (known.has(id)) continue;
    known.add(id);
    team.push({ id, name: n.role, role: n.role, brief: "", agent: n.agent, hiredAt: n.startedAt ?? run.createdAt, round: n.round ?? 0 });
  }
  return team;
}

// Cleans the lead's hires against the team already there: valid ids, no clash, at most MAX_TEAM people in all.
export function cleanHires(raw: unknown, team: Member[], agents: AgentKind[]): Hire[] {
  if (!Array.isArray(raw)) return [];
  const taken = new Set(team.map((m) => m.id));
  const out: Hire[] = [];
  for (const h of raw) {
    if (team.length + out.length >= MAX_TEAM) break;
    if (!h || typeof h !== "object") continue;
    const { id, name, role, brief, agent } = h as Record<string, unknown>;
    const cleanName = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    const cleanRole = typeof role === "string" ? role.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const key = typeof id === "string" && /^[a-z0-9-]{1,40}$/.test(id) ? id : slug(cleanName);
    if (!cleanName || !cleanRole || taken.has(key)) continue;
    taken.add(key);
    const kind = agent === "claude" || agent === "codex" ? agent : undefined;
    out.push({
      id: key,
      name: cleanName,
      role: cleanRole,
      brief: typeof brief === "string" ? brief.trim().slice(0, 2000) : "",
      agent: kind && agents.includes(kind) ? kind : (agents[0] ?? "claude"),
    });
  }
  return out;
}

// What a member is doing in the board's latest round, the one the canvas shows under their face.
export type PersonState = "working" | "waiting" | "failed" | "done" | "idle";

export function currentTask(memberId: string, nodes: NodeState[]): NodeState | undefined {
  const latest = Math.max(0, ...nodes.map((n) => n.round ?? 0));
  const mine = nodes.filter((n) => memberIdOf(n) === memberId && (n.round ?? 0) === latest);
  const by = (s: NodeState["status"]) => mine.filter((n) => n.status === s);
  return by("running")[0] ?? by("pending")[0] ?? by("failed")[0] ?? [...mine].sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
}

export function personState(task: NodeState | undefined): PersonState {
  if (!task) return "idle";
  if (task.status === "running") return "working";
  if (task.status === "pending") return "waiting";
  if (task.status === "failed") return "failed";
  return task.status === "done" ? "done" : "idle";
}

// The member's most relevant task to open: what they do now, else the last thing they did on the board.
export function taskToOpen(memberId: string, nodes: NodeState[]): NodeState | undefined {
  const mine = nodes.filter((n) => memberIdOf(n) === memberId);
  return currentTask(memberId, nodes) ?? mine.sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
}

// Footprints the canvas draws the team at; the shelf for results starts below them.
export const LEAD_W = 240;
export const LEAD_H = 152;
export const PERSON_W = 192;
export const PERSON_H = 236;
const COL_GAP = 24;
const ROW_GAP = 64;
// The team sits above y = 0, so boards made before teams keep their cards clear of it.
const TEAM_BOTTOM = -48;

type Pt = { x: number; y: number };

// The lead centred over one row of members in hiring order; a hire joins at the right end, so nobody else moves.
// The team always stands here: nobody drags it, so it never drifts apart from the lead.
export function teamLayout(team: Pick<Member, "id">[]): { lead: Pt; members: Map<string, Pt> } {
  const rowTop = TEAM_BOTTOM - PERSON_H;
  const rowWidth = team.length ? team.length * PERSON_W + (team.length - 1) * COL_GAP : 0;
  const lead = { x: rowWidth / 2 - LEAD_W / 2, y: rowTop - ROW_GAP - LEAD_H };
  const members = new Map(team.map((m, i) => [m.id, { x: i * (PERSON_W + COL_GAP), y: rowTop }]));
  return { lead, members };
}

export function teamBounds(team: Pick<Member, "id">[]) {
  const { lead, members } = teamLayout(team);
  const boxes = [
    { x: lead.x, y: lead.y, w: LEAD_W, h: LEAD_H },
    ...[...members.values()].map((p) => ({ x: p.x, y: p.y, w: PERSON_W, h: PERSON_H })),
  ];
  return {
    left: Math.min(...boxes.map((b) => b.x)),
    right: Math.max(...boxes.map((b) => b.x + b.w)),
    top: Math.min(...boxes.map((b) => b.y)),
    bottom: Math.max(...boxes.map((b) => b.y + b.h)),
  };
}
