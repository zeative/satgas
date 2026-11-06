import { CATALOG, catalogOf } from "../shared/catalog";
import { DEFAULT_PROVIDER, PROVIDERS } from "../shared/providers";
import { TOOL_CATALOG } from "../shared/tools";
import { claudeModel } from "./agents/claude";
import { config } from "./config";
import { getSettings } from "./settings";
import { enabledSkills } from "./skills";
import { describeTools } from "./tools";

// What Satgas itself is set up with on this machine, in words, so the planner and every agent know their own system:
// the agents and models, the connectors the person installed (with what each covers), skills and command-line tools.
// Never carries a secret: keys, headers and env values stay out.

// Command-line tools worth naming, with what each reaches. They are the fallback: a connector the person installed
// for the same job comes first.
const CLIS: Record<string, string> = {
  gh: "GitHub",
  glab: "GitLab",
  git: "git",
  docker: "Docker",
  kubectl: "Kubernetes",
  vercel: "Vercel",
  netlify: "Netlify",
  wrangler: "Cloudflare",
  flyctl: "Fly.io",
  railway: "Railway",
  supabase: "Supabase",
  firebase: "Firebase",
  heroku: "Heroku",
  doctl: "DigitalOcean",
  aws: "AWS",
  gcloud: "Google Cloud",
  az: "Azure",
  terraform: "Terraform",
  stripe: "Stripe",
  node: "Node.js",
  bun: "Bun",
  deno: "Deno",
  python3: "Python",
  uv: "uv (Python)",
  go: "Go",
  cargo: "Rust",
  java: "Java",
  php: "PHP",
  ruby: "Ruby",
  psql: "PostgreSQL",
  mysql: "MySQL",
  sqlite3: "SQLite",
  "redis-cli": "Redis",
  mongosh: "MongoDB",
  ffmpeg: "audio and video",
  magick: "ImageMagick",
  pandoc: "document conversion",
  soffice: "LibreOffice",
  "yt-dlp": "online video download",
  jq: "JSON",
  rg: "ripgrep",
};

// PATH rarely changes while Satgas runs, so one look serves a minute of plans and tasks.
const TTL = 60_000;
const hot = globalThis as typeof globalThis & { __satgasClis?: { at: number; clis: string[] } };

export function clis(): string[] {
  const cached = hot.__satgasClis;
  if (cached && Date.now() - cached.at < TTL) return cached.clis;
  const found = Object.entries(CLIS)
    .filter(([bin]) => Bun.which(bin))
    .map(([bin, what]) => (bin === what ? bin : `${bin} (${what})`));
  hot.__satgasClis = { at: Date.now(), clis: found };
  return found;
}

const providerName = (kind: string) => PROVIDERS.find((p) => p.kind === kind)?.name ?? kind;
const firstSentence = (s: string) => {
  const one = /^[^.!?]*[.!?]?/.exec(s.trim())?.[0] ?? s;
  return one.length > 140 ? `${one.slice(0, 139)}…` : one;
};

export function describeSystem(): string {
  const { agents, mcpServers } = getSettings();
  const claude = agents.claude;
  const codex = agents.codex;
  const claudeLine = claude.tasks
    ? `Claude Code: on, model ${claudeModel() || "its CLI default"} through ${providerName(claude.provider ?? DEFAULT_PROVIDER.claude)}; you, the lead, ${claude.plannerModel || config.plannerModel ? `use ${claude.plannerModel || config.plannerModel}` : "use the same model"}`
    : "Claude Code: off for tasks (it still plans)";
  const codexLine = codex.tasks
    ? `Codex: on, model ${codex.model || config.codexModel || "its CLI default"} through ${providerName(codex.provider)}`
    : "Codex: off";

  const on = mcpServers.filter((s) => s.enabled);
  const connectors = on.map((s) => {
    const known = catalogOf(s);
    return `- ${s.name}${known ? ` (${known.name}): ${known.desc.en}` : ": a custom connector"}`;
  });
  const off = mcpServers.filter((s) => !s.enabled).map((s) => s.name);
  const installed = new Set(mcpServers.map((s) => catalogOf(s)?.id).filter(Boolean));
  const more = CATALOG.filter((c) => !installed.has(c.id)).map((c) => c.id);

  const skills = enabledSkills().map((s) => `- ${s.name}${s.builtin ? " (built in)" : ""}: ${firstSentence(s.description)}`);
  const tools = clis();

  return [
    "<satgas_system>",
    "The Satgas you run in, as the person set it up in Integrations (Agents, Connectors, Skills and Tools tabs):",
    `Agents:\n- ${claudeLine}\n- ${codexLine}`,
    connectors.length
      ? `Connectors the person installed for agents to use; for their area they come first, before any command-line tool. Their tools carry the connector's name (mcp__github__… in Claude Code, mcp__satgas_github__… in Codex):\n${connectors.join("\n")}`
      : "Connectors: none installed.",
    off.length && `Connectors set up but switched off: ${off.join(", ")}`,
    more.length && `Connectors in the catalog but not installed, by id (recommend one when it would clearly help): ${more.join(", ")}`,
    skills.length && `Skills:\n${skills.join("\n")}`,
    describeTools(),
    `Tool ids: ${TOOL_CATALOG.map((d) => `${d.id} (${d.name}, ${getSettings().tools.some((x) => x.catalogId === d.id && x.enabled) ? "on" : "off"})`).join(", ")}`,
    tools.length && `Command-line tools on PATH, the fallback when no connector covers the job or one fails: ${tools.join(", ")}`,
    "</satgas_system>",
  ]
    .filter(Boolean)
    .join("\n");
}
