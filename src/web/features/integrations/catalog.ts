import type { McpServer } from "../../../shared/settings";

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

export type Category = "browser" | "code" | "research" | "data" | "work" | "reasoning";
export const CATEGORIES: Category[] = ["browser", "code", "research", "data", "work", "reasoning"];

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
      en: "GitHub's own server: agents can read code across repositories, open and comment on issues and pull requests, and check Actions runs. It is a remote server, so only Claude Code can use it here.",
      id: "Server resmi GitHub: agen bisa membaca kode di berbagai repository, membuka dan mengomentari issue serta pull request, dan mengecek run Actions. Ini server remote, jadi di sini hanya Claude Code yang bisa memakainya.",
    },
    server: { transport: "http", url: "https://api.githubcopilot.com/mcp/" },
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
    id: "supabase",
    name: "Supabase",
    by: "Supabase",
    site: "https://supabase.com",
    docs: "https://github.com/supabase/mcp",
    category: "data",
    logo: { src: "/brands/supabase.svg" },
    desc: {
      en: "Read your projects' tables, logs and docs, without writing to them",
      id: "Baca tabel, log, dan dokumen proyek kamu tanpa mengubahnya",
    },
    about: {
      en: "Lets agents look at your Supabase projects: list tables, run read-only SQL, read logs and search the Supabase docs. Satgas starts it in read-only mode, so nothing in your database changes.",
      id: "Agen bisa melihat proyek Supabase kamu: daftar tabel, menjalankan SQL hanya-baca, membaca log, dan mencari di dokumentasi Supabase. Satgas menjalankannya dalam mode hanya-baca, jadi database kamu tidak berubah.",
    },
    server: npx("@supabase/mcp-server-supabase@latest", "--read-only"),
    secrets: [
      {
        key: "SUPABASE_ACCESS_TOKEN",
        label: { en: "Personal access token", id: "Personal access token" },
        in: "env",
        help: "https://supabase.com/dashboard/account/tokens",
      },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    by: "Stripe",
    site: "https://stripe.com",
    docs: "https://docs.stripe.com/mcp",
    category: "data",
    logo: { src: "/brands/stripe.png", icon: true },
    desc: {
      en: "Customers, payments, products and invoices in your Stripe account",
      id: "Pelanggan, pembayaran, produk, dan invoice di akun Stripe kamu",
    },
    about: {
      en: "Stripe's server for working with your account: customers, products, prices, payment links, invoices and refunds. Use a test-mode key unless you want agents acting on live money.",
      id: "Server resmi Stripe untuk akun kamu: pelanggan, produk, harga, payment link, invoice, dan refund. Pakai key mode test kecuali kamu memang mau agen bertindak pada uang sungguhan.",
    },
    server: npx("@stripe/mcp", "--tools=all"),
    secrets: [
      {
        key: "STRIPE_SECRET_KEY",
        label: { en: "Secret key (a test key is safest)", id: "Secret key (paling aman pakai test key)" },
        in: "env",
        help: "https://dashboard.stripe.com/apikeys",
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    by: "Notion",
    site: "https://www.notion.com",
    docs: "https://github.com/makenotion/notion-mcp-server",
    category: "work",
    logo: { src: "/brands/notion.png", icon: true },
    desc: { en: "Search, read and update pages and databases", id: "Cari, baca, dan perbarui halaman serta database" },
    about: {
      en: "Notion's server: agents can search your workspace, read pages and databases, and add or update content. They only see pages you share with the integration.",
      id: "Server resmi Notion: agen bisa mencari di workspace, membaca halaman dan database, serta menambah atau memperbarui isi. Mereka hanya melihat halaman yang kamu bagikan ke integrasinya.",
    },
    server: npx("@notionhq/notion-mcp-server"),
    secrets: [
      {
        key: "NOTION_TOKEN",
        label: { en: "Integration token", id: "Token integrasi" },
        in: "env",
        help: "https://www.notion.so/profile/integrations",
      },
    ],
  },
  {
    id: "sentry",
    name: "Sentry",
    by: "Sentry",
    site: "https://sentry.io",
    docs: "https://mcp.sentry.dev/",
    category: "code",
    logo: { src: "/brands/sentry.png", icon: true },
    desc: { en: "Issues, errors and stack traces from your Sentry projects", id: "Issue, error, dan stack trace dari proyek Sentry kamu" },
    about: {
      en: "Sentry's server: agents can look up issues and errors, read stack traces and events, and use that context while they fix the bug.",
      id: "Server resmi Sentry: agen bisa mencari issue dan error, membaca stack trace dan event, lalu memakai konteks itu saat memperbaiki bug.",
    },
    server: npx("@sentry/mcp-server@latest"),
    secrets: [
      {
        key: "SENTRY_ACCESS_TOKEN",
        label: { en: "User auth token", id: "User auth token" },
        in: "env",
        help: "https://sentry.io/settings/account/api/auth-tokens/",
      },
    ],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    by: "Brave",
    site: "https://brave.com/search/api/",
    docs: "https://github.com/brave/brave-search-mcp-server",
    category: "research",
    logo: { src: "/brands/brave.svg" },
    desc: { en: "Web, news and image search from an independent index", id: "Pencarian web, berita, dan gambar dari indeks independen" },
    about: {
      en: "Brave's own search API: web, news, image and video results from an independent index, for tasks that need fresh facts from the open web.",
      id: "API pencarian resmi Brave: hasil web, berita, gambar, dan video dari indeks independen, untuk tugas yang butuh fakta terbaru dari web.",
    },
    server: npx("@brave/brave-search-mcp-server"),
    secrets: [
      {
        key: "BRAVE_API_KEY",
        label: { en: "API key", id: "API key" },
        in: "env",
        help: "https://api-dashboard.search.brave.com/app/keys",
      },
    ],
  },
  {
    id: "exa",
    name: "Exa",
    by: "Exa",
    site: "https://exa.ai",
    docs: "https://github.com/exa-labs/exa-mcp-server",
    category: "research",
    logo: { src: "/brands/exa.png", icon: true },
    desc: {
      en: "Search the web by meaning and pull clean page contents",
      id: "Cari di web berdasarkan makna dan ambil isi halaman yang bersih",
    },
    about: {
      en: "Search built for agents: finds pages by meaning rather than keywords and returns their cleaned contents, useful for research, competitors and code examples.",
      id: "Pencarian yang dibuat untuk agen: menemukan halaman berdasarkan makna, bukan kata kunci, dan mengembalikan isinya yang sudah bersih. Berguna untuk riset, kompetitor, dan contoh kode.",
    },
    server: npx("exa-mcp-server"),
    secrets: [{ key: "EXA_API_KEY", label: { en: "API key", id: "API key" }, in: "env", help: "https://dashboard.exa.ai/api-keys" }],
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    by: "Firecrawl",
    site: "https://www.firecrawl.dev",
    docs: "https://github.com/firecrawl/firecrawl-mcp-server",
    category: "research",
    logo: { src: "/brands/firecrawl.svg" },
    desc: { en: "Scrape and crawl websites into clean markdown", id: "Ambil dan jelajahi situs menjadi markdown yang rapi" },
    about: {
      en: "Turns any page or whole site into clean markdown or structured data, including pages that need JavaScript, so agents can read documentation and sites end to end.",
      id: "Mengubah halaman atau seluruh situs menjadi markdown bersih atau data terstruktur, termasuk halaman yang butuh JavaScript, supaya agen bisa membaca dokumentasi dan situs dari awal sampai akhir.",
    },
    server: npx("firecrawl-mcp"),
    secrets: [
      { key: "FIRECRAWL_API_KEY", label: { en: "API key", id: "API key" }, in: "env", help: "https://www.firecrawl.dev/app/api-keys" },
    ],
  },
  {
    id: "figma",
    name: "Figma",
    by: "Figma",
    site: "https://www.figma.com",
    docs: "https://developers.figma.com/docs/figma-mcp-server/",
    category: "work",
    logo: { src: "/brands/figma.svg" },
    desc: {
      en: "Read frames, components and variables from the file you have open",
      id: "Baca frame, komponen, dan variabel dari file yang sedang terbuka",
    },
    about: {
      en: "Connects to the Figma desktop app on this machine: agents read the selected frames, components, variables and styles so what they build matches the design. Turn on the MCP server in Figma's preferences first.",
      id: "Terhubung ke aplikasi desktop Figma di mesin ini: agen membaca frame, komponen, variabel, dan style yang dipilih, supaya hasilnya sesuai desain. Nyalakan dulu server MCP di preferensi Figma.",
    },
    server: { transport: "http", url: "http://127.0.0.1:3845/mcp" },
    note: {
      en: "Needs the Figma desktop app with its MCP server turned on",
      id: "Butuh aplikasi desktop Figma dengan server MCP-nya dinyalakan",
    },
  },
  {
    id: "memory",
    name: "Memory",
    by: "Model Context Protocol",
    site: "https://modelcontextprotocol.io",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    category: "reasoning",
    logo: { src: "/brands/mcp.png", icon: true },
    desc: {
      en: "A knowledge graph agents can store facts in and recall later",
      id: "Graf pengetahuan tempat agen menyimpan fakta dan mengingatnya lagi",
    },
    about: {
      en: "The reference memory server from the MCP project: a small knowledge graph of entities, relations and observations that agents can write to and recall in later tasks.",
      id: "Server memory rujukan dari proyek MCP: graf pengetahuan kecil berisi entitas, relasi, dan observasi yang bisa ditulis agen lalu diingat lagi di tugas berikutnya.",
    },
    server: npx("@modelcontextprotocol/server-memory"),
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    by: "Model Context Protocol",
    site: "https://modelcontextprotocol.io",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    category: "reasoning",
    logo: { src: "/brands/mcp.png", icon: true },
    desc: {
      en: "Step-by-step reasoning that agents can revise and branch",
      id: "Penalaran langkah demi langkah yang bisa direvisi dan dicabangkan agen",
    },
    about: {
      en: "The reference reasoning server from the MCP project: agents break a hard problem into numbered thoughts they can revise or branch before acting.",
      id: "Server penalaran rujukan dari proyek MCP: agen memecah masalah sulit menjadi langkah bernomor yang bisa direvisi atau dicabangkan sebelum bertindak.",
    },
    server: npx("@modelcontextprotocol/server-sequential-thinking"),
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
