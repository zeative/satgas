import { splitMessage, toTelegramHtml } from "../../shared/channels";
import type { ChannelAdapter, ChatButton, Inbound } from "./hub";

const MAX_TEXT = 3500;
const POLL_SECONDS = 25;

export interface TelegramEvents {
  onText(m: Inbound, text: string): void;
  onButton(m: Inbound, id: string): void;
  onState(state: "connecting" | "connected" | "error", detail?: string): void;
  // Where to pick up after a restart, so nothing is handled twice or missed.
  offset: number;
  onOffset(offset: number): void;
}

// Long polling: the connection goes out from Satgas, so it works on a laptop with no public address.
export class TelegramAdapter implements ChannelAdapter {
  readonly kind = "telegram" as const;
  readonly canEdit = true;
  readonly numberChoices = false;
  private stopped = false;
  private abort = new AbortController();

  constructor(
    private token: string,
    private events: TelegramEvents,
    private api = "https://api.telegram.org",
  ) {}

  // The token sits in the URL, so a network error could carry it into a log or onto the page.
  private clean(message: string) {
    return message.split(this.token).join("•••");
  }

  private async call<T>(method: string, body: object, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.api}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      description?: string;
      error_code?: number;
      parameters?: { retry_after?: number };
    };
    if (data.ok) return data.result as T;
    if (data.error_code === 429 && !signal) {
      await Bun.sleep((data.parameters?.retry_after ?? 1) * 1000);
      return this.call(method, body);
    }
    throw Object.assign(new Error(this.clean(data.description ?? `Telegram answered ${res.status}`)), {
      code: data.error_code ?? res.status,
    });
  }

  start() {
    void this.run();
  }

  stop() {
    this.stopped = true;
    this.abort.abort();
  }

  private async run() {
    this.events.onState("connecting");
    let wait = 1000;
    let me = "";
    let offset = this.events.offset;
    while (!this.stopped) {
      try {
        if (!me) {
          me = (await this.call<{ username?: string }>("getMe", {})).username ?? "bot";
          this.events.onState("connected", `@${me}`);
        }
        const updates = await this.call<any[]>(
          "getUpdates",
          { offset, timeout: POLL_SECONDS, allowed_updates: ["message", "callback_query"] },
          this.abort.signal,
        );
        wait = 1000;
        for (const u of updates) {
          offset = u.update_id + 1;
          this.handle(u);
        }
        if (updates.length) this.events.onOffset(offset);
      } catch (e) {
        if (this.stopped) return;
        const { code, message } = e as { code?: number; message: string };
        const text = this.clean(message);
        // A wrong token or another program reading this bot will not fix itself by retrying.
        if (code === 401 || code === 404) return this.events.onState("error", "Telegram rejected this token");
        if (code === 409) return this.events.onState("error", "Another program is using this bot, or it has a webhook set");
        this.events.onState("error", text);
        await Bun.sleep(wait);
        wait = Math.min(wait * 2, 30_000);
        me = "";
      }
    }
  }

  // Private chats only, for now: in a group, the team's reports would reach people who were never paired.
  private handle(u: any) {
    const msg = u.message;
    if (msg?.chat?.type === "private" && typeof msg.text === "string" && msg.from) {
      this.events.onText(this.inbound(msg.chat.id, msg.from), msg.text);
    }
    const press = u.callback_query;
    if (press?.message?.chat?.type === "private") {
      void this.call("answerCallbackQuery", { callback_query_id: press.id }).catch(() => {});
      void this.call("editMessageReplyMarkup", {
        chat_id: press.message.chat.id,
        message_id: press.message.message_id,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
      this.events.onButton(this.inbound(press.message.chat.id, press.from), String(press.data));
    }
  }

  private inbound(chat: number, from: { id: number; first_name?: string; username?: string }): Inbound {
    return { kind: "telegram", chat: String(chat), from: [String(from.id)], name: from.first_name ?? from.username ?? "there" };
  }

  async send(chat: string, text: string, buttons?: ChatButton[]): Promise<string | null> {
    let last: string | null = null;
    const parts = splitMessage(text, MAX_TEXT);
    for (const [i, part] of parts.entries()) {
      const markup =
        buttons?.length && i === parts.length - 1
          ? { reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.text.slice(0, 60), callback_data: b.id }]) } }
          : {};
      const sent = await this.call<{ message_id: number }>("sendMessage", {
        chat_id: chat,
        text: toTelegramHtml(part),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...markup,
      }).catch(() =>
        // Markup the conversion got wrong must never lose the message itself.
        this.call<{ message_id: number }>("sendMessage", { chat_id: chat, text: part, ...markup }),
      );
      last = String(sent.message_id);
    }
    return last;
  }

  async edit(chat: string, messageId: string, text: string) {
    await this.call("editMessageText", { chat_id: chat, message_id: Number(messageId), text });
  }
}
