import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  CODEX_KEY_VAR,
  claudeEnv,
  codexProviderArgs,
  nativeClaude,
  type ProviderConfig,
  type ProviderKind,
  providerDef,
  type Runtime,
} from "../shared/providers";
import type { ImageNote, LogLine, ProviderStatus } from "../shared/types";
import { claudeModel } from "./agents/claude";
import { AgentError, clip, runJsonl } from "./agents/process";
import { claudeAliasIds, prettyClaude } from "./claude-models";
import { config } from "./config";
import { providerStatuses } from "./providers";
import { getSettings } from "./settings";

// Agents on a model that cannot see still get attached images: a frontier vision model writes down everything an image
// shows, next to it as `<image>.md`, and the blind agent reads that. Agents that can see open the image themselves.

// Four coloured squares. Naming two of them right takes seeing the picture; a model that cannot see can only guess.
const PROBE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXklEQVR42u3PMREAIAwEMOS8EmZ0IgcRzEhAQ4duuYuBjJu0yrqthoCAgICAgICAgICAgICAgICAgICAgIBAOfBOWmXPVgICAgICAgICAgICAgICAgICAgICAgICZR9AUFlLjP0+egAAAABJRU5ErkJggg==";
const PROBE_ASK =
  "The image is split into four coloured squares. Reply with only two words: the colour of the top-left square, then the colour of the bottom-right square.";
const PROBE_TIMEOUT = 30_000;
const READ_CONCURRENCY = 3;

export const sawProbe = (answer: string) => /\bred\b/i.test(answer) && /\bgreen\b/i.test(answer);

