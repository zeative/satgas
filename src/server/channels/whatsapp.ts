import { mkdir } from "node:fs/promises";
import { splitMessage, toWhatsApp } from "../../shared/channels";
import type { ChannelAdapter, ChatButton, Inbound } from "./hub";

const MAX_TEXT = 3500;

export interface WhatsAppEvents {
  onText(m: Inbound, text: string): void;
  onButton(m: Inbound, id: string): void;
  onState(state: "connecting" | "qr" | "connected" | "error", detail?: string): void;
}

// WhatsApp through zaileys (github.com/zeative/zaileys), linked like WhatsApp Web. It is loaded only when turned on, since
// it brings about 100 MB of memory that nobody else should carry.
export class WhatsAppAdapter implements ChannelAdapter {
  readonly kind = "whatsapp" as const;
  readonly canEdit = true;
  readonly numberChoices = true;
  private client: any = null;
  // Editing needs the key zaileys gave the message.
  private keys = new Map<string, unknown>();

  constructor(
    private dir: string,
    private events: WhatsAppEvents,
  ) {}

  async start() {
    this.events.onState("connecting");
    try {
      const { Client, FileAuthStore } = await import("zaileys");
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      // The QR is a login: it goes to the settings page only, never to the server's terminal or logs.
      const client = new Client({
        sessionId: "satgas",
        auth: new FileAuthStore({ basePath: this.dir }),
        qrTerminal: false,
        ignoreMe: true,
      }) as any;
      this.client = client;
      client.on("qr", ({ qrString }: { qrString: string }) => this.events.onState("qr", qrString));
      client.on("connect", ({ me }: { me: { name?: string; id?: string } }) =>
        this.events.onState("connected", me?.name ?? me?.id ?? "linked"),
      );
      client.on("reconnecting", () => this.events.onState("connecting"));
      client.on("disconnect", ({ reason, willReconnect }: { reason: string; willReconnect: boolean }) => {
        if (!willReconnect)
          this.events.onState("error", reason === "logged-out" ? "This number was unlinked. Link it again" : `Disconnected: ${reason}`);
      });
      client.on("auth-exhausted", () => this.events.onState("error", "The QR code went unused for too long. Connect again"));
      client.on("error", ({ error }: { error: Error }) => this.events.onState("error", error.message));
      client.on("text", (msg: any) => {
        // Replayed history is not a new request, and groups would show the team's reports to people never paired.
        if (msg.isOld || msg.isGroup || msg.isFromMe || !msg.text) return;
        this.events.onText(this.inbound(msg.roomId ?? msg.senderId, [msg.senderId, msg.senderLid], msg.senderName), msg.text);
      });
      client.on(
        "button-click",
        ({ buttonId, sender }: { buttonId: string; sender: { jid: string; lid?: string; pn?: string; pushName?: string } }) => {
          this.events.onButton(this.inbound(sender.jid, [sender.jid, sender.lid, sender.pn], sender.pushName), buttonId);
        },
      );
    } catch (e) {
      this.events.onState("error", (e as Error).message);
    }
  }

  private inbound(chat: string, ids: (string | undefined | null)[], name?: string | null): Inbound {
    return { kind: "whatsapp", chat, from: ids.filter((id): id is string => !!id), name: name || "there" };
  }

  async stop() {
    const client = this.client;
    this.client = null;
    await client?.disconnect().catch(() => {});
  }

  // Unlinks the device and forgets the login, for good.
  async logout() {
    const client = this.client;
    this.client = null;
    await client?.logout().catch(() => {});
  }

  async send(chat: string, text: string, buttons?: ChatButton[]): Promise<string | null> {
    if (!this.client) throw new Error("WhatsApp is not connected");
    let key: any = null;
    const parts = splitMessage(toWhatsApp(text), MAX_TEXT);
    for (const [i, part] of parts.entries()) {
      key =
        buttons?.length && i === parts.length - 1
          ? await this.client.send(chat).buttons(
              buttons.map((b) => ({ id: b.id, text: b.text.slice(0, 20) })),
              { text: part },
            )
          : await this.client.send(chat).text(part);
    }
    const id = key?.id ?? null;
    if (id) {
      this.keys.set(id, key);
      if (this.keys.size > 100) this.keys.delete(this.keys.keys().next().value as string);
    }
    return id;
  }

  async edit(_chat: string, messageId: string, text: string) {
    const key = this.keys.get(messageId);
    if (key && this.client) await this.client.edit(key).text(toWhatsApp(text));
  }
}
