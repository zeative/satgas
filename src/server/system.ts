import pkg from "../../package.json";
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

// Local command-line tools worth naming. The ones that reach outside accounts are left out: those go through connectors.
const CLIS: Record<string, string> = {
  git: "git",
  docker: "Docker",
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

// What Satgas itself is, so the lead answers questions about it directly instead of searching: on the web "satgas" is
// mostly other projects. The version and where it runs come from this instance; the full steps are in the README.
export function describeSatgas(): string {
  const repo = `https://github.com/${config.repo}`;
  const where = config.container
    ? "in a Docker container"
    : config.publicUrl
      ? `on a server, at ${config.publicUrl}`
      : "on the person's own computer";
  return [
    "<satgas_about>",
    `Satgas ${pkg.version}, running ${where}. Open source under AGPL-3.0: ${repo}. Its README is the full guide (setup, self-hosting, updating, configuration, security), and agents can read it as reference/satgas-guide.md in the satgas skill.`,
    "What it is: a self-hosted workspace where a lead hires a team of agents (the Claude Code or Codex CLI on the model the person picks), splits the work and puts results on a shared canvas as cards.",
    "Where things are: Home starts a board. Pipeline shows every board by status. Schedules runs a prompt on a clock or when a webhook is called. Memory holds the person's rules and what Satgas remembers. Integrations has Connectors, Providers, Skills and Tools. Configurations has Settings, Usage and About. On a board: chat sessions, Chat Only (⌘J or Ctrl J), forking a board, watching a pull request, and the command palette (⌘K or Ctrl K).",
    `Run it yourself: \`git clone ${repo}\`, then \`bun install\` and \`bun run dev\` on a computer; \`bun run build\` gives one binary, \`dist/satgas\`; or \`docker compose up -d\` from the repo, with the image ghcr.io/zeative/satgas. On a server it sits behind an HTTPS proxy with \`SATGAS_HOST=0.0.0.0\`, \`SATGAS_PUBLIC_URL\` and \`SATGAS_TOKEN\` set. The repo also has a Dokploy template.`,
    "Updating: the Update available button in the sidebar. In Docker, pulling a newer image is what brings newer bundled programs.",
    "Channels: Telegram and WhatsApp, experimental, turned on with `SATGAS_CHANNELS=1`.",
    "Not possible yet: Google, Slack, Jira or other services that need their own sign-in app, connectors that move money, and Discord.",
    "Questions about Satgas itself are answered from this block and the README, never by searching the web.",
    "</satgas_about>",
  ].join("\n");
}

export function describeSystem(): string {
  const { agents, mcpServers } = getSettings();
  const claude = agents.claude;
  const codex = agents.codex;
  const claudeLine = claude.tasks
    ? `Claude Code: on, model ${claudeModel() || "its CLI default"} through ${providerName(claude.provider ?? DEFAULT_PROVIDER.claude)}; you, the lead, ${config.plannerModel ? `use ${config.plannerModel}` : "use the same model"}`
    : "Claude Code: off";
  const codexLine = codex.tasks
    ? `Codex: on, model ${codex.model || config.codexModel || "its CLI default"} through ${providerName(codex.provider)}; you, the lead, use the same model`
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
    describeSatgas(),
    "<satgas_system>",
    "The Satgas you run in, as the person set it up in Integrations (Connectors, Providers, Skills and Tools tabs):",
    `Agents:\n- ${claudeLine}\n- ${codexLine}`,
    connectors.length
      ? `Connectors the person installed for agents to use. Their tools carry the connector's name (mcp__github__… in Claude Code, mcp__satgas_github__… in Codex):\n${connectors.join("\n")}`
      : "Connectors: none installed.",
    "The person's outside accounts and services (GitHub, Vercel, cloud accounts and the like) are reached only through connectors. With no connector for one, it cannot be used until the person connects it, whatever is signed in on this machine.",
    off.length && `Connectors set up but switched off: ${off.join(", ")}`,
    more.length && `Connectors in the catalog but not installed, by id (recommend one when it would clearly help): ${more.join(", ")}`,
    skills.length && `Skills:\n${skills.join("\n")}`,
    describeTools(),
    `Tool ids: ${TOOL_CATALOG.map((d) => `${d.id} (${d.name}, ${getSettings().tools.some((x) => x.catalogId === d.id && x.enabled) ? "on" : "off"})`).join(", ")}`,
    tools.length && `Local command-line tools on PATH: ${tools.join(", ")}`,
    "</satgas_system>",
  ]
    .filter(Boolean)
    .join("\n");
}
