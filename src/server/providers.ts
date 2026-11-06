import { homedir } from "node:os";
import { join } from "node:path";
import {
  CLAUDE_EFFORTS,
  CODEX_KEY_VAR,
  claudeEnv,
  codexProviderArgs,
  nativeClaude,
  PROVIDERS,
  type ProviderConfig,
  type ProviderKind,
  providerDef,
} from "../shared/providers";
import type { Settings } from "../shared/settings";
import type { ModelInfo, ProviderStatus } from "../shared/types";
import { childEnv, clip, runJsonl } from "./agents/process";
import { CLAUDE_FAMILIES, claudeAliasIds, prettyClaude } from "./claude-models";
import { config } from "./config";
import { getSettings } from "./settings";

const TTL = 60_000;
const TIMEOUT = 8_000;

// Tasks run on the family aliases, which Claude Code resolves to the newest model; the names show that model's version.
async function claudeAliases(): Promise<ModelInfo[]> {
  const ids = await claudeAliasIds();
  return CLAUDE_FAMILIES.map((family) => {
    const id = ids[family];
    return {
      id: family,
      name: (id && prettyClaude(id)) || `Claude ${family[0]?.toUpperCase()}${family.slice(1)}`,
      desc: id,
      efforts: CLAUDE_EFFORTS,
    };
  });
}

const g = globalThis as typeof globalThis & {
  __satgasProviders?: { at: number; key: string; list: ProviderStatus[] };
  // The round of checks under way; callers that arrive meanwhile share it instead of spawning their own CLIs.
  __satgasProviderCheck?: { key: string; list: Promise<ProviderStatus[]> };
};

// A provider is shown once it is set up: CLI sign-ins always, keyed providers once a key is saved, local ones once added.
function configured(kind: ProviderKind, cfg: ProviderConfig | undefined): boolean {
  const def = providerDef.get(kind);
  if (!def) return false;
  if (def.auth === "cli") return true;
  if (def.auth === "local") return cfg !== undefined;
  return !!cfg?.key;
}

export async function providerStatuses(refresh = false): Promise<ProviderStatus[]> {
  const { providers } = getSettings();
  const key = JSON.stringify(providers);
  const cached = g.__satgasProviders;
  if (!refresh && cached && cached.key === key && Date.now() - cached.at < TTL) return cached.list;
  const pending = g.__satgasProviderCheck;
  if (pending?.key === key) return pending.list;
  const list = checkAll(providers, key).finally(() => {
    if (g.__satgasProviderCheck?.list === list) g.__satgasProviderCheck = undefined;
  });
  g.__satgasProviderCheck = { key, list };
  return list;
}

async function checkAll(providers: Settings["providers"], key: string): Promise<ProviderStatus[]> {
  const list = await Promise.all(
    PROVIDERS.map(async (def): Promise<ProviderStatus> => {
      const cfg = providers[def.kind];
      if (!configured(def.kind, cfg)) return { kind: def.kind, state: "off", models: [] };
      try {
        const models = await check(def.kind, cfg ?? {});
        return { kind: def.kind, state: "ok", models };
      } catch (e) {
        if (e instanceof NotConnected && def.auth === "cli") return { kind: def.kind, state: "off", models: [] };
        return { kind: def.kind, state: "failed", error: (e as Error).message, models: [] };
      }
    }),
  );
  g.__satgasProviders = { at: Date.now(), key, list };
  return list;
}

class CheckError extends Error {}
// A CLI nobody has signed in to yet is simply not connected, which is no failure to warn about.
class NotConnected extends CheckError {}

const REJECTED = "The key was rejected.";
const QWEN_HOSTS = ["https://dashscope-intl.aliyuncs.com", "https://dashscope.aliyuncs.com", "https://dashscope-us.aliyuncs.com"];

