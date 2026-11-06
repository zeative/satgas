import { t } from "@/i18n";
import type { Act } from "./activity";

const WROTE = new Set(["Write", "add"]);

export function actVerb(act: Act): string {
  const v = t.actlog.verb;
  switch (act.kind) {
    case "edit":
      return act.tool === "delete" ? v.deleted : WROTE.has(act.tool) ? v.wrote : v.edit;
    case "read":
    case "image":
    case "search":
    case "web":
    case "skill":
    case "canvas":
    case "card":
    case "attached":
    case "upstream":
    case "memory":
    case "secret":
      return v[act.kind];
    case "mcp":
      return `${act.server} · ${act.tool.replace(/_/g, " ")}`;
    case "command":
      return "";
    default:
      return act.tool;
  }
}

export function actDetail(act: Act): string {
  if (act.kind === "canvas") return t.actlog.cards(Number(act.detail) || 0);
  return act.detail === act.tool ? "" : act.detail;
}

// The end of a long path is the part that says what it is, and a one-line row would cut exactly that off.
export function pathParts(detail: string): { name: string; dir: string } {
  const i = detail.replace(/\/$/, "").lastIndexOf("/");
  return i < 0 ? { name: detail, dir: "" } : { name: detail.slice(i + 1), dir: detail.slice(0, i) };
}

// macOS serves /tmp and /var from /private, and agents report the real path while the board keeps the one it was given.
export function shortPath(detail: string, cwd: string): string {
  const plain = cwd.replace(/^\/private(?=\/)/, "");
  return detail.replaceAll(`/private${plain}/`, "").replaceAll(`${plain}/`, "");
}
