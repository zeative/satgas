import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CHANNEL_KINDS, type ChannelKind, type ChannelState, type ChannelStatus, type ChannelsView } from "../../shared/channels";
import { config } from "../config";
import { answerRun, approveTask, cancelRun, followUp, startRun } from "../orchestrator";
import { answerSecret } from "../secrets";
import { taskAgents } from "../settings";
import { getRun, listRuns, newRunId, patchRun, setRunWatcher } from "../store";
import { ChannelHub, emptyHubState, type HubState, type Inbound, type Runtime } from "./hub";
import { TelegramAdapter } from "./telegram";
import { WhatsAppAdapter } from "./whatsapp";

interface Saved extends HubState {
  telegram: { token: string; enabled: boolean; offset: number };
  whatsapp: { enabled: boolean };
}

const runtime: Runtime = {
  getRun,
  listBoards: () => listRuns().map((r) => ({ id: r.id, title: r.title ?? r.prompt.slice(0, 60) })),
  start: async (prompt, origin) => {
    const id = newRunId();
    const cwd = join(config.dataDir, "workspaces", id);
    await mkdir(cwd, { recursive: true });
    const run = startRun(prompt, cwd, id);
    patchRun(run.id, { origins: { 0: origin } });
    return run.id;
  },
  follow: (board, prompt, origin) => followUp(board, prompt, origin) === "ok",
  answer: (board, answers) => answerRun(board, answers) === "ok",
  approve: (board, node, allow) => approveTask(board, node, allow) === "ok",
  declineSecret: async (board, ask) => (await answerSecret(board, ask, undefined, true)) === null,
  cancel: cancelRun,
  hasAgents: () => taskAgents().length > 0,
  boardUrl: (board) =>
    `${config.publicUrl ?? `http://localhost:${process.env.NODE_ENV === "production" ? config.port : config.webPort}`}/boards/${board}`,
};

const file = () => join(config.dataDir, "channels.json");
const sessionDir = () => join(config.dataDir, "channels", "whatsapp");

interface Live {
  saved: Saved;
  hub: ChannelHub;
  status: Record<ChannelKind, { state: ChannelState; me?: string; error?: string; qr?: string }>;
  telegram: TelegramAdapter | null;
  whatsapp: WhatsAppAdapter | null;
  timers: Map<string, ReturnType<typeof setTimeout>>;
}

// Survives `bun --hot`: a second poller on the same bot would make Telegram refuse both.
const hot = globalThis as typeof globalThis & { __satgasChannels?: Live };

let writing: Promise<unknown> = Promise.resolve();
function persist(saved: Saved) {
  writing = writing
    .then(async () => {
      const tmp = `${file()}.tmp`;
      // The bot token lives here, so only this user may read it.
      await writeFile(tmp, JSON.stringify(saved), { mode: 0o600 });
      await rename(tmp, file());
    })
    .catch((e) => console.error(`Could not save channels: ${(e as Error).message}`));
}

function setStatus(live: Live, kind: ChannelKind, state: ChannelState, detail?: string) {
  const s = live.status[kind];
  s.state = state;
  s.qr = state === "qr" ? detail : undefined;
  s.me = state === "connected" ? detail : state === "error" || state === "off" ? undefined : s.me;
  s.error = state === "error" ? detail : undefined;
}

function connectTelegram(live: Live) {
  live.telegram?.stop();
  live.telegram = null;
  live.hub.adapters.delete("telegram");
  const { token, enabled, offset } = live.saved.telegram;
  if (!enabled || !token) return setStatus(live, "telegram", "off");
  const adapter = new TelegramAdapter(
    token,
    {
      offset,
      onOffset: (next) => {
        live.saved.telegram.offset = next;
        persist(live.saved);
      },
      onText: (m: Inbound, text: string) =>
        void live.hub.onText(m, text).catch((e) => console.error(`Telegram message failed: ${(e as Error).message}`)),
      onButton: (m: Inbound, id: string) =>
        void live.hub.onButton(m, id).catch((e) => console.error(`Telegram button failed: ${(e as Error).message}`)),
      onState: (state, detail) => setStatus(live, "telegram", state, detail),
    },
    config.telegramApi,
  );
  live.telegram = adapter;
  live.hub.adapters.set("telegram", adapter);
  adapter.start();
}

