import type { LogLine } from "../../../shared/types";

// Turns an agent's log into a chat-like timeline: its words and thoughts, what happened, and runs of tool calls.

export type ActKind =
  | "skill"
  | "edit"
  | "command"
  | "read"
  | "image"
  | "search"
  | "web"
  | "mcp"
  | "other"
  // What the lead or a task was handed up front, logged by Satgas rather than called by the agent.
  | "canvas"
  | "card"
  | "attached"
  | "upstream"
  | "memory"
  | "secret";

export interface Act {
  kind: ActKind;
  // What the person reads in the expanded list: a path, a command, a query.
  detail: string;
  tool: string;
  // For MCP tools: the connector's name.
  server?: string;
}

export type Item =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "note"; text: string }
  | { type: "error"; text: string }
  | { type: "group"; acts: Act[] };

const EDITS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "add", "update", "delete", "edit"]);
const READS = new Set(["Read", "NotebookRead"]);
const SEARCHES = new Set(["Glob", "Grep", "LS"]);
const WEB = new Set(["WebFetch", "WebSearch"]);
const HANDED = new Set<ActKind>(["canvas", "card", "attached", "upstream", "memory", "secret"]);
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i;

export const isHanded = (kind: ActKind) => HANDED.has(kind);

// Tool lines are "<Tool> <detail>" from Claude Code, and "Bash <cmd>" or "<add|update|delete> <path>" from Codex.
export function classify(line: string): Act {
  const space = line.indexOf(" ");
  const tool = space < 0 ? line : line.slice(0, space);
  const detail = space < 0 ? "" : line.slice(space + 1).trim();
  const mcp = /^mcp__(.+?)__(.+)$/.exec(tool);
  // Codex's connectors carry a satgas_ prefix so they never clash with its own plugins; nobody needs to read it.
  if (mcp) return { kind: "mcp", tool: mcp[2] ?? tool, detail: detail || (mcp[2] ?? ""), server: mcp[1]?.replace(/^satgas_/, "") };
  if (HANDED.has(tool as ActKind)) return { kind: tool as ActKind, tool, detail };
  // Claude Code loads a skill with its Skill tool; Satgas's skills come namespaced from the plugin it hands over.
  if (tool === "Skill") return { kind: "skill", tool, detail: detail.replace(/^satgas-skills:/, "") || tool };
  if (tool === "Bash") return { kind: "command", tool, detail };
  if (EDITS.has(tool)) return { kind: "edit", tool, detail };
  if (READS.has(tool)) return { kind: IMAGE.test(detail) ? "image" : "read", tool, detail };
  if (SEARCHES.has(tool)) return { kind: "search", tool, detail };
  if (WEB.has(tool)) return { kind: "web", tool, detail };
  return { kind: "other", tool, detail: detail || tool };
}

export function timeline(lines: LogLine[]): Item[] {
  const items: Item[] = [];
  for (const l of lines) {
    if (l.kind === "tool") {
      const last = items.at(-1);
      const act = classify(l.text);
      if (last?.type === "group") last.acts.push(act);
      else items.push({ type: "group", acts: [act] });
    } else if (l.kind === "text" && l.text.trim()) items.push({ type: "text", text: l.text.trim() });
    else if (l.kind === "think" && l.text.trim()) items.push({ type: "think", text: l.text.trim() });
    else if (l.kind === "info") items.push({ type: "note", text: l.text });
    else if (l.kind === "error") items.push({ type: "error", text: l.text });
  }
  return items;
}

export interface Words {
  skills: (names: string) => string;
  changed: (n: number) => string;
  ran: (n: number) => string;
  read: (n: number) => string;
  searched: (n: number) => string;
  web: (n: number) => string;
  used: (names: string) => string;
  other: (n: number) => string;
}

const unique = (acts: Act[]) => new Set(acts.map((a) => a.detail)).size;

// "github · 3 files changed · 2 commands": files count once however often they were touched; commands count each run.
export function summarize(acts: Act[], words: Words): string {
  const of = (k: ActKind) => acts.filter((a) => a.kind === k);
  const servers = [...new Set(of("mcp").map((a) => a.server ?? ""))].filter(Boolean);
  const skills = [...new Set(of("skill").map((a) => a.detail))];
  const parts = [
    skills.length ? words.skills(skills.join(", ")) : "",
    servers.length ? words.used(servers.join(", ")) : "",
    of("edit").length ? words.changed(unique(of("edit"))) : "",
    of("command").length ? words.ran(of("command").length) : "",
    of("read").length + of("image").length ? words.read(unique([...of("read"), ...of("image")])) : "",
    of("search").length ? words.searched(of("search").length) : "",
    of("web").length ? words.web(of("web").length) : "",
    of("other").length ? words.other(of("other").length) : "",
  ].filter(Boolean);
  // One short line of segments ("github · 2 commands · 3 files read"); connector names keep their own case.
  const text = parts.join(" · ");
  return servers.length || skills.length ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