async function check(kind: ProviderKind, cfg: ProviderConfig): Promise<ModelInfo[]> {
  const key = cfg.key?.trim() ?? "";
  const base = (cfg.baseUrl?.trim() || providerDef.get(kind)?.baseUrl || "").replace(/\/+$/, "");
  switch (kind) {
    case "claude":
      await claudeSignedIn(claudeEnv("claude", cfg, ""));
      return claudeAliases();
    case "claude-token": {
      // The token must be one Anthropic accepts; the models call proves it without spending tokens.
      const res = await get("https://api.anthropic.com/v1/models?limit=100", {
        authorization: `Bearer ${key}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
      }).catch(() => null);
      if (res?.status === 401 || res?.status === 403)
        throw new CheckError("Anthropic rejected this token. Run `claude setup-token` again.");
      await claudeSignedIn(claudeEnv("claude-token", cfg, ""));
      return claudeAliases();
    }
    case "anthropic": {
      const data = await json("https://api.anthropic.com/v1/models?limit=100", { "x-api-key": key, "anthropic-version": "2023-06-01" });
      const live = list(data).map((m) => ({
        id: String(m.id),
        name: String(m.display_name ?? m.id),
        desc: String(m.id),
        efforts: CLAUDE_EFFORTS,
      }));
      return [...(await claudeAliases()), ...live];
    }
    case "deepseek":
      return openaiModels(await json("https://api.deepseek.com/models", bearer(key)));
    case "qwen": {
      // Model Studio serves its OpenAI-compatible model list on the same host as the Anthropic endpoint.
      const models = (host: string) => json(`${host}/compatible-mode/v1/models`, bearer(key));
      const origin = new URL(base).origin;
      try {
        return chatModels(openaiModels(await models(origin)));
      } catch (e) {
        if (!(e instanceof CheckError) || e.message !== REJECTED) throw e;
        // Model Studio keys only work in the region they were made in, so name the endpoint that takes this one.
        for (const host of QWEN_HOSTS.filter((h) => h !== origin)) {
          if (
            await models(host).then(
              () => true,
              () => false,
            )
          )
            throw new CheckError(`This key is for another Model Studio region. Set the endpoint to \`${host}/apps/anthropic\``);
        }
        throw e;
      }
    }
    case "zai":
      return openaiModels(await json("https://api.z.ai/api/paas/v4/models", bearer(key)));
    case "openrouter": {
      await json("https://openrouter.ai/api/v1/key", bearer(key));
      const data = await json("https://openrouter.ai/api/v1/models", {});
      // Agents need tool calls, so models without them would only fail mid-task.
      return list(data)
        .filter((m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools"))
        .map((m) => ({
          id: String(m.id),
          name: String(m.name ?? m.id),
          desc: contextOf(m.context_length),
          efforts: claudeLevels((m.reasoning as { supported_efforts?: unknown } | null)?.supported_efforts),
        }));
    }
    case "ollama": {
      const data = (await json(`${base}/api/tags`, {}, `Ollama is not running at \`${base}\`.`)) as {
        models?: { name?: string; details?: { parameter_size?: string; quantization_level?: string } }[];
      };
      return Promise.all(
        (data.models ?? []).flatMap((m) =>
          m.name
            ? [
                ollamaLevels(base, m.name).then((efforts) => ({
                  id: m.name as string,
                  name: m.name as string,
                  desc: [m.details?.parameter_size, m.details?.quantization_level].filter(Boolean).join(" · ") || undefined,
                  efforts,
                })),
              ]
            : [],
        ),
      );
    }
    case "codex":
      await codexSignedIn();
      return codexModels();
    case "openai": {
      const models = openaiModels(await json("https://api.openai.com/v1/models", bearer(key))).filter(
        (m) => /^(gpt-|o\d|codex)/.test(m.id) && !OPENAI_NOT_AGENT.test(m.id),
      );
      // OpenAI's list says nothing about reasoning, so levels come from Codex's cache for the models it knows.
      const known = new Map((await codexCache()).map((m) => [m.slug, m]));
      return chatModels(models).map((m) => ({ ...m, ...levelsOf(known.get(m.id)) }));
    }
    case "groq":
      return openaiModels(await json(`${base}/models`, bearer(key)));
    case "lmstudio":
      return openaiModels(await json(`${base}/models`, {}, `LM Studio's server is not running at \`${base}\`.`));
  }
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

const contextOf = (n: unknown) =>
  typeof n === "number" && n > 0
    ? `${n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : `${Math.round(n / 1000)}K`} context`
    : undefined;

async function get(url: string, headers: Record<string, string>) {
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
}

async function json(url: string, headers: Record<string, string>, unreachable?: string): Promise<unknown> {
  let res: Response;
  try {
    res = await get(url, headers);
  } catch {
    throw new CheckError(unreachable ?? `Could not reach ${new URL(url).host}.`);
  }
  if (res.status === 401 || res.status === 403) throw new CheckError(REJECTED);
  if (!res.ok) throw new CheckError(`${new URL(url).host} answered ${res.status}.`);
  return res.json().catch(() => {
    throw new CheckError(`${new URL(url).host} sent something unexpected.`);
  });
}

// `--effort` refuses anything else, so a model's `none` or `minimal` cannot be offered. No defaultEffort here: without the
// flag Claude Code picks the level itself, not the model.
function claudeLevels(levels: unknown): string[] | undefined {
  if (!Array.isArray(levels)) return undefined;
  const usable = CLAUDE_EFFORTS.filter((e) => levels.includes(e));
  return usable.length ? usable : undefined;
}

// `thinking.values` holds named levels, or only true and false for a model with a plain on/off switch.
async function ollamaLevels(base: string, model: string): Promise<string[] | undefined> {
  try {
    const res = await fetch(`${base}/api/show`, { method: "POST", body: JSON.stringify({ model }), signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return undefined;
    return claudeLevels(((await res.json()) as { thinking?: { values?: unknown } }).thinking?.values);
  } catch {
    return undefined;
  }
}

const list = (data: unknown): Record<string, unknown>[] => {
  const d = (data as { data?: unknown })?.data;
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
};

// Model Studio lists every model it hosts, including image, video, speech, translation, embedding and internal test
// entries; agents can only use chat models, and a dated snapshot is noise next to its own alias.
const NOT_CHAT =
  /mock|^pre-|image|audio|asr|tts|realtime|omni|embedding|rerank|^wan|^text-|-mt-|^qwen-mt|ocr|character|-vl|vl-|livetranslate|speech|tingwu|intent|ccai/i;
const OPENAI_NOT_AGENT = /transcribe|diarize|search|instruct/;
const SNAPSHOT = /-(\d{4}-\d{2}-\d{2}|\d{4})$/;
export function chatModels(models: ModelInfo[]): ModelInfo[] {
  const ids = new Set(models.map((m) => m.id));
  // Namespaced ids (`kimi/kimi-k3`) are listed but not served on the Anthropic endpoint agents use; the plain id is.
  return models.filter((m) => !m.id.includes("/") && !NOT_CHAT.test(m.id) && !(SNAPSHOT.test(m.id) && ids.has(m.id.replace(SNAPSHOT, ""))));
}

const openaiModels = (data: unknown): ModelInfo[] =>
  list(data)
    .flatMap((m) => (typeof m.id === "string" ? [{ id: m.id, name: m.id }] : []))
    .sort((a, b) => a.id.localeCompare(b.id));

async function run(name: string, cmd: string[], env: Record<string, string | undefined>): Promise<{ code: number; out: string }> {
  const proc = (() => {
    try {
      return Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", env });
    } catch {
      throw new NotConnected(`${name} is not installed.`);
    }
  })();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, TIMEOUT);
  try {
    // Some CLIs print status on stderr (codex login status does), so both streams count.
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
    const code = await proc.exited;
    if (timedOut) throw new CheckError(`${name} did not answer within ${TIMEOUT / 1000}s.`);
    return { code, out: `${stdout}\n${stderr}` };
  } finally {
    clearTimeout(timer);
    if (proc.exitCode === null && proc.signalCode === null) proc.kill();
  }
}

async function claudeSignedIn(env: ReturnType<typeof claudeEnv>) {
  const { out } = await run("Claude Code", [config.claudeBin, "auth", "status", "--json"], childEnv(env));
  let status: { loggedIn?: boolean } = {};
  try {
    status = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  } catch {
    throw new CheckError("Claude Code did not report its sign-in.");
  }
  if (!status.loggedIn) throw new NotConnected("Claude Code is not signed in. Run `claude` to sign in.");
}

async function codexSignedIn() {
  const { code, out } = await run("Codex", [config.codexBin, "login", "status"], childEnv({ set: {}, unset: [] }));
  if (code !== 0 || !/logged in/i.test(out)) throw new NotConnected("Codex is not signed in. Run `codex login`.");
}

// Codex caches the models its account can use, with the reasoning levels each one takes.
async function codexCache(): Promise<Record<string, unknown>[]> {
  const file = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "models_cache.json");
  try {
    const data = (await Bun.file(file).json()) as { models?: Record<string, unknown>[] };
    return (data.models ?? []).filter((m) => typeof m.slug === "string");
  } catch {
    // No cache yet just means Codex has not run; its default model still works.
    return [];
  }
}

const levelsOf = (m: Record<string, unknown> | undefined): Pick<ModelInfo, "efforts" | "defaultEffort"> => ({
  efforts: Array.isArray(m?.supported_reasoning_levels)
    ? (m.supported_reasoning_levels as { effort?: string }[]).flatMap((l) => (l.effort ? [l.effort] : []))
    : undefined,
  defaultEffort: typeof m?.default_reasoning_level === "string" ? m.default_reasoning_level : undefined,
});

async function codexModels(): Promise<ModelInfo[]> {
  return (await codexCache())
    .filter((m) => m.visibility === "list")
    .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))
    .map((m) => ({
      id: String(m.slug),
      name: String(m.display_name ?? m.slug),
      // Shown as a caption, so a closing period goes.
      desc: typeof m.description === "string" && m.description ? m.description.replace(/\.\s*$/, "") : undefined,
      ...levelsOf(m),
    }));
}

