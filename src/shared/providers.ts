// Model providers: where each agent CLI sends its model calls. Shared by server and client.
// Claude Code reaches Anthropic-compatible endpoints through env; Codex reaches Responses-API endpoints through `-c`.

export type Runtime = "claude" | "codex";

export type ProviderKind =
  | "claude"
  | "claude-token"
  | "anthropic"
  | "deepseek"
  | "qwen"
  | "zai"
  | "openrouter"
  | "ollama"
  | "codex"
  | "openai"
  | "groq"
  | "lmstudio";

export type Text = { en: string; id: string };

export interface ProviderDef {
  kind: ProviderKind;
  runtime: Runtime;
  name: string;
  by: string;
  // icon: a full app icon (square artwork) that gets app-icon corners; otherwise a bare mark.
  logo: { src: string; dark?: string; icon?: boolean };
  desc: Text;
  // cli: the CLI's own sign-in; key: a pasted key or token; local: a server on this machine, no key.
  auth: "cli" | "key" | "local";
  keyLabel?: Text;
  keyHelp?: string;
  // Default endpoint; people can point local servers and regional accounts elsewhere.
  baseUrl?: string;
  baseUrlEditable?: boolean;
  docs: string;
}

// Endpoints and variable names were checked against each provider's own docs (2026-11).
export const PROVIDERS: ProviderDef[] = [
  {
    kind: "claude",
    runtime: "claude",
    name: "Claude",
    by: "Anthropic",
    logo: { src: "/brands/claude.svg" },
    desc: { en: "Your Claude Code sign-in on this machine", id: "Akun Claude Code di mesin ini" },
    auth: "cli",
    docs: "https://code.claude.com/docs/en/authentication",
  },
  {
    kind: "claude-token",
    runtime: "claude",
    name: "Claude subscription",
    by: "Anthropic",
    logo: { src: "/brands/claude.svg" },
    desc: { en: "Pro or Max plan via `claude setup-token`", id: "Paket Pro atau Max via `claude setup-token`" },
    auth: "key",
    keyLabel: { en: "Token from `claude setup-token`", id: "Token dari `claude setup-token`" },
    keyHelp: "https://code.claude.com/docs/en/authentication#generate-a-long-lived-token",
    docs: "https://code.claude.com/docs/en/authentication",
  },
  {
    kind: "anthropic",
    runtime: "claude",
    name: "Anthropic API",
    by: "Anthropic",
    logo: { src: "/brands/anthropic-icon.svg", icon: true },
    desc: { en: "Pay per token with a Claude Console key", id: "Bayar per token dengan key Claude Console" },
    auth: "key",
    keyLabel: { en: "API key", id: "API key" },
    keyHelp: "https://platform.claude.com/settings/keys",
    docs: "https://code.claude.com/docs/en/authentication",
  },
  {
    kind: "deepseek",
    runtime: "claude",
    name: "DeepSeek",
    by: "DeepSeek",
    logo: { src: "/brands/deepseek.svg" },
    desc: { en: "DeepSeek models through their own API", id: "Model DeepSeek lewat API mereka" },
    auth: "key",
    keyLabel: { en: "API key", id: "API key" },
    keyHelp: "https://platform.deepseek.com/api_keys",
    baseUrl: "https://api.deepseek.com/anthropic",
    docs: "https://api-docs.deepseek.com/guides/anthropic_api",
  },
  {
    kind: "qwen",
    runtime: "claude",
    name: "Qwen",
    by: "Alibaba Cloud",
    logo: { src: "/brands/qwen-color.svg" },
    desc: { en: "Qwen models on Model Studio, pay as you go", id: "Model Qwen di Model Studio, bayar per pakai" },
    auth: "key",
    keyLabel: { en: "Model Studio API key", id: "API key Model Studio" },
    keyHelp: "https://modelstudio.console.alibabacloud.com/",
    // The international (Singapore) region; Beijing and US keys get pointed at their own endpoint by the check.
    baseUrl: "https://dashscope-intl.aliyuncs.com/apps/anthropic",
    baseUrlEditable: true,
    docs: "https://www.alibabacloud.com/help/en/model-studio/claude-code",
  },
  {
    kind: "zai",
    runtime: "claude",
    name: "Z.ai",
    by: "Z.ai",
    logo: { src: "/brands/zai.png", icon: true },
    desc: { en: "GLM models through Z.ai's API", id: "Model GLM lewat API Z.ai" },
    auth: "key",
    keyLabel: { en: "API key", id: "API key" },
    keyHelp: "https://z.ai/manage-apikey/apikey-list",
    baseUrl: "https://api.z.ai/api/anthropic",
    docs: "https://docs.z.ai/devpack/tool/claude",
  },
  {
    kind: "openrouter",
    runtime: "claude",
    name: "OpenRouter",
    by: "OpenRouter",
    logo: { src: "/brands/openrouter.png", icon: true },
    desc: { en: "Hundreds of models behind one key", id: "Ratusan model di balik satu key" },
    auth: "key",
    keyLabel: { en: "API key", id: "API key" },
    keyHelp: "https://openrouter.ai/settings/keys",
    baseUrl: "https://openrouter.ai/api",
    docs: "https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration",
  },
  {
    kind: "ollama",
    runtime: "claude",
    name: "Ollama",
    by: "Ollama",
    logo: { src: "/brands/ollama.png", icon: true },
    desc: { en: "Open models running on this machine", id: "Model terbuka di mesin ini" },
    auth: "local",
    baseUrl: "http://localhost:11434",
    baseUrlEditable: true,
    docs: "https://docs.ollama.com/integrations/claude-code",
  },
  {
    kind: "codex",
    runtime: "codex",
    name: "Codex",
    by: "OpenAI",
    logo: { src: "/brands/codex.svg", icon: true },
    desc: { en: "Your Codex sign-in on this machine", id: "Akun Codex di mesin ini" },
    auth: "cli",
    docs: "https://github.com/openai/codex",
  },
  {
    kind: "openai",
    runtime: "codex",
    name: "OpenAI API",
    by: "OpenAI",
    logo: { src: "/brands/openai.png", icon: true },
    desc: { en: "Pay per token with an OpenAI Platform key", id: "Bayar per token dengan key OpenAI Platform" },
    auth: "key",
    keyLabel: { en: "API key", id: "API key" },
    keyHelp: "https://platform.openai.com/api-keys",
    baseUrl: "https://api.openai.com/v1",
    docs: "https://github.com/openai/codex",
  },
  {
    kind: "groq",
    runtime: "codex",
    name: "Groq",
    by: "Groq",
    logo: { src: "/brands/groq.svg", icon: true },
    desc: { en: "Open models on Groq's fast inference", id: "Model terbuka di inferensi cepat Groq" },
    auth: "key",
    keyLabel: { en: "API key", id: "API key" },
    keyHelp: "https://console.groq.com/keys",
    baseUrl: "https://api.groq.com/openai/v1",
    docs: "https://console.groq.com/docs/responses-api",
  },
  {
    kind: "lmstudio",
    runtime: "codex",
    name: "LM Studio",
    by: "LM Studio",
    logo: { src: "/brands/lmstudio.png", icon: true },
    desc: { en: "Models loaded in LM Studio on this machine", id: "Model yang dimuat di LM Studio di mesin ini" },
    auth: "local",
    baseUrl: "http://localhost:1234/v1",
    baseUrlEditable: true,
    docs: "https://lmstudio.ai/docs/integrations/codex",
  },
];

