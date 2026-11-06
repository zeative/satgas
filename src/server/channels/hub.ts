import { CHANNEL_KINDS, type ChannelKind, PAIRING_ATTEMPTS, PAIRING_MS, type PairedPerson } from "../../shared/channels";
import type { Answer, Question } from "../../shared/questions";
import type { RoundOrigin, Run } from "../../shared/types";
import { noticesFor, statusLine } from "./notices";

export interface ChatButton {
  id: string;
  text: string;
}

export interface ChannelAdapter {
  kind: ChannelKind;
  // Whether a sent message can be changed later; without it there is no live status line.
  canEdit: boolean;
  // Buttons may not show on every phone, so choices are also spelled out to answer with a number.
  numberChoices: boolean;
  send(chat: string, text: string, buttons?: ChatButton[]): Promise<string | null>;
  edit(chat: string, messageId: string, text: string): Promise<void>;
}

export interface Inbound {
  kind: ChannelKind;
  chat: string;
  // Every id the app knows this person by.
  from: string[];
  name: string;
}

type Action =
  | { do: "approve"; board: string; node: string; allow: boolean }
  | { do: "decline-secret"; board: string; ask: string }
  | { do: "answer"; board: string; round: number; label: string };

interface AskProgress {
  board: string;
  round: number;
  index: number;
  answers: Answer[];
}

export interface HubState {
  people: PairedPerson[];
  pairing: { code: string; until: number; attempts: number } | null;
  // The board each chat is talking to.
  chats: Record<string, { board?: string; ask?: AskProgress; choices?: string[] }>;
  // Which chat hears about each board, and what it already heard.
  links: Record<string, { chat: string; seen: string[]; statusId?: string; status?: string; statusRound?: number }>;
  actions: Record<string, Action>;
}

export const emptyHubState = (): HubState => ({ people: [], pairing: null, chats: {}, links: {}, actions: {} });

// What the hub needs from Satgas, so its behaviour can be tried without running a team.
export interface Runtime {
  getRun(id: string): Run | undefined;
  listBoards(): { id: string; title: string }[];
  start(prompt: string, origin: RoundOrigin): Promise<string>;
  follow(board: string, prompt: string, origin: RoundOrigin): boolean;
  answer(board: string, answers: Answer[]): boolean;
  approve(board: string, node: string, allow: boolean): boolean;
  declineSecret(board: string, ask: string): Promise<boolean>;
  cancel(board: string): boolean;
  hasAgents(): boolean;
  // Whether the lead has a working model; a request sent without one would only fail later.
  hasModel(): Promise<boolean>;
  boardUrl(board: string): string;
}

const HELP = `Message me what you need and the team gets to work.

/new <request> starts a new board
/boards lists your boards
/use <number> switches board
/status says where things stand
/stop stops the work
/help shows this`;

const STATUS_EVERY_MS = 4000;
const NAMES: Record<ChannelKind, string> = { telegram: "Telegram", whatsapp: "WhatsApp" };
const MAX_ACTIONS = 200;

export class ChannelHub {
  readonly adapters = new Map<ChannelKind, ChannelAdapter>();
  private lastStatus = new Map<string, number>();
  private lanes = new Map<string, Promise<unknown>>();

  constructor(
    readonly state: HubState,
    private rt: Runtime,
    private save: () => void,
    private now: () => number = Date.now,
  ) {}

  private adapterOf(chat: string) {
    return this.adapters.get(chat.slice(0, chat.indexOf(":")) as ChannelKind);
  }

  // One chat's messages go out in order, whatever else is happening.
  private inLane<T>(chat: string, job: () => Promise<T>): Promise<T> {
    const next = (this.lanes.get(chat) ?? Promise.resolve()).then(job, job);
    this.lanes.set(
      chat,
      next.catch(() => {}),
    );
    return next;
  }

  private say(chat: string, text: string, buttons?: ChatButton[]) {
    const adapter = this.adapterOf(chat);
    if (!adapter) return Promise.resolve(null);
    const id = chat.slice(chat.indexOf(":") + 1);
    const body =
      buttons && adapter.numberChoices
        ? `${text}\n\n${buttons.map((b, i) => `${i + 1}. ${b.text}`).join("\n")}\nReply with a number`
        : text;
    return this.inLane(chat, () => adapter.send(id, body, buttons)).catch(() => null);
  }

  private offer(chat: string, actions: { text: string; action: Action }[]): ChatButton[] {
    const buttons = actions.map(({ text, action }) => {
      const id = crypto.randomUUID().slice(0, 8);
      this.state.actions[id] = action;
      return { id, text };
    });
    const ids = Object.keys(this.state.actions);
    for (const old of ids.slice(0, Math.max(0, ids.length - MAX_ACTIONS))) delete this.state.actions[old];
    this.chat(chat).choices = buttons.map((b) => b.id);
    return buttons;
  }

  private chat(key: string) {
    this.state.chats[key] ??= {};
    return this.state.chats[key];
  }

  private isPaired(kind: ChannelKind, ids: string[]) {
    return this.state.people.some((p) => p.kind === kind && p.ids.some((id) => ids.includes(id)));
  }