async function connectWhatsApp(live: Live) {
  await live.whatsapp?.stop();
  live.whatsapp = null;
  live.hub.adapters.delete("whatsapp");
  if (!live.saved.whatsapp.enabled) return setStatus(live, "whatsapp", "off");
  const adapter = new WhatsAppAdapter(sessionDir(), {
    onText: (m, text) => void live.hub.onText(m, text).catch((e) => console.error(`WhatsApp message failed: ${(e as Error).message}`)),
    onButton: (m, id) => void live.hub.onButton(m, id).catch((e) => console.error(`WhatsApp button failed: ${(e as Error).message}`)),
    onState: (state, detail) => setStatus(live, "whatsapp", state, detail),
  });
  live.whatsapp = adapter;
  live.hub.adapters.set("whatsapp", adapter);
  await adapter.start();
}

export async function startChannels() {
  if (hot.__satgasChannels) return;
  const loaded = await readFile(file(), "utf8").then(JSON.parse, () => null);
  const saved: Saved = {
    ...emptyHubState(),
    telegram: { token: "", enabled: false, offset: 0 },
    whatsapp: { enabled: false },
    ...loaded,
  };
  const live: Live = {
    saved,
    hub: new ChannelHub(saved, runtime, () => persist(saved)),
    status: { telegram: { state: "off" }, whatsapp: { state: "off" } },
    telegram: null,
    whatsapp: null,
    timers: new Map(),
  };
  hot.__satgasChannels = live;
  // Boards change many times a second while agents work; a quiet moment is enough to say what is new.
  setRunWatcher((board) => {
    if (!saved.links[board] || live.timers.has(board)) return;
    live.timers.set(
      board,
      setTimeout(() => {
        live.timers.delete(board);
        void live.hub.tick(board).catch((e) => console.error(`Channel update failed: ${(e as Error).message}`));
      }, 400),
    );
  });
  connectTelegram(live);
  void connectWhatsApp(live);
  // What ended while Satgas was down still gets said.
  for (const board of Object.keys(saved.links)) void live.hub.tick(board).catch(() => {});
}

export async function stopChannels() {
  const live = hot.__satgasChannels;
  if (!live) return;
  live.telegram?.stop();
  await live.whatsapp?.stop();
  await writing;
}

const liveOrThrow = () => {
  if (!hot.__satgasChannels) throw new Error("Channels have not started.");
  return hot.__satgasChannels;
};

export function channelsView(): ChannelsView {
  const live = liveOrThrow();
  const channels = CHANNEL_KINDS.map((kind): ChannelStatus => {
    const s = live.status[kind];
    return {
      kind,
      enabled: kind === "telegram" ? live.saved.telegram.enabled : live.saved.whatsapp.enabled,
      tokenSet: kind === "telegram" && !!live.saved.telegram.token,
      state: s.state,
      ...(s.me ? { me: s.me } : {}),
      ...(s.error ? { error: s.error } : {}),
      ...(s.qr ? { qr: s.qr } : {}),
    };
  });
  const p = live.saved.pairing;
  return { channels, people: live.saved.people, pairing: p && p.until > Date.now() ? { code: p.code, until: p.until } : null };
}

export async function updateChannel(kind: ChannelKind, body: { enabled?: unknown; token?: unknown }): Promise<string | null> {
  const live = liveOrThrow();
  if (kind === "telegram") {
    const t = live.saved.telegram;
    if (typeof body.token === "string") {
      const token = body.token.trim();
      if (token && !/^\d+:[\w-]{20,}$/.test(token)) return "That doesn't look like a bot token from @BotFather.";
      // A different bot starts its own count of messages.
      if (token !== t.token) t.offset = 0;
      t.token = token;
    }
    if (typeof body.enabled === "boolean") t.enabled = body.enabled;
    if (t.enabled && !t.token) return "Paste the bot token first.";
    persist(live.saved);
    connectTelegram(live);
    return null;
  }
  if (typeof body.enabled === "boolean") live.saved.whatsapp.enabled = body.enabled;
  persist(live.saved);
  await connectWhatsApp(live);
  return null;
}

export function newPairing() {
  return liveOrThrow().hub.newPairing();
}

export function removePerson(kind: ChannelKind, id: string): boolean {
  const live = liveOrThrow();
  const before = live.saved.people.length;
  live.saved.people = live.saved.people.filter((p) => !(p.kind === kind && p.ids.includes(id)));
  if (live.saved.people.length === before) return false;
  persist(live.saved);
  return true;
}

// Unlinks the number and forgets its login; linking again takes a new QR.
export async function logoutWhatsApp() {
  const live = liveOrThrow();
  live.saved.whatsapp.enabled = false;
  await live.whatsapp?.logout();
  live.whatsapp = null;
  live.hub.adapters.delete("whatsapp");
  await rm(sessionDir(), { recursive: true, force: true });
  setStatus(live, "whatsapp", "off");
  persist(live.saved);
}
