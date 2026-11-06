import { GITHUB_MCP_ALL, type McpServer } from "./settings";

export type Text = { en: string; id: string };

// A value the person pastes in once; it lands in the server's env or headers.
export interface Secret {
  key: string;
  label: Text;
  in: "env" | "header";
  // Prepended to the pasted value, e.g. "Bearer " for an Authorization header.
  prefix?: string;
  optional?: boolean;
  help: string;
}

export type Category = "browser" | "code" | "data";
export const CATEGORIES: Category[] = ["browser", "code", "data"];

export interface CatalogItem {
  // Also the server name, so agents see tools as mcp__<id>__…; must match MCP_NAME.
  id: string;
  name: string;
  by: string;
  // The publisher's site and the connector's own documentation.
  site: string;
  docs: string;
  category: Category;
  // icon: a full app icon (square artwork) that gets app-icon corners; otherwise a bare mark.
  logo: { src: string; dark?: string; icon?: boolean };
  desc: Text;
  about: Text;
  server: { transport: "stdio"; command: string; args: string[] } | { transport: "http"; url: string };
  secrets?: Secret[];
  note?: Text;
}

const npx = (...args: string[]) => ({ transport: "stdio" as const, command: "npx", args: ["-y", ...args] });

// Every entry was checked against its publisher's package or README (2026-11); commands run as written.
export const CATALOG: CatalogItem[] = [
  {
    id: "playwright",
    name: "Playwright",
    by: "Microsoft",
    site: "https://playwright.dev",
    docs: "https://github.com/microsoft/playwright-mcp",
    category: "browser",
    logo: { src: "/brands/playwright.svg" },
    desc: {
      en: "Drive a real browser: open pages, click, fill forms and take screenshots",
      id: "Kendalikan browser sungguhan: buka halaman, klik, isi form, dan ambil tangkapan layar",
    },
    about: {
      en: "Agents get a real Chromium window they drive through the page's accessibility tree, not screenshots. They can open what they just built, click through it, fill forms, read the console and save screenshots as proof.",
      id: "Agen mendapat jendela Chromium sungguhan yang dikendalikan lewat accessibility tree halaman, bukan tangkapan layar. Mereka bisa membuka hasil kerjanya, mengklik, mengisi form, membaca console, dan menyimpan tangkapan layar sebagai bukti.",
    },
    server: npx("@playwright/mcp@latest"),
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools",
    by: "Google",
    site: "https://developer.chrome.com",
    docs: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
    category: "browser",
    logo: { src: "/brands/chrome-devtools.png", icon: true },
    desc: {
      en: "Inspect pages in Chrome: console, network requests and performance traces",
      id: "Periksa halaman di Chrome: console, request jaringan, dan jejak performa",
    },
    about: {
      en: "Gives agents the Chrome DevTools they would use by hand: console messages, network requests and performance traces with insights, on a live page, so they can find why something is slow or broken.",
      id: "Memberi agen Chrome DevTools yang biasa dipakai manual: pesan console, request jaringan, jejak performa, dan pemeriksaan halaman langsung, supaya mereka bisa menemukan kenapa sesuatu lambat atau rusak.",
    },
    server: npx("chrome-devtools-mcp@latest"),
  },
  {
    id: "context7",
    name: "Context7",
    by: "Upstash",
    site: "https://upstash.com",
    docs: "https://github.com/upstash/context7",
    category: "code",
    logo: { src: "/brands/context7.png", icon: true },
    desc: {
      en: "Up-to-date documentation and code examples for any library",
      id: "Dokumentasi dan contoh kode terbaru untuk library apa pun",
    },
    about: {
      en: "Pulls current, version-specific documentation and code examples for the libraries a task uses, so agents write against today's APIs instead of what they remember. Works without a key; a free key raises the rate limit.",
      id: "Mengambil dokumentasi dan contoh kode terbaru sesuai versi library yang dipakai tugas, supaya agen menulis kode untuk API hari ini, bukan yang mereka ingat. Jalan tanpa key; key gratis menaikkan batas pemakaian.",
    },
    server: npx("@upstash/context7-mcp"),
    secrets: [
      {
        key: "CONTEXT7_API_KEY",
        label: { en: "API key (optional, raises rate limits)", id: "API key (opsional, menaikkan batas pemakaian)" },
        in: "env",
        optional: true,
        help: "https://context7.com/dashboard",
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    by: "GitHub",
    site: "https://github.com",
    docs: "https://github.com/github/github-mcp-server",
    category: "code",
    logo: { src: "/brands/github.png", icon: true },
    desc: { en: "Repositories, issues, pull requests and Actions runs", id: "Repository, issue, pull request, dan run Actions" },
    about: {
      en: "GitHub's own server: agents can read code across repositories, open and comment on issues and pull requests, check Actions runs and read notifications.",
      id: "Server resmi GitHub: agen bisa membaca kode di berbagai repository, membuka dan mengomentari issue serta pull request, mengecek run Actions, dan membaca notifikasi.",
    },
    // Every toolset, so agents also reach notifications and Actions runs.
    server: { transport: "http", url: GITHUB_MCP_ALL },
    secrets: [
      {
        key: "Authorization",
        label: { en: "Personal access token", id: "Personal access token" },
        in: "header",
        prefix: "Bearer ",
        help: "https://github.com/settings/personal-access-tokens/new",
      },
    ],
  },
  {
    id: "zapi",
    name: "Zapi",
    by: "Zapi",
    site: "https://zapi.ink",
    docs: "https://zapi.ink/mcp",
    category: "data",
    logo: { src: "/brands/zapi.svg", icon: true },
    desc: {
      en: "Social media, search and other public data through one API key",
      id: "Media sosial, pencarian, dan data publik lain lewat satu API key",
    },
    about: {
      en: "Zapi's remote server: agents search its catalogue of scrapers, read what each one takes and returns, and run it to get clean JSON back. Every call counts against your key's monthly quota.",
      id: "Server remote Zapi: agen mencari di katalog scraper-nya, membaca input dan output tiap scraper, lalu menjalankannya untuk mendapat JSON yang bersih. Setiap panggilan memakai kuota bulanan key kamu.",
    },
    server: { transport: "http", url: "https://mcp.zapi.ink/mcp" },
    secrets: [{ key: "x-api-key", label: { en: "API key", id: "API key" }, in: "header", help: "https://zapi.ink/dashboard/keys" }],
  },
  // Placeholder: Monveo has no MCP server yet, so this URL answers nothing until the real one replaces it.
  {
    id: "monveo",
    name: "Monveo",
    by: "Monveo",
    site: "https://monveo.app",
    docs: "https://monveo.app",
    category: "data",
    logo: { src: "/brands/monveo.png", icon: true },
    desc: {
      en: "Money tracking with voice, receipt scanning and analytics",
      id: "Pencatatan uang lewat suara, scan struk, dan analitik",
    },
    about: {
      en: "Monveo keeps everyday money organized in spaces, with voice capture, receipt scanning and analytics. Its connector is not live yet, so this entry only holds the place.",
      id: "Monveo merapikan uang harian ke dalam space, dengan pencatatan suara, scan struk, dan analitik. Connector-nya belum aktif, jadi entri ini baru penanda tempat.",
    },
    server: { transport: "http", url: "https://mcp.monveo.app/mcp" },
    note: { en: "Not available yet", id: "Belum tersedia" },
  },
];

export const byId = new Map(CATALOG.map((c) => [c.id, c]));

// The catalog entry a server was added from. Servers saved before catalogId existed count only when name and command both match,
// so a custom server that merely shares a name stays custom.
export function catalogOf(s: McpServer): CatalogItem | undefined {
  if (s.catalogId) return byId.get(s.catalogId);
  const item = byId.get(s.name);
  if (!item) return undefined;
  if (item.server.transport === "http") return s.transport === "http" && s.url === item.server.url ? item : undefined;
  const { command, args } = item.server;
  return s.transport === "stdio" && s.command === command && (s.args ?? []).join(" ") === args.join(" ") ? item : undefined;
}

// The entry's own id when it is free, otherwise the first free id-2, id-3…, since two servers cannot share a name.
const freeName = (id: string, taken: McpServer[]) => {
  const used = new Set(taken.map((s) => s.name.toLowerCase()));
  let name = id;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${id}-${n}`;
  return name;
};

// Builds the server a catalog entry installs, with the pasted secrets in place.
export function toServer(item: CatalogItem, values: Record<string, string>, id: string, taken: McpServer[] = []): McpServer {
  const filled = Object.fromEntries(
    (item.secrets ?? []).flatMap((s) => {
      const value = values[s.key]?.trim();
      return value ? [[s.key, `${s.prefix ?? ""}${value}`]] : [];
    }),
  ) as Record<string, string>;
  const pick = (where: Secret["in"]) =>
    Object.fromEntries(Object.entries(filled).filter(([k]) => item.secrets?.find((s) => s.key === k)?.in === where));
  const base = { id, name: freeName(item.id, taken), catalogId: item.id, enabled: true };
  return item.server.transport === "http"
    ? { ...base, transport: "http", url: item.server.url, headers: pick("header") }
    : { ...base, transport: "stdio", command: item.server.command, args: item.server.args, env: pick("env") };
}