export const providerDef = new Map(PROVIDERS.map((p) => [p.kind, p]));
export const PROVIDER_KINDS = PROVIDERS.map((p) => p.kind);
export const DEFAULT_PROVIDER: Record<Runtime, ProviderKind> = { claude: "claude", codex: "codex" };

// Any provider can start work, since the lead runs on whichever agent serves it. A CLI sign-in comes last: it needs a terminal on the server.
export const LEAD_PROVIDERS = [...PROVIDERS].sort((a, b) => Number(a.auth === "cli") - Number(b.auth === "cli"));

// No answer yet means not blocked: a slow check must not lock out someone already connected.
export function leadBlocked(selected: ProviderKind, statuses: { kind: ProviderKind; state: string }[] | null): boolean {
  return !!statuses && statuses.find((s) => s.kind === selected)?.state !== "ok";
}

export interface ProviderConfig {
  key?: string;
  baseUrl?: string;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const CLAUDE_EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

// Native Anthropic access understands Claude's model aliases; gateways only know their own model ids.
export const nativeClaude = (kind: ProviderKind) => kind === "claude" || kind === "claude-token" || kind === "anthropic";

// The cloud switches outrank every key, so an exported one would send a picked provider's calls to Bedrock/Vertex/Foundry.
const CLAUDE_AUTH_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

// Env changes for one Claude Code spawn: values to set, and inherited auth variables to drop so they cannot outrank it.
export function claudeEnv(kind: ProviderKind, cfg: ProviderConfig, model: string): { set: Record<string, string>; unset: string[] } {
  if (kind === "claude") return { set: {}, unset: [] };
  const key = cfg.key?.trim() ?? "";
  if (kind === "claude-token") return { set: { CLAUDE_CODE_OAUTH_TOKEN: key }, unset: CLAUDE_AUTH_VARS };
  if (kind === "anthropic") return { set: { ANTHROPIC_API_KEY: key }, unset: CLAUDE_AUTH_VARS };
  const def = providerDef.get(kind);
  const base = (cfg.baseUrl?.trim() || def?.baseUrl || "").replace(/\/+$/, "");
  const set: Record<string, string> = { ANTHROPIC_BASE_URL: base, ANTHROPIC_AUTH_TOKEN: kind === "ollama" ? "ollama" : key };
  // DeepSeek documents the x-api-key header, so it gets the key both ways.
  if (kind === "deepseek") set.ANTHROPIC_API_KEY = key;
  // Claude Code calls its small and sub-agent models by Claude names a gateway does not have.
  if (model) {
    for (const v of [
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "CLAUDE_CODE_SUBAGENT_MODEL",
    ])
      set[v] = model;
  }
  return { set, unset: CLAUDE_AUTH_VARS };
}

export const CODEX_KEY_VAR = "SATGAS_PROVIDER_KEY";

// `-c` overrides that point one Codex spawn at a provider; the key travels in CODEX_KEY_VAR, never on the command line.
// OpenAI's own endpoint stays on Codex's built-in provider and its key variable: on a provider of ours, models never see
// the connectors' tools.
const builtInOpenAI = (kind: ProviderKind, cfg: ProviderConfig) =>
  kind === "openai" && (cfg.baseUrl?.trim() || providerDef.get(kind)?.baseUrl || "").replace(/\/+$/, "") === providerDef.get(kind)?.baseUrl;

export const codexKeyVar = (kind: ProviderKind, cfg: ProviderConfig) => (builtInOpenAI(kind, cfg) ? "CODEX_API_KEY" : CODEX_KEY_VAR);

export function codexProviderArgs(kind: ProviderKind, cfg: ProviderConfig): string[] {
  if (kind === "codex" || builtInOpenAI(kind, cfg)) return [];
  const def = providerDef.get(kind);
  const base = (cfg.baseUrl?.trim() || def?.baseUrl || "").replace(/\/+$/, "");
  const id = "satgas";
  return [
    "-c",
    `model_providers.${id}.name=${JSON.stringify(def?.name ?? kind)}`,
    "-c",
    `model_providers.${id}.base_url=${JSON.stringify(base)}`,
    "-c",
    `model_providers.${id}.wire_api="responses"`,
    ...(def?.auth === "key" ? ["-c", `model_providers.${id}.env_key=${JSON.stringify(CODEX_KEY_VAR)}`] : []),
    "-c",
    `model_provider="${id}"`,
  ];
}
