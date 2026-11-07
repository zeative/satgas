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
  features: { title: Text; text: Text }[];
  // What the server offers its agents, by the names it gives them.
  tools: string[];
  // The month it joined the catalog, as YYYY-MM.
  added: string;
  support?: string;
  privacy?: string;
  server: { transport: "stdio"; command: string; args: string[] } | { transport: "http"; url: string };
  secrets?: Secret[];
  // The address to sign in at, when it differs from the one a key is sent to.
  oauthUrl?: string;
  // The person would rather sign in, so a key is only offered while signing in is not possible.
  preferSignIn?: boolean;
}

const feature = (enTitle: string, en: string, idTitle: string, id: string) => ({
  title: { en: enTitle, id: idTitle },
  text: { en, id },
});
const names = (list: string) => list.split(/\s+/).filter(Boolean);

// Every entry was checked against its publisher's README (2026-11). Tools come from each server's own tools/list, except
// GitHub's (its README) and Zapi's and Monveo's (their connectors), which need a sign-in to ask.
export const CATALOG: CatalogItem[] = [
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
    features: [
      feature(
        "Find the library",
        "match a library's name to the entry that holds its documentation",
        "Cari library",
        "cocokkan nama library dengan entri yang menyimpan dokumentasinya",
      ),
      feature(
        "Read current docs",
        "ask a question and get documentation and code examples for that version",
        "Baca dokumentasi terbaru",
        "ajukan pertanyaan dan dapatkan dokumentasi serta contoh kode untuk versi itu",
      ),
    ],
    tools: names("query-docs resolve-library-id"),
    added: "2026-11",
    support: "https://github.com/upstash/context7/issues",
    privacy: "https://upstash.com/trust/privacy.pdf",
    server: { transport: "http", url: "https://mcp.context7.com/mcp" },
    oauthUrl: "https://mcp.context7.com/mcp/oauth",
    secrets: [
      {
        key: "CONTEXT7_API_KEY",
        label: { en: "API key (optional, raises rate limits)", id: "API key (opsional, menaikkan batas pemakaian)" },
        in: "header",
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
    features: [
      feature(
        "Code and repositories",
        "read files, search code, and work with branches, commits and releases",
        "Kode dan repository",
        "baca file, cari kode, dan kelola branch, commit, serta rilis",
      ),
      feature(
        "Issues and pull requests",
        "open, comment on, review and merge them",
        "Issue dan pull request",
        "buka, komentari, review, dan merge",
      ),
      feature(
        "Actions",
        "list runs, read job logs and trigger workflows",
        "Actions",
        "lihat daftar run, baca log job, dan jalankan workflow",
      ),
      feature(
        "Security",
        "check code scanning, Dependabot and secret scanning alerts, and security advisories",
        "Keamanan",
        "cek peringatan code scanning, Dependabot, dan secret scanning, serta security advisory",
      ),
      feature("Notifications", "read them, dismiss them and manage subscriptions", "Notifikasi", "baca, tutup, dan atur langganannya"),
    ],
    tools: names(`
      actions_get actions_list actions_run_trigger add_comment_to_pending_review add_issue_comment add_reply_to_pull_request_comment
      assign_copilot_to_issue assign_copilot_to_issue_with_intent create_branch create_gist create_or_update_file create_pull_request
      create_pull_request_with_copilot create_repository create_repository_ruleset custom_properties_read custom_properties_write
      delete_file delete_repository discussion_comment_write dismiss_notification fork_repository get_code_quality_finding
      get_code_scanning_alert get_commit get_copilot_space get_dependabot_alert get_discussion get_discussion_comments get_file_contents
      get_gist get_global_security_advisory get_job_logs get_label get_latest_release get_me get_notification_details get_release_by_tag
      get_repository_tree get_secret_scanning_alert get_tag get_team_members get_teams github_support_docs_search issue_read issue_write
      label_write list_branches list_code_scanning_alerts list_commits list_copilot_spaces list_dependabot_alerts
      list_discussion_categories list_discussions list_gists list_global_security_advisories list_issue_fields list_issue_types
      list_issues list_label list_notifications list_org_repository_security_advisories list_pull_requests list_releases
      list_repository_collaborators list_repository_security_advisories list_secret_scanning_alerts list_starred_repositories list_tags
      manage_notification_subscription manage_repository_notification_subscription mark_all_notifications_read merge_pull_request
      projects_get projects_list projects_write pull_request_read pull_request_review_write push_files repository_ruleset_read
      request_copilot_review search_code search_commits search_issues search_orgs search_pull_requests search_repositories search_users
      star_repository sub_issue_write ui_get unstar_repository update_gist update_issue_comment update_pull_request
      update_pull_request_branch
    `),
    added: "2026-11",
    support: "https://github.com/github/github-mcp-server/issues",
    privacy: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
    // Every toolset, so agents also reach notifications and Actions runs.
    server: { transport: "http", url: GITHUB_MCP_ALL },
    preferSignIn: true,
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
      en: "Social media, search and other public data in one connector",
      id: "Media sosial, pencarian, dan data publik lain dalam satu konektor",
    },
    about: {
      en: "Zapi's remote server: agents search its catalogue of scrapers, read what each one takes and returns, and run it to get clean JSON back. Every call counts against your monthly quota.",
      id: "Server remote Zapi: agen mencari di katalog scraper-nya, membaca input dan output tiap scraper, lalu menjalankannya untuk mendapat JSON yang bersih. Setiap panggilan memakai kuota bulanan kamu.",
    },
    features: [
      feature(
        "Find a scraper",
        "search the catalogue and browse it by category",
        "Cari scraper",
        "cari di katalog dan telusuri per kategori",
      ),
      feature(
        "Know what it takes",
        "read what each scraper needs and what it returns",
        "Pahami cara pakainya",
        "baca apa yang dibutuhkan dan dikembalikan tiap scraper",
      ),
      feature(
        "Run it",
        "get clean JSON back, one call at a time or in bulk",
        "Jalankan",
        "dapatkan JSON yang bersih, satu per satu atau sekaligus",
      ),
      feature("Watch the quota", "check the account and its usage", "Pantau kuota", "cek akun dan pemakaiannya"),
    ],
    tools: names("bulk_status bulk_submit get_account get_scraper_schema get_usage list_categories run_scraper search_scrapers"),
    added: "2026-11",
    privacy: "https://zapi.ink/privacy",
    server: { transport: "http", url: "https://mcp.zapi.ink/mcp" },
    secrets: [{ key: "x-api-key", label: { en: "API key", id: "API key" }, in: "header", help: "https://zapi.ink/dashboard/keys" }],
  },
  {
    id: "monveo",
    name: "Monveo",
    by: "Monveo",
    site: "https://monveo.app",
    docs: "https://monveo.app",
    category: "data",
    logo: { src: "/brands/monveo.png", icon: true },
    desc: {
      en: "Your transactions, budgets, wallets, goals and net worth",
      id: "Transaksi, anggaran, dompet, tujuan, dan kekayaan bersih kamu",
    },
    about: {
      en: "Monveo's remote server: agents read your transactions, budgets, wallets, goals and net worth, and can record a new expense or income if you allow it on the connection. They cannot edit or delete anything.",
      id: "Server remote Monveo: agen membaca transaksi, anggaran, dompet, tujuan, dan kekayaan bersih kamu, dan bisa mencatat pengeluaran atau pemasukan baru kalau kamu mengizinkannya di koneksi itu. Mereka tidak bisa mengubah atau menghapus apa pun.",
    },
    features: [
      feature(
        "Where you stand",
        "a snapshot of the month, your budgets, wallets, goals and net worth",
        "Kondisi keuangan",
        "ringkasan bulan ini, anggaran, dompet, tujuan, dan kekayaan bersih",
      ),
      feature(
        "Where the money went",
        "spending by category, and why it changed between periods",
        "Ke mana uangnya",
        "pengeluaran per kategori, dan kenapa berubah antar periode",
      ),
      feature(
        "Purchases and bills",
        "find specific purchases, subscriptions and recurring bills",
        "Belanja dan tagihan",
        "cari belanja tertentu, langganan, dan tagihan rutin",
      ),
      feature(
        "Record a transaction",
        "add an expense or income, only when you turned that on",
        "Catat transaksi",
        "tambah pengeluaran atau pemasukan, hanya kalau kamu mengaktifkannya",
      ),
    ],
    tools: names(`
      add_transaction compare_spending get_context get_financial_snapshot get_spending_by_category list_recurring_transactions
      search_transactions
    `),
    added: "2026-11",
    privacy: "https://monveo.app/privacy",
    server: { transport: "http", url: "https://mcp.monveo.app/mcp" },
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
export function toServer(item: CatalogItem, values: Record<string, string>, id: string, taken: McpServer[] = [], url?: string): McpServer {
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
    ? { ...base, transport: "http", url: url ?? item.server.url, headers: pick("header") }
    : { ...base, transport: "stdio", command: item.server.command, args: item.server.args, env: pick("env") };
}