const PING_TIMEOUT = 60_000;
const PING = "Reply with OK.";

// Sends one short message through the same CLI and model path the agents use, because a key can pass every check and
// still fail on the model. It costs tokens, so it only runs when someone connects a provider or asks for a test.
async function ping(kind: ProviderKind, cfg: ProviderConfig, model: string) {
  const def = providerDef.get(kind);
  const signal = AbortSignal.timeout(PING_TIMEOUT);
  const cwd = config.dataDir;
  let failure: string | undefined;
  let answered = false;
  const reason = () => failure;
  if (def?.runtime === "claude") {
    const cmd = [config.claudeBin, "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence"];
    if (config.leanAgents) cmd.push("--strict-mcp-config", "--setting-sources", "");
    if (model) cmd.push("--model", model);
    cmd.push("--system-prompt", PING, "--tools", "");
    const env = claudeEnv(kind, cfg, model);
    const set = nativeClaude(kind) ? env.set : { ...env.set, CLAUDE_CODE_MAX_OUTPUT_TOKENS: "64" };
    await runJsonl(
      cmd,
      { prompt: "hi", cwd, signal },
      (ev) => {
        if (ev.type !== "result") return;
        answered = true;
        if (ev.is_error || ev.subtype !== "success") failure = String(ev.result || ev.subtype || "The model did not answer.");
      },
      reason,
      { set, unset: env.unset },
    );
  } else {
    const cmd = [config.codexBin, "exec", "--json", "--ephemeral", "--skip-git-repo-check", "-C", cwd, "-s", "read-only"];
    if (config.leanAgents) cmd.push("--ignore-user-config");
    if (model) cmd.push("-m", model);
    cmd.push(...codexProviderArgs(kind, cfg), "-");
    const key = cfg.key?.trim();
    await runJsonl(
      cmd,
      { prompt: PING, cwd, signal },
      (ev) => {
        if (ev.type === "turn.completed" || ev.type === "item.completed") answered = true;
        else if (ev.type === "turn.failed") failure = ev.error?.message ?? "The model did not answer.";
      },
      reason,
      { set: key ? { [CODEX_KEY_VAR]: key } : {}, unset: [] },
    );
  }
  if (failure) throw new CheckError(clip(failure, 300));
  if (!answered) throw new CheckError("The model did not answer.");
}

let testing = false;

// `typed` is what the dialog holds right now, so a key can be tried before it is saved; an empty key keeps the saved one.
export async function testProvider(kind: ProviderKind, typed: ProviderConfig = {}): Promise<string | null> {
  const def = providerDef.get(kind);
  if (!def) return "Unknown provider.";
  if (testing) return "A test is already running.";
  testing = true;
  try {
    const { providers, agents } = getSettings();
    const saved = providers[kind] ?? {};
    const cfg: ProviderConfig = {
      ...saved,
      ...(typed.key?.trim() ? { key: typed.key.trim() } : {}),
      ...(typed.baseUrl?.trim() ? { baseUrl: typed.baseUrl.trim() } : {}),
    };
    if (def.auth === "key" && !cfg.key) return "Add the key first.";
    const models = await check(kind, cfg);
    // The model the agents will really use when this provider is the active one; otherwise the lightest it offers.
    const chosen = agents[def.runtime].provider === kind ? agents[def.runtime].model : "";
    const model = chosen || (nativeClaude(kind) ? "haiku" : (models[0]?.id ?? ""));
    await ping(kind, cfg, model);
    return null;
  } catch (e) {
    return clip((e as Error).message, 300);
  } finally {
    testing = false;
  }
}