  newPairing(): { code: string; until: number } {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
      .padStart(6, "0")
      .slice(-6);
    const until = this.now() + PAIRING_MS;
    this.state.pairing = { code, until, attempts: 0 };
    this.save();
    return { code, until };
  }

  // A stranger gets no answer at all: a bot that replies to anyone gives itself away, and on WhatsApp it invites a ban.
  private async tryPairing(m: Inbound, key: string, text: string) {
    const p = this.state.pairing;
    if (!p || this.now() > p.until) return;
    if (text.trim() !== p.code) {
      if (/^\d{4,8}$/.test(text.trim()) && ++p.attempts >= PAIRING_ATTEMPTS) this.state.pairing = null;
      this.save();
      return;
    }
    this.state.pairing = null;
    this.state.people.push({ kind: m.kind, ids: m.from, name: m.name, at: this.now() });
    this.save();
    await this.say(key, `You're paired, ${m.name}.\n\n${HELP}`);
  }

  async onText(m: Inbound, raw: string) {
    const key = `${m.kind}:${m.chat}`;
    const text = raw.trim();
    if (!text) return;
    if (!this.isPaired(m.kind, m.from)) return this.tryPairing(m, key, text);
    const chat = this.chat(key);

    const command = /^\/([a-z]+)(?:@\S+)?(?:\s+([\s\S]*))?$/i.exec(text);
    if (command) return this.onCommand(m, key, (command[1] ?? "").toLowerCase(), (command[2] ?? "").trim());

    if (/^\d{1,2}$/.test(text) && chat.choices?.length) {
      const id = chat.choices[Number(text) - 1];
      if (id) return this.onChoice(m, id);
    }
    if (chat.ask) return this.takeAnswer(key, { picked: [], own: text });
    return this.toBoard(m, key, text);
  }

  private origin(m: Inbound): RoundOrigin {
    return { kind: "channel", label: NAMES[m.kind] };
  }

  private async toBoard(m: Inbound, key: string, text: string, fresh = false) {
    if (!this.rt.hasAgents()) return void (await this.say(key, "No agent is turned on. Turn one on in Satgas under Integrations."));
    if (!(await this.rt.hasModel()))
      return void (await this.say(key, "No model is connected yet. Connect one in Satgas under Integrations, then send this again."));
    const chat = this.chat(key);
    if (!fresh && chat.board && this.rt.getRun(chat.board) && this.rt.follow(chat.board, text, this.origin(m))) {
      this.link(chat.board, key);
      return void this.tick(chat.board);
    }
    const board = await this.rt.start(text, this.origin(m));
    chat.board = board;
    chat.ask = undefined;
    this.link(board, key);
    this.save();
    void this.tick(board);
  }

  // A chat hears about a board from now on; what already ended on it stays in the past.
  private link(board: string, chat: string) {
    const existing = this.state.links[board];
    if (existing?.chat === chat) return;
    const run = this.rt.getRun(board);
    const past = run
      ? noticesFor(run, new Set())
          .filter((n) => n.type === "report")
          .map((n) => n.key)
      : [];
    this.state.links[board] = { chat, seen: past };
    this.save();
  }

  private async onCommand(m: Inbound, key: string, name: string, arg: string) {
    const chat = this.chat(key);
    if (name === "start" || name === "help") return void (await this.say(key, HELP));
    if (name === "new") {
      if (!arg) return void (await this.say(key, "Say what it's for, like /new a landing page for my bakery"));
      return this.toBoard(m, key, arg, true);
    }
    if (name === "boards") {
      const boards = this.rt.listBoards().slice(0, 8);
      if (!boards.length) return void (await this.say(key, "No boards yet. Message me what you need."));
      const list = boards.map((b, i) => `${i + 1}. ${b.title}${b.id === chat.board ? " (current)" : ""}`).join("\n");
      return void (await this.say(key, `${list}\n\nSwitch with /use <number>`));
    }
    if (name === "use") {
      const picked = this.rt.listBoards().slice(0, 8)[Number(arg) - 1];
      if (!picked) return void (await this.say(key, "I don't have that one. Send /boards for the list."));
      chat.board = picked.id;
      chat.ask = undefined;
      this.link(picked.id, key);
      this.save();
      await this.say(key, `Now on ${picked.title}`);
      return void this.tick(picked.id);
    }
    if (name === "status") {
      const run = chat.board ? this.rt.getRun(chat.board) : undefined;
      if (!run) return void (await this.say(key, "No board yet. Message me what you need."));
      const line = statusLine(run) ?? (run.status === "asking" ? "Waiting for your answer" : "Nothing running");
      return void (await this.say(key, `${run.title ?? run.prompt.slice(0, 60)}\n${line}\n${this.rt.boardUrl(run.id)}`));
    }
    if (name === "stop") {
      const stopped = chat.board ? this.rt.cancel(chat.board) : false;
      return void (await this.say(key, stopped ? "Stopping." : "Nothing is running."));
    }
    await this.say(key, `I don't know /${name}.\n\n${HELP}`);
  }

