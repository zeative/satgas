// The built-in "satgas_team" connector every task gets: a tiny MCP server over stdio that hands each tool call to Satgas
// (SATGAS_TEAM_URL, with the task's SATGAS_TEAM_TOKEN). It runs as its own process per task and imports nothing else.
// The team tools are listed only when teammates work alongside (SATGAS_TEAM_TALK=1); the web app tools and the secret
// request always are.

const TOOLS = [
  {
    name: "team_notes",
    description:
      "Who else is on this round's team and the decisions they posted (API shapes, names, file layout). Read it before you start when teammates work alongside you, and before you settle something they may depend on.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    op: "notes",
  },
  {
    name: "team_note",
    description:
      "Post one short decision teammates depend on, like an API contract, a shared name or where a file lives. Only what others need; never progress updates or chat.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The decision, in a sentence or two" } },
      required: ["text"],
      additionalProperties: false,
    },
    op: "note",
  },
  {
    name: "team_files",
    description: "The files teammates are editing right now, so you avoid writing over their work.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    op: "files",
  },
  {
    name: "team_ask",
    description:
      "Ask a teammate who is working right now one short question, only for a fact you cannot find yourself and only they know. At most two per task; you wait up to two minutes for the answer.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "The teammate's id or name, from team_notes" },
        question: { type: "string", description: "One line" },
      },
      required: ["to", "question"],
      additionalProperties: false,
    },
    op: "ask",
  },
  {
    name: "team_answer",
    description: "Answer a question a teammate sent you, in one or two lines, then carry on with your task.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "The question's id" }, text: { type: "string" } },
      required: ["id", "text"],
      additionalProperties: false,
    },
    op: "answer",
  },
  {
    name: "app_start",
    description:
      'Run a web app that needs a server (a dev server like Vite or Next, an API, a game) so the person can open it: Satgas starts it in the board\'s folder, keeps it running after your task, puts it on the board as a live card and serves it at its own address, the same on a laptop or a server. Never tell the person to run it themselves and never rely on localhost: they cannot reach your localhost. The command must listen on the PORT environment variable and on host 127.0.0.1, and the app must be built to live under the path in SATGAS_APP_BASE (for Vite: --base "$SATGAS_APP_BASE"; the satgas skill has the setting for each framework). Returns the address once the app answers, or what it printed if it failed.',
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'A short lowercase name, letters, digits and dashes, like "web" or "game"' },
        command: {
          type: "string",
          description:
            'The shell command that starts it and stays running, like "bun run dev -- --port $PORT --host 127.0.0.1 --base $SATGAS_APP_BASE"',
        },
        dir: { type: "string", description: "The folder to run it in, relative to the board's folder; default the folder itself" },
      },
      required: ["name", "command"],
      additionalProperties: false,
    },
    op: "app_start",
  },
  {
    name: "app_stop",
    description: "Stop a web app you started with app_start, for example to start it again with a different command.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    op: "app_stop",
  },
  {
    name: "app_status",
    description: "The board's web apps: whether each runs, its address, and the last lines it printed, to debug one that fails.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Optional: one app, with more of its log" } },
      additionalProperties: false,
    },
    op: "app_status",
  },
  {
    name: "request_secret",
    description:
      "Ask the person for a key, token or password your task cannot go on without and that is in no connector, file or environment variable you can reach. They type it into a private card; you get a file path to read it from inside your commands, never the value itself. You wait up to ten minutes. Never ask for anything you can find or make yourself.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: 'What it is, in a few words, like "Stripe test secret key"' },
        reason: { type: "string", description: "One line on what you need it for" },
        hint: { type: "string", description: 'Optional words for the empty field, like "At least 12 characters"' },
      },
      required: ["label", "reason"],
      additionalProperties: false,
    },
    op: "secret",
  },
] as const;

// Asking for a secret and running web apps are every task's; the team tools only when teammates work alongside.
const ALWAYS = new Set<string>(["secret", "app_start", "app_stop", "app_status"]);
const offered = () => TOOLS.filter((t) => ALWAYS.has(t.op) || process.env.SATGAS_TEAM_TALK !== "0");

type Rpc = { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown> };
const send = (msg: object) => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
};

async function call(op: string, args: unknown): Promise<{ text: string; error: boolean }> {
  try {
    const res = await fetch(`${process.env.SATGAS_TEAM_URL}/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.SATGAS_TEAM_TOKEN ?? ""}` },
      body: JSON.stringify(args ?? {}),
      // Bun drops a silent fetch after a few minutes, and a secret request may wait ten on the person.
      timeout: false,
    });
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    return data.text !== undefined
      ? { text: data.text, error: false }
      : { text: data.error ?? `Satgas answered ${res.status}`, error: true };
  } catch (e) {
    return { text: `Satgas could not be reached: ${(e as Error).message}`, error: true };
  }
}

export async function handle(msg: Rpc): Promise<void> {
  if (msg.method === "initialize")
    return send({
      id: msg.id,
      result: {
        protocolVersion: (msg.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "satgas_team", version: "1" },
      },
    });
  if (msg.method === "tools/list") return send({ id: msg.id, result: { tools: offered().map(({ op: _op, ...t }) => t) } });
  if (msg.method === "tools/call") {
    const tool = offered().find((t) => t.name === msg.params?.name);
    if (!tool) return send({ id: msg.id, result: { content: [{ type: "text", text: "Unknown tool" }], isError: true } });
    const r = await call(tool.op, msg.params?.arguments);
    return send({ id: msg.id, result: { content: [{ type: "text", text: r.text }], isError: r.error } });
  }
  if (msg.method === "ping") return send({ id: msg.id, result: {} });
  // Notifications (no id) need no answer; anything else is unknown.
  if (msg.id !== undefined) send({ id: msg.id, error: { code: -32601, message: `Unknown method ${msg.method}` } });
}

export async function runTeamMcp(): Promise<void> {
  let buf = "";
  for await (const chunk of Bun.stdin.stream()) {
    buf += new TextDecoder().decode(chunk);
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      if (!line) continue;
      try {
        // Calls run side by side, so a teammate's long wait never blocks reading the next request.
        void handle(JSON.parse(line) as Rpc);
      } catch {}
    }
  }
}

if (import.meta.main) await runTeamMcp();
