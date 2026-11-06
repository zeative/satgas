// Chat apps as another door into Satgas: the same boards, reached from Telegram or WhatsApp without opening the web.

export const CHANNEL_KINDS = ["telegram", "whatsapp"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export type ChannelState = "off" | "connecting" | "qr" | "connected" | "error";

export interface ChannelStatus {
  kind: ChannelKind;
  enabled: boolean;
  // Telegram's bot token is saved; the value itself never leaves the server.
  tokenSet: boolean;
  state: ChannelState;
  me?: string;
  error?: string;
  // What to draw for WhatsApp while it waits to be linked.
  qr?: string;
}

export interface PairedPerson {
  kind: ChannelKind;
  // Every id the app knows them by; WhatsApp has more than one for a person.
  ids: string[];
  name: string;
  at: number;
}

export interface ChannelsView {
  channels: ChannelStatus[];
  people: PairedPerson[];
  pairing: { code: string; until: number } | null;
}

export const PAIRING_MS = 10 * 60_000;
export const PAIRING_ATTEMPTS = 5;

// Cuts on a paragraph or line where it can, so a long report reads as several whole messages.
export function splitMessage(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    const at = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Telegram's small HTML subset, from the markdown agents write. Code is set aside first so nothing inside it is touched.
export function toTelegramHtml(markdown: string): string {
  const kept: string[] = [];
  const keep = (html: string) => {
    kept.push(html);
    return `\uE000${kept.length - 1}\uE000`;
  };
  const body = markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => keep(`<pre>${escapeHtml(code.trimEnd())}</pre>`))
    .replace(/`([^`\n]+)`/g, (_, code: string) => keep(`<code>${escapeHtml(code)}</code>`));
  return escapeHtml(body)
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, label: string, url: string) => `<a href="${url.replace(/"/g, "&quot;")}">${label}</a>`,
    )
    .replace(/\uE000(\d+)\uE000/g, (_, i: string) => kept[Number(i)] ?? "");
}

// WhatsApp marks bold with one star and has no links or headings.
export function toWhatsApp(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");
}