// Shows the model the probe image. null: it could not tell (unreachable, key rejected, rate limited, no answer).
export async function probeVision(kind: ProviderKind, cfg: ProviderConfig, model: string): Promise<boolean | null> {
  const def = providerDef.get(kind);
  const base = (cfg.baseUrl?.trim() || def?.baseUrl || "").replace(/\/+$/, "");
  const key = kind === "ollama" ? "ollama" : (cfg.key?.trim() ?? "");
  const anthropic = def?.runtime === "claude";
  let res: Response;
  try {
    res = await fetch(anthropic ? `${base}/v1/messages` : `${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        // Some gateways read x-api-key instead of the bearer token.
        ...(anthropic ? { "anthropic-version": "2023-06-01", "x-api-key": key } : {}),
      },
      body: JSON.stringify(
        anthropic
          ? {
              model,
              // Room for a reasoning model to think before it answers.
              max_tokens: 4096,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "image", source: { type: "base64", media_type: "image/png", data: PROBE_PNG } },
                    { type: "text", text: PROBE_ASK },
                  ],
                },
              ],
            }
          : {
              model,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: PROBE_ASK },
                    { type: "image_url", image_url: { url: `data:image/png;base64,${PROBE_PNG}` } },
                  ],
                },
              ],
            },
      ),
      signal: AbortSignal.timeout(PROBE_TIMEOUT),
    });
  } catch {
    return null;
  }
  // The endpoint refused a message with an image in it (or the model): this model takes no images there.
  if (res.status === 400 || res.status === 415 || res.status === 422) {
    // A model the endpoint does not serve says nothing about images.
    const reason = await res.text().catch(() => "");
    return /model/i.test(reason) && /not exist|not found|does not exist|unknown|no such|not supported model|invalid model/i.test(reason)
      ? null
      : false;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const text = anthropic
    ? textOf(data?.content)
    : textOf((data?.choices as { message?: { content?: unknown } }[] | undefined)?.[0]?.message?.content);
  return text.trim() ? sawProbe(text) : null;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => (b && typeof b === "object" && typeof b.text === "string" ? b.text : "")).join(" ");
}

// Every Claude since Claude 3 and every model Codex offers on a ChatGPT sign-in take images.
const seesAlways = (kind: ProviderKind) => nativeClaude(kind) || kind === "codex";
// Only when the probe cannot tell (offline, rate limited): names of models known to take images.
const SEES_BY_NAME =
  /claude|gpt-4o|gpt-4\.1|gpt-5|gemini|[-_]vl|vl[-_]|vision|qwen3\.[5-9]|glm-[\d.]+v\b|kimi-k2\.5|pixtral|llava|gemma-?3|qvq/i;

const hot = globalThis as typeof globalThis & {
  __satgasSight?: { file: string; seen: Record<string, boolean> };
  __satgasSightPending?: Map<string, Promise<boolean | null>>;
};
hot.__satgasSightPending ??= new Map();
const pending = hot.__satgasSightPending;

// What each provider, endpoint and model answered once; kept in the data folder, so each model is asked one time.
async function sightCache() {
  const file = join(config.dataDir, "vision.json");
  if (hot.__satgasSight?.file !== file) {
    const seen = (await Bun.file(file)
      .json()
      .catch(() => ({}))) as Record<string, boolean>;
    hot.__satgasSight = { file, seen };
  }
  return hot.__satgasSight;
}

// Whether a model takes images, as far as anyone knows: Claude and Codex always do, gateway models are probed once.
// null: the probe could not tell, so nothing is kept and it is asked again next time.
async function sight(kind: ProviderKind, model: string): Promise<boolean | null> {
  if (seesAlways(kind)) return true;
  if (!model) return null;
  const cfg = getSettings().providers[kind] ?? {};
  const key = `${kind}|${cfg.baseUrl?.trim() || providerDef.get(kind)?.baseUrl || ""}|${model}`;
  const cache = await sightCache();
  if (key in cache.seen) return cache.seen[key] === true;
  // The composer and a starting run can ask at the same moment; they share one probe.
  const asking = pending.get(key);
  if (asking) return asking;
  const ask = (async () => {
    const seen = await probeVision(kind, cfg, model);
    if (seen === null) return null;
    cache.seen[key] = seen;
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    await writeFile(cache.file, JSON.stringify(cache.seen, null, 2)).catch(() => {});
    return seen;
  })().finally(() => pending.delete(key));
  pending.set(key, ask);
  return ask;
}

// For the agents: when the probe cannot tell, a model known by name to take images is trusted to see.
export async function canSee(kind: ProviderKind, model: string): Promise<boolean> {
  // A gateway with no model picked leaves nothing to ask, so its images get described.
  if (!seesAlways(kind) && !model) return false;
  return (await sight(kind, model)) ?? SEES_BY_NAME.test(model);
}

// The Claude agent plans and works; Codex counts only while it takes tasks.
export async function blindAgents(): Promise<{ claude: boolean; codex: boolean }> {
  const { claude, codex } = getSettings().agents;
  const codexModel = codex.model || (codex.provider === "codex" ? (config.codexModel ?? "") : "");
  const [claudeSees, codexSees] = await Promise.all([
    canSee(claude.provider, claudeModel()),
    codex.tasks ? canSee(codex.provider, codexModel) : Promise.resolve(true),
  ]);
  return { claude: !claudeSees, codex: !codexSees };
}

export interface Reader {
  kind: ProviderKind;
  runtime: Runtime;
  model: string;
  name: string;
}

const QWEN_READERS = ["qwen3-vl-plus", "qwen-vl-max"];
const ZAI_READERS = ["glm-4.6v", "glm-4.5v"];
const OPENAI_READERS = [/^gpt-5(\.\d+)?$/, /^gpt-4\.1$/, /^gpt-4o$/];
const OPENROUTER_READERS = [
  /^anthropic\/claude-opus/,
  /^anthropic\/claude-sonnet/,
  /^openai\/gpt-5(\.\d+)?$/,
  /^google\/gemini-[\d.]+-pro/,
];

// Strongest first, frontier models only: a weak reader hands the agent a wrong picture, which is worse than none. Local
// servers and small models are never used.
export function readerCandidates(statuses: ProviderStatus[], claudeName = "Claude Opus"): Reader[] {
  const models = new Map(statuses.filter((s) => s.state === "ok").map((s) => [s.kind, s.models]));
  const out: Reader[] = [];
  const add = (kind: ProviderKind, model: string, name = model) => {
    if (models.has(kind)) out.push({ kind, runtime: providerDef.get(kind)?.runtime ?? "claude", model, name });
  };
  // Highest version first, so `gpt-5.5` comes before `gpt-5.1`.
  const best = (kind: ProviderKind, pattern: RegExp) =>
    (models.get(kind) ?? []).filter((m) => pattern.test(m.id)).sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }))[0];
  for (const kind of ["claude", "claude-token", "anthropic"] as const) add(kind, "opus", claudeName);
  const codex = models.get("codex")?.[0];
  add("codex", codex?.id ?? "", codex?.name ?? "Codex");
  const gpt = OPENAI_READERS.map((p) => best("openai", p)).find(Boolean);
  if (gpt) add("openai", gpt.id);
  for (const pattern of OPENROUTER_READERS) {
    const m = best("openrouter", pattern);
    if (m) add("openrouter", m.id, m.name);
  }
  // Model Studio and Z.ai leave their vision models out of the chat list; the probe confirms which ones answer.
  for (const id of QWEN_READERS) add("qwen", id);
  for (const id of ZAI_READERS) add("zai", id);
  return out;
}

export async function pickReader(): Promise<Reader | null> {
  const ids = await claudeAliasIds().catch(() => ({}) as Record<string, string>);
  const name = (ids.opus && prettyClaude(ids.opus)) || "Claude Opus";
  // A reader must have shown it sees; a name alone could point at a model the endpoint does not serve.
  for (const reader of readerCandidates(await providerStatuses(), name))
    if ((await sight(reader.kind, reader.model)) === true) return reader;
  return null;
}

const READ_SYSTEM = [
  "You describe an image for an AI agent that cannot see it, so it can work exactly as if it had seen the image itself. Be exact and complete, and never guess.",
  "Write markdown:",
  "- First, what the image is: a screenshot of what, a photo of what, a chart, a diagram, a scanned page.",
  "- Every piece of visible text, word for word, in reading order and its original language, with numbers and units as shown.",
  "- Tables as markdown tables. Charts: the type, axes, series and every value you can read. Diagrams: each element and how they connect.",
  "- What matters visually: layout and position, colours, highlighted or selected items, errors, empty areas, the state of controls.",
  "- Mark anything you cannot read clearly as unclear instead of guessing.",
  "Reply with the description only.",
].join("\n");

async function readImage(reader: Reader, image: string, cwd: string, signal: AbortSignal): Promise<string> {
  const cfg = getSettings().providers[reader.kind] ?? {};
  let text = "";
  let failure: string | undefined;
  const reason = () => (failure ? clip(failure, 300) : undefined);
  if (reader.runtime === "claude") {
    const cmd = [config.claudeBin, "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence"];
    if (config.leanAgents) cmd.push("--strict-mcp-config", "--setting-sources", "");
    cmd.push("--model", reader.model, "--system-prompt", READ_SYSTEM, "--tools", "Read", "--allowedTools", "Read");
    const env = claudeEnv(reader.kind, cfg, reader.model);
    // Gateways cap output below what Claude Code asks for by default; a description never needs more.
    const set = nativeClaude(reader.kind) ? env.set : { ...env.set, CLAUDE_CODE_MAX_OUTPUT_TOKENS: "8192" };
    await runJsonl(
      cmd,
      { prompt: `Read the image at ${image} and describe it.`, cwd, signal },
      (ev) => {
        if (ev.type !== "result") return;
        if (ev.is_error || ev.subtype !== "success") failure = String(ev.result || ev.subtype || "Claude failed.");
        else text = String(ev.result ?? "");
      },
      reason,
      { set, unset: env.unset },
    );
  } else {
    // The sandbox flag follows the image so the stdin `-` is never taken for a second image.
    const cmd = [config.codexBin, "exec", "--json", "--ephemeral", "--skip-git-repo-check", "-C", cwd, "-i", image, "-s", "read-only"];
    if (config.leanAgents) cmd.push("--ignore-user-config");
    if (reader.model) cmd.push("-m", reader.model);
    cmd.push(...codexProviderArgs(reader.kind, cfg), "-");
    const key = cfg.key?.trim();
    await runJsonl(
      cmd,
      { prompt: `${READ_SYSTEM}\n\nDescribe the attached image.`, cwd, signal },
      (ev) => {
        if (ev.type === "item.completed" && ev.item?.type === "agent_message" && ev.item.text) text = ev.item.text;
        else if (ev.type === "turn.failed") failure = ev.error?.message ?? "Codex failed.";
      },
      reason,
      { set: key ? { [CODEX_KEY_VAR]: key } : {}, unset: [] },
    );
  }
  if (failure) throw new AgentError(clip(failure, 300));
  if (!text.trim()) throw new AgentError(`${reader.name} returned no description.`);
  return text.trim();
}

// Descriptions are kept by the image's content, so the same picture is never read twice, on any board.
const storeOf = (hash: string) => join(config.dataDir, "vision", `${hash}.json`);

async function described(hash: string): Promise<{ text: string; by: string } | null> {
  const hit = (await Bun.file(storeOf(hash))
    .json()
    .catch(() => null)) as { text?: unknown; by?: unknown } | null;
  return typeof hit?.text === "string" && typeof hit.by === "string" ? { text: hit.text, by: hit.by } : null;
}

export interface Sight {
  // Agents whose model cannot see images.
  blind: { claude: boolean; codex: boolean };
  // What each image got, kept on the run.
  notes: Record<string, ImageNote>;
  // The descriptions themselves, for the planner, which cannot open files.
  texts: Record<string, string>;
}

const NO_READER = "No strong vision model is connected";

// Makes sure every attached image a blind agent will meet has a description next to it.
export async function seeAttachments(
  cwd: string,
  images: string[],
  known: Record<string, ImageNote>,
  signal: AbortSignal,
  onLog: (line: Omit<LogLine, "t" | "seq">) => void,
): Promise<Sight> {
  const none: Sight = { blind: { claude: false, codex: false }, notes: {}, texts: {} };
  if (!images.length) return none;
  const blind = await blindAgents();
  if (!blind.claude && !blind.codex) return none;
  const texts: Record<string, string> = {};
  const todo: string[] = [];
  for (const image of images) {
    const file = known[image]?.file;
    const text = file ? await readFile(join(cwd, file), "utf8").catch(() => null) : null;
    if (text) texts[image] = text;
    else todo.push(image);
  }
  const notes: Record<string, ImageNote> = {};
  if (!todo.length) return { blind, notes, texts };

  const reader = await pickReader();
  if (!reader) {
    for (const image of todo) notes[image] = { error: NO_READER };
    onLog({ kind: "error", text: `${NO_READER}, so the agents cannot see the attached images` });
    return { blind, notes, texts };
  }
  onLog({
    kind: "info",
    text: `${reader.name} is reading ${todo.length === 1 ? "the attached image" : `${todo.length} attached images`} for a model that cannot see`,
  });
  const queue = [...todo];
  const work = async () => {
    for (let image = queue.shift(); image; image = queue.shift()) {
      try {
        const bytes = await readFile(join(cwd, image));
        const hash = createHash("sha256").update(bytes).digest("hex");
        let hit = await described(hash);
        if (!hit) {
          hit = { text: await readImage(reader, join(cwd, image), cwd, signal), by: reader.name };
          await mkdir(join(config.dataDir, "vision"), { recursive: true, mode: 0o700 });
          await writeFile(storeOf(hash), JSON.stringify(hit), { mode: 0o600 });
        }
        const file = `${image}.md`;
        await writeFile(join(cwd, file), `What \`${basename(image)}\` shows, described by ${hit.by}:\n\n${hit.text}\n`);
        notes[image] = { file, by: hit.by };
        texts[image] = hit.text;
      } catch (e) {
        if (signal.aborted) throw e;
        notes[image] = { error: clip((e as Error).message, 200) };
        onLog({ kind: "error", text: `Could not read ${basename(image)}: ${clip((e as Error).message, 200)}` });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, todo.length) }, work));
  return { blind, notes, texts };
}

// For the composer: the model that cannot see attached images, if any, and who reads them for it.
export async function visionStatus(): Promise<{ blind: string | null; reader: string | null }> {
  const blind = await blindAgents();
  if (!blind.claude && !blind.codex) return { blind: null, reader: null };
  const { agents } = getSettings();
  const model = blind.claude ? claudeModel() || agents.claude.provider : agents.codex.model || agents.codex.provider;
  return { blind: model, reader: (await pickReader())?.name ?? null };
}
