import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { Server } from "bun";
import type { Inbound } from "../../../src/server/channels/hub";
import { TelegramAdapter } from "../../../src/server/channels/telegram";

const TOKEN = "123456:SECRET_TOKEN_abcdefghij";
let server: Server<undefined>;
let requests: { method: string; body: any }[] = [];
let updates: any[] = [];
let answer: (method: string, body: any) => object | null;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const method = new URL(req.url).pathname.split("/").at(-1) as string;
      const body = await req.json().catch(() => ({}));
      requests.push({ method, body });
      const custom = answer(method, body);
      if (custom) return Response.json(custom);
      if (method === "getMe") return Response.json({ ok: true, result: { username: "satgas_bot" } });
      if (method === "getUpdates") {
        const next = updates;
        updates = [];
        if (!next.length) await Bun.sleep(30);
        return Response.json({ ok: true, result: next });
      }
      return Response.json({ ok: true, result: { message_id: 7 } });
    },
  });
});
afterAll(() => server.stop(true));
beforeEach(() => {
  requests = [];
  updates = [];
  answer = () => null;
});

function open() {
  const seen = { texts: [] as [Inbound, string][], buttons: [] as [Inbound, string][], states: [] as string[], offset: 0 };
  const adapter = new TelegramAdapter(
    TOKEN,
    {
      offset: 0,
      onOffset: (n) => {
        seen.offset = n;
      },
      onText: (m, t) => seen.texts.push([m, t]),
      onButton: (m, id) => seen.buttons.push([m, id]),
      onState: (s, d) => seen.states.push(d ? `${s}:${d}` : s),
    },
    `http://127.0.0.1:${server.port}`,
  );
  return { adapter, seen };
}
const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await Bun.sleep(5);
};

test("takes private messages and button presses, and remembers where it got to", async () => {
  updates = [
    { update_id: 10, message: { chat: { id: 42, type: "private" }, from: { id: 7, first_name: "Zaa" }, text: "hello" } },
    { update_id: 11, message: { chat: { id: -5, type: "group" }, from: { id: 7, first_name: "Zaa" }, text: "in a group" } },
    {
      update_id: 12,
      callback_query: {
        id: "cb",
        data: "abc",
        from: { id: 7, first_name: "Zaa" },
        message: { message_id: 3, chat: { id: 42, type: "private" } },
      },
    },
  ];
  const { adapter, seen } = open();
  adapter.start();
  await until(() => seen.offset === 13);
  adapter.stop();
  expect(seen.states).toContain("connected:@satgas_bot");
  expect(seen.texts).toEqual([[{ kind: "telegram", chat: "42", from: ["7"], name: "Zaa" }, "hello"]]);
  expect(seen.buttons.map(([, id]) => id)).toEqual(["abc"]);
  await until(() => requests.some((r) => r.method === "answerCallbackQuery"));
  expect(requests.some((r) => r.method === "answerCallbackQuery")).toBe(true);
});

test("a rejected token stops trying and says so, without showing the token", async () => {
  answer = (method) => (method === "getMe" ? { ok: false, error_code: 401, description: `Unauthorized ${TOKEN}` } : null);
  const { adapter, seen } = open();
  adapter.start();
  await until(() => seen.states.some((s) => s.startsWith("error")));
  adapter.stop();
  expect(seen.states.at(-1)).toBe("error:Telegram rejected this token");
  expect(seen.states.join()).not.toContain("SECRET_TOKEN");
  expect(requests.filter((r) => r.method === "getMe")).toHaveLength(1);
});

test("another program on the same bot is named, since retrying cannot fix it", async () => {
  answer = (method) => (method === "getUpdates" ? { ok: false, error_code: 409, description: "Conflict" } : null);
  const { adapter, seen } = open();
  adapter.start();
  await until(() => seen.states.some((s) => s.startsWith("error")));
  adapter.stop();
  expect(seen.states.at(-1)).toContain("Another program");
});

test("sends formatted text, splits long messages with the buttons on the last, and falls back to plain", async () => {
  const { adapter } = open();
  const id = await adapter.send("42", `**hi**\n${"x".repeat(4000)}`, [{ id: "a1", text: "Allow" }]);
  expect(id).toBe("7");
  const parts = requests.filter((r) => r.method === "sendMessage");
  expect(parts.length).toBeGreaterThan(1);
  expect(parts[0]?.body.parse_mode).toBe("HTML");
  expect(parts[0]?.body.text).toContain("<b>hi</b>");
  expect(parts[0]?.body.reply_markup).toBeUndefined();
  expect(parts.at(-1)?.body.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Allow", callback_data: "a1" });

  requests = [];
  answer = (method, body) =>
    method === "sendMessage" && body.parse_mode ? { ok: false, error_code: 400, description: "can't parse entities" } : null;
  await adapter.send("42", "<odd> text");
  const [first, second] = requests.filter((r) => r.method === "sendMessage");
  expect(first?.body.parse_mode).toBe("HTML");
  expect(second?.body.parse_mode).toBeUndefined();
  expect(second?.body.text).toBe("<odd> text");
});

test("waits when Telegram says it is too fast, then delivers", async () => {
  let tries = 0;
  answer = (method) =>
    method === "sendMessage" && tries++ === 0
      ? { ok: false, error_code: 429, description: "Too Many", parameters: { retry_after: 0 } }
      : null;
  const { adapter } = open();
  expect(await adapter.send("42", "plain")).toBe("7");
});
