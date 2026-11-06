import { t } from "@/i18n";

const PAGES: Record<string, string> = {
  "/": t.home,
  "/pipeline": t.pipeline.title,
  "/schedules": t.schedules.title,
  "/memory": t.memory.title,
  "/integrations": t.integrations.title,
  "/config": t.config.title,
  "/config/settings": t.config.settings,
  "/config/usage": t.config.usage,
  "/config/about": t.config.about,
};

const titled = (name: string | undefined) => (name ? `${name} · Satgas` : "Satgas");

// What the browser tab says, so several open Satgas tabs can be told apart. A board shows its own name once it has loaded.
export function pageTitle(pathname: string, board?: { id: string; title?: string; prompt: string; icon?: string } | null): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  const id = /^\/boards\/([^/]+)$/.exec(path)?.[1];
  if (!id) return titled(PAGES[path]);
  if (board?.id !== id) return "Satgas";
  const name = board.title?.trim() || board.prompt.trim().replace(/\s+/g, " ").slice(0, 60);
  return titled(board.icon ? `${board.icon} ${name}` : name);
}