  // A button press carries only an id: who pressed it is checked here, since a forwarded message can reach anyone.
  async onButton(m: Inbound, id: string) {
    if (!this.isPaired(m.kind, m.from)) return;
    await this.onChoice(m, id);
  }

  private async onChoice(m: Inbound, id: string) {
    const key = `${m.kind}:${m.chat}`;
    const action = this.state.actions[id];
    if (!action) return void (await this.say(key, "That choice is no longer open."));
    delete this.state.actions[id];
    this.chat(key).choices = undefined;
    this.save();
    if (action.do === "approve") {
      const ok = this.rt.approve(action.board, action.node, action.allow);
      await this.say(key, ok ? (action.allow ? "Allowed." : "Not allowed.") : "That task is no longer waiting.");
    } else if (action.do === "decline-secret") {
      const ok = await this.rt.declineSecret(action.board, action.ask);
      await this.say(key, ok ? "Declined. The team carries on without it." : "That request is no longer waiting.");
    } else {
      await this.takeAnswer(key, { picked: [action.label] });
    }
  }

  private async askNext(key: string) {
    const ask = this.chat(key).ask;
    if (!ask) return;
    const q: Question | undefined = this.rt.getRun(ask.board)?.asks?.[ask.round]?.questions[ask.index];
    if (!q) return;
    const buttons = this.offer(
      key,
      q.options.map((o) => ({ text: o.label, action: { do: "answer" as const, board: ask.board, round: ask.round, label: o.label } })),
    );
    this.save();
    await this.say(key, `${q.question}\n\nOr answer in your own words.`, buttons);
  }

  private async takeAnswer(key: string, answer: Answer) {
    const chat = this.chat(key);
    const ask = chat.ask;
    if (!ask) return;
    const questions = this.rt.getRun(ask.board)?.asks?.[ask.round]?.questions ?? [];
    ask.answers.push(answer);
    ask.index++;
    if (ask.index < questions.length) {
      this.save();
      return this.askNext(key);
    }
    chat.ask = undefined;
    chat.choices = undefined;
    this.save();
    if (!this.rt.answer(ask.board, ask.answers)) await this.say(key, "Those questions are no longer open.");
    void this.tick(ask.board);
  }

  // Called whenever a board changes: says what is new, and keeps the status line current.
  async tick(board: string) {
    const link = this.state.links[board];
    const run = this.rt.getRun(board);
    if (!link || !run) return;
    const seen = new Set(link.seen);
    const notices = noticesFor(run, seen);
    await this.updateStatus(board, run, link);
    for (const n of notices) {
      link.seen.push(n.key);
      this.save();
      if (n.type === "report") {
        await this.say(link.chat, `${n.text}\n\n${this.rt.boardUrl(board)}`);
      } else if (n.type === "ask") {
        this.chat(link.chat).ask = { board, round: n.round, index: 0, answers: [] };
        this.chat(link.chat).board = board;
        await this.askNext(link.chat);
      } else if (n.type === "held") {
        const buttons = this.offer(link.chat, [
          { text: "Allow", action: { do: "approve", board, node: n.node, allow: true } },
          { text: "Don't allow", action: { do: "approve", board, node: n.node, allow: false } },
        ]);
        this.save();
        await this.say(link.chat, n.text, buttons);
      } else if (n.type === "secret") {
        const buttons = this.offer(link.chat, [{ text: "Decline", action: { do: "decline-secret", board, ask: n.ask } }]);
        this.save();
        // A chat app keeps what is typed into it, so a secret only ever goes into Satgas itself.
        await this.say(link.chat, `${n.text}\n\nDon't send it here. Enter it in Satgas:\n${this.rt.boardUrl(board)}`, buttons);
      } else {
        await this.say(link.chat, `${n.text}:\n${this.rt.boardUrl(board)}`);
      }
    }
  }

  private async updateStatus(board: string, run: Run, link: HubState["links"][string]) {
    const adapter = this.adapterOf(link.chat);
    if (!adapter) return;
    const round = run.rounds?.length ?? 0;
    const line = statusLine(run);
    const id = link.chat.slice(link.chat.indexOf(":") + 1);
    if (link.statusRound !== round) {
      if (!line) return;
      link.statusRound = round;
      link.status = line;
      link.statusId = undefined;
      this.lastStatus.set(board, this.now());
      this.save();
      link.statusId = (await this.say(link.chat, line)) ?? undefined;
      this.save();
      return;
    }
    const next = line ?? "Finished";
    if (!adapter.canEdit || !link.statusId || next === link.status) return;
    // The end always lands; in between, chat apps limit how often a message can change.
    if (line && this.now() - (this.lastStatus.get(board) ?? 0) < STATUS_EVERY_MS) return;
    link.status = next;
    this.lastStatus.set(board, this.now());
    const messageId = link.statusId;
    await this.inLane(link.chat, () => adapter.edit(id, messageId, next)).catch(() => {});
  }
}

export const isChannelKind = (v: unknown): v is ChannelKind => CHANNEL_KINDS.includes(v as ChannelKind);
