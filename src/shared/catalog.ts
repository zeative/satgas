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

export type Category = "code" | "work" | "data";
export const CATEGORIES: Category[] = ["code", "work", "data"];

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
  // What the server offers its agents, by the names it gives them. Empty when they depend on what the person set up there.
  tools: string[];
  // The list names only the main ones, so its count is a floor.
  moreTools?: boolean;
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

// Every entry was checked against its publisher's documentation (2026-11), and each sign-in reached the publisher's own page.
// Tools come from each server's tools/list where it answers without a sign-in, otherwise from the publisher's docs or repository.
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
      en: "Up-to-date documentation for any library",
      id: "Dokumentasi terbaru untuk library apa pun",
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
    desc: { en: "Repos, issues, pull requests and Actions", id: "Repo, issue, pull request, dan Actions" },
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
      en: "Social, search and public data in one place",
      id: "Data sosial, pencarian, dan publik di satu tempat",
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
      en: "Your transactions, budgets and wallets",
      id: "Transaksi, anggaran, dan dompet kamu",
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
  {
    id: "repliz",
    name: "Repliz",
    by: "Repliz",
    site: "https://repliz.com",
    docs: "https://docs.repliz.com/tutorial/mcp.html",
    category: "work",
    logo: { src: "/brands/repliz.png", icon: true },
    desc: { en: "Comments, DMs and posts across social media", id: "Komentar, DM, dan posting media sosial" },
    about: {
      en: "Repliz's own server: agents read and reply to comments and direct messages, schedule posts, and manage contacts, automations and templates across your connected social accounts. Replies and posts go out under your accounts, so ask for a draft first when it matters.",
      id: "Server resmi Repliz: agen membaca dan membalas komentar serta DM, menjadwalkan posting, dan mengelola kontak, otomatisasi, dan template di akun sosial yang kamu sambungkan. Balasan dan posting terkirim atas nama akunmu, jadi minta draf dulu kalau penting.",
    },
    features: [
      feature("Answer people", "read and reply to comments and direct messages", "Balas orang", "baca dan balas komentar serta DM"),
      feature("Plan posts", "create, change and retry scheduled posts", "Rencanakan posting", "buat, ubah, dan ulangi posting terjadwal"),
      feature(
        "Know your contacts",
        "tags and follow-ups for the people who reach out",
        "Kenali kontak",
        "tag dan tindak lanjut untuk orang yang menghubungi",
      ),
      feature("Automate", "manage automations and reply templates", "Otomatisasi", "kelola otomatisasi dan template balasan"),
    ],
    moreTools: true,
    tools: names(`
      repliz_list_accounts repliz_get_account repliz_get_account_statistics repliz_list_comments repliz_get_comment repliz_reply_comment
      repliz_update_comment_status repliz_delete_comment repliz_list_contacts repliz_get_contact repliz_update_contact
      repliz_set_contact_follow_up repliz_list_chats repliz_get_chat repliz_list_messages repliz_send_message repliz_read_chat
      repliz_list_content repliz_get_content repliz_get_content_statistic repliz_list_schedules repliz_get_schedule repliz_create_schedule
      repliz_update_schedule repliz_retry_schedule repliz_delete_schedule repliz_list_automations repliz_get_automation
      repliz_create_automation repliz_update_automation repliz_delete_automation repliz_list_templates repliz_create_template
      repliz_list_reports repliz_get_report repliz_search_threads_content repliz_tiktok_trending_music repliz_shopee_products
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.repliz.com/mcp" },
    secrets: [
      {
        key: "X-Repliz-Access-Key",
        label: { en: "Access key", id: "Access key" },
        in: "header",
        help: "https://repliz.com/user/setting/api",
      },
      {
        key: "X-Repliz-Secret-Key",
        label: { en: "Secret key", id: "Secret key" },
        in: "header",
        help: "https://repliz.com/user/setting/api",
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    by: "Notion",
    site: "https://www.notion.com",
    docs: "https://developers.notion.com/guides/mcp/overview",
    category: "work",
    logo: { src: "/brands/notion.png", icon: true },
    desc: { en: "Search, read and write your workspace pages", id: "Cari, baca, dan tulis halaman workspace" },
    about: {
      en: "Notion's own server: agents search your workspace, read pages and databases, draft and update pages, and comment, within what your Notion account can reach.",
      id: "Server resmi Notion: agen mencari di workspace, membaca halaman dan database, menyusun dan mengubah halaman, serta berkomentar, sebatas yang bisa dijangkau akun Notion kamu.",
    },
    features: [
      feature("Find it", "search across pages and read what they say", "Temukan", "cari di semua halaman dan baca isinya"),
      feature("Write it", "create, update, move and duplicate pages", "Tulis", "buat, ubah, pindahkan, dan gandakan halaman"),
      feature("Track it", "create databases and query their views", "Lacak", "buat database dan ambil data dari view-nya"),
      feature("Discuss it", "read and add comments", "Diskusikan", "baca dan tambah komentar"),
    ],
    moreTools: true,
    tools: names(`
      notion-search notion-fetch notion-create-pages notion-update-page notion-move-pages notion-duplicate-page notion-delete-pages
      notion-restore-pages notion-create-database notion-update-data-source notion-query-data-sources notion-create-view notion-update-view
      notion-create-comment notion-get-comments notion-get-users notion-get-teams notion-get-self notion-query-meeting-notes
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.notion.com/mcp" },
  },
  {
    id: "linear",
    name: "Linear",
    by: "Linear",
    site: "https://linear.app",
    docs: "https://linear.app/docs/mcp",
    category: "work",
    logo: { src: "/brands/linear.png", icon: true },
    desc: { en: "Issues, projects and comments in Linear", id: "Issue, proyek, dan komentar di Linear" },
    about: {
      en: "Linear's own server: agents find, create and update issues, projects, comments and documents with the access your Linear account has.",
      id: "Server resmi Linear: agen mencari, membuat, dan mengubah issue, proyek, komentar, dan dokumen dengan akses yang dimiliki akun Linear kamu.",
    },
    features: [
      feature("See the work", "list and read issues, projects and teams", "Lihat pekerjaan", "lihat dan baca issue, proyek, dan tim"),
      feature(
        "File and update",
        "create or change issues, projects and milestones",
        "Buat dan ubah",
        "buat atau ubah issue, proyek, dan milestone",
      ),
      feature("Keep people posted", "comments, documents and status updates", "Kabari tim", "komentar, dokumen, dan update status"),
    ],
    moreTools: true,
    tools: names(`
      list_issues get_issue save_issue list_comments save_comment delete_comment list_projects save_project list_teams save_document
      save_milestone save_status_update save_issue_label create_issue_label create_attachment mark_notification
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.linear.app/mcp" },
  },
  {
    id: "plane",
    name: "Plane",
    by: "Plane",
    site: "https://plane.so",
    docs: "https://docs.plane.so/ai/mcp-server",
    category: "work",
    logo: { src: "/brands/plane.png", icon: true },
    desc: { en: "Work items, cycles and pages in Plane", id: "Work item, cycle, dan halaman di Plane" },
    about: {
      en: "Plane's own server: agents search and update work items, cycles, modules and pages in the workspace you choose when you sign in.",
      id: "Server resmi Plane: agen mencari dan mengubah work item, cycle, modul, dan halaman di workspace yang kamu pilih saat masuk.",
    },
    features: [
      feature(
        "Run the work",
        "create, update and search work items, with comments",
        "Jalankan pekerjaan",
        "buat, ubah, dan cari work item, beserta komentarnya",
      ),
      feature("Plan it", "cycles, modules, milestones and initiatives", "Rencanakan", "cycle, modul, milestone, dan inisiatif"),
      feature("Write it down", "pages, releases and changelogs", "Catat", "halaman, rilis, dan changelog"),
    ],
    tools: names(`
      workitem workitem_comment workitem_activity workitem_attachment workitem_link workitem_relation workitem_type workitem_property
      project cycle module milestone initiative intake page release state label member workspace work_log customer template
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.plane.so/http/mcp" },
  },
  {
    id: "vercel",
    name: "Vercel",
    by: "Vercel",
    site: "https://vercel.com",
    docs: "https://vercel.com/docs/agent-resources/vercel-mcp",
    category: "code",
    logo: { src: "/brands/vercel.png", icon: true },
    desc: { en: "Projects, deployments and logs on Vercel", id: "Proyek, deployment, dan log di Vercel" },
    about: {
      en: "Vercel's own server: agents inspect projects and deployments, read logs and runtime errors, and reach the teams you grant when you sign in. It offers many more tools than the most used ones listed here, including domains, environment variables and sandboxes.",
      id: "Server resmi Vercel: agen memeriksa proyek dan deployment, membaca log dan error runtime, dan menjangkau tim yang kamu izinkan saat masuk. Tool-nya jauh lebih banyak daripada yang paling sering dipakai di sini, termasuk domain, environment variable, dan sandbox.",
    },
    features: [
      feature("Check a deploy", "status and details of any deployment", "Cek deploy", "status dan detail setiap deployment"),
      feature("Find what broke", "runtime logs and grouped errors", "Cari yang rusak", "log runtime dan error yang dikelompokkan"),
      feature(
        "Open protected pages",
        "fetch a deployment URL you can access",
        "Buka halaman terlindungi",
        "ambil URL deployment yang bisa kamu akses",
      ),
    ],
    moreTools: true,
    tools: names(
      "list_deployments get_deployment web_fetch_vercel_url get_runtime_logs get_runtime_errors list_projects get_project list_teams",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.vercel.com" },
  },
  {
    id: "supabase",
    name: "Supabase",
    by: "Supabase",
    site: "https://supabase.com",
    docs: "https://supabase.com/docs/guides/getting-started/mcp",
    category: "code",
    logo: { src: "/brands/supabase.png", icon: true },
    desc: { en: "Databases, migrations and logs on Supabase", id: "Database, migrasi, dan log di Supabase" },
    about: {
      en: "Supabase's own server: agents read schemas, run SQL and migrations, read logs and deploy edge functions. It can change real data, so Supabase advises keeping it away from production unless the task needs it.",
      id: "Server resmi Supabase: agen membaca skema, menjalankan SQL dan migrasi, membaca log, dan men-deploy edge function. Server ini bisa mengubah data sungguhan, jadi Supabase menyarankan menjauhkannya dari production kecuali tugasnya memang butuh.",
    },
    features: [
      feature("Work with data", "tables, SQL and migrations", "Kerjakan data", "tabel, SQL, dan migrasi"),
      feature("Debug", "logs and security and performance advice", "Debug", "log serta saran keamanan dan performa"),
      feature("Ship functions", "read and deploy edge functions", "Rilis function", "baca dan deploy edge function"),
      feature("Manage projects", "projects, branches and types for your code", "Kelola proyek", "proyek, branch, dan tipe untuk kode kamu"),
    ],
    moreTools: true,
    tools: names(`
      list_tables list_extensions list_migrations apply_migration execute_sql query_logs get_advisors get_project_url get_publishable_keys
      generate_typescript_types list_edge_functions get_edge_function deploy_edge_function list_projects get_project create_project
      pause_project restore_project list_organizations get_organization get_cost confirm_cost search_docs create_branch list_branches
      delete_branch merge_branch reset_branch rebase_branch
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.supabase.com/mcp" },
  },
  {
    id: "sentry",
    name: "Sentry",
    by: "Sentry",
    site: "https://sentry.io",
    docs: "https://mcp.sentry.dev",
    category: "code",
    logo: { src: "/brands/sentry.png", icon: true },
    desc: { en: "Errors, traces and issues from Sentry", id: "Error, trace, dan issue dari Sentry" },
    about: {
      en: "Sentry's own server: agents read an issue with its stack trace and breadcrumbs, follow traces and replays, and search errors, so a fix starts from what really happened.",
      id: "Server resmi Sentry: agen membaca issue beserta stack trace dan breadcrumb-nya, menelusuri trace dan replay, serta mencari error, jadi perbaikan berangkat dari kejadian sebenarnya.",
    },
    features: [
      feature(
        "Read the failure",
        "stack traces, breadcrumbs and user reports",
        "Baca kegagalan",
        "stack trace, breadcrumb, dan laporan pengguna",
      ),
      feature("Follow the request", "traces, spans and replays", "Telusuri request", "trace, span, dan replay"),
      feature("Search", "issues and events across your projects", "Cari", "issue dan event di semua proyek kamu"),
    ],
    moreTools: true,
    tools: names(`
      whoami find_organizations find_teams find_projects find_releases get_release_details find_dashboards find_monitors find_alert_rules
      get_issue_details get_event_stacktrace get_issue_activity get_issue_breadcrumbs get_issue_user_reports get_issue_tag_values
      get_trace_details get_span_details get_replay_details get_doc search_issues search_events search_issue_events add_issue_note
      analyze_issue_with_seer
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.sentry.dev/mcp" },
  },
  {
    id: "tavily",
    name: "Tavily",
    by: "Tavily",
    site: "https://www.tavily.com",
    docs: "https://docs.tavily.com/documentation/mcp",
    category: "data",
    logo: { src: "/brands/tavily.png", icon: true },
    desc: { en: "Web search, page reading and site crawls", id: "Cari web, baca halaman, dan crawl situs" },
    about: {
      en: "Tavily's own server: agents search the web, pull clean content from pages, crawl and map sites, and run multi-source research. Calls use your Tavily API credits; 1,000 are free each month.",
      id: "Server resmi Tavily: agen mencari di web, mengambil isi bersih dari halaman, menelusuri dan memetakan situs, serta menjalankan riset dari banyak sumber. Setiap panggilan memakai kredit API Tavily kamu; 1.000 kredit gratis tiap bulan.",
    },
    features: [
      feature("Search the web", "find current, relevant sources", "Cari di web", "temukan sumber terbaru yang relevan"),
      feature("Read pages", "pull clean content from one or more URLs", "Baca halaman", "ambil isi bersih dari satu URL atau lebih"),
      feature(
        "Walk a site",
        "discover its structure and read many pages across it",
        "Jelajahi situs",
        "temukan strukturnya dan baca banyak halaman di dalamnya",
      ),
      feature(
        "Research",
        "run multi-source research and get a detailed answer",
        "Riset",
        "jalankan riset dari banyak sumber dan dapatkan jawaban rinci",
      ),
    ],
    tools: names("tavily_search tavily_extract tavily_crawl tavily_map tavily_research"),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.tavily.com/mcp" },
  },
  {
    id: "exa",
    name: "Exa",
    by: "Exa",
    site: "https://exa.ai",
    docs: "https://docs.exa.ai/reference/exa-mcp",
    category: "data",
    logo: { src: "/brands/exa.png", icon: true },
    desc: { en: "Web search and page fetching through Exa", id: "Pencarian web dan ambil halaman lewat Exa" },
    about: {
      en: "Exa's own server: agents search the web and fetch pages at a free rate limit, with no sign-in. An API key adds agent_run for multi-step research, list-building and enrichment.",
      id: "Server resmi Exa: agen mencari di web dan mengambil halaman dengan batas pemakaian gratis, tanpa login. API key menambah agent_run untuk riset bertahap, penyusunan daftar, dan pengayaan data.",
    },
    features: [
      feature(
        "Search the web",
        "look up pages at a free rate limit, with no sign-in",
        "Cari di web",
        "cari halaman dengan batas gratis, tanpa login",
      ),
      feature("Fetch pages", "read clean content from one or more known URLs", "Ambil halaman", "baca isi bersih dari satu URL atau lebih"),
      feature(
        "Run research",
        "with a key, run multi-step research with structured output",
        "Jalankan riset",
        "dengan key, jalankan riset bertahap dengan keluaran terstruktur",
      ),
      feature("Build lists", "with a key, build lists and enrich them", "Susun daftar", "dengan key, susun daftar dan lengkapi datanya"),
    ],
    tools: names("web_search_exa web_fetch_exa agent_run"),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.exa.ai/mcp" },
    secrets: [
      {
        key: "x-api-key",
        label: { en: "API key", id: "API key" },
        in: "header",
        optional: true,
        help: "https://dashboard.exa.ai/api-keys",
      },
    ],
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    by: "Firecrawl",
    site: "https://www.firecrawl.dev",
    docs: "https://docs.firecrawl.dev/mcp-server",
    category: "data",
    logo: { src: "/brands/firecrawl.png", icon: true },
    desc: { en: "Search, scrape and parse the web and files", id: "Cari, scrape, dan parse situs serta file" },
    about: {
      en: "Firecrawl's own server: agents search the web, scrape pages and convert files, within daily limits and with no account. An API key adds site maps, crawls, live browser sessions and recurring monitors on your Firecrawl account, and some data tools charge per run.",
      id: "Server resmi Firecrawl: agen mencari di web, mengambil isi halaman, dan mengonversi file, dengan batas harian dan tanpa akun. API key menambah peta situs, crawl, sesi browser langsung, dan monitor berkala di akun Firecrawl kamu, dan sebagian tool data mengenakan biaya per run.",
    },
    features: [
      feature(
        "Scrape a page",
        "extract content or structured fields from one URL",
        "Scrape halaman",
        "ambil isi atau field terstruktur dari satu URL",
      ),
      feature("Search", "find web, news, image and developer sources", "Cari", "temukan sumber web, berita, gambar, dan developer"),
      feature("Parse files", "convert files into output ready for a model", "Parse file", "ubah file jadi keluaran yang siap dibaca model"),
      feature(
        "Go further with a key",
        "map and crawl sites, operate pages in a live browser, set up monitors",
        "Lebih jauh dengan key",
        "petakan dan crawl situs, operasikan halaman di browser langsung, pasang monitor",
      ),
    ],
    tools: names(`
      firecrawl_scrape firecrawl_search firecrawl_parse firecrawl_map firecrawl_crawl firecrawl_check_crawl_status
      firecrawl_agent firecrawl_agent_status firecrawl_interact firecrawl_interact_stop firecrawl_find_tools
      firecrawl_developer_search firecrawl_gov_search firecrawl_research_search_papers firecrawl_research_inspect_paper
      firecrawl_research_read_paper firecrawl_research_related_papers firecrawl_monitor_create firecrawl_monitor_list
      firecrawl_monitor_get firecrawl_monitor_update firecrawl_monitor_delete firecrawl_monitor_run firecrawl_monitor_checks
      firecrawl_monitor_check firecrawl_credit_usage
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.firecrawl.dev/v2/mcp" },
    secrets: [
      {
        key: "Authorization",
        label: { en: "API key", id: "API key" },
        in: "header",
        prefix: "Bearer ",
        optional: true,
        help: "https://www.firecrawl.dev/app/api-keys",
      },
    ],
  },
  {
    id: "apify",
    name: "Apify",
    by: "Apify",
    site: "https://apify.com",
    docs: "https://docs.apify.com/platform/integrations/mcp",
    category: "data",
    logo: { src: "/brands/apify.png", icon: true },
    desc: { en: "Run Apify Actors to scrape sites and apps", id: "Jalankan Actor Apify untuk scrape situs" },
    about: {
      en: "Apify's own server: agents search Apify Store, check an Actor's input and pricing, run it and read the results. Actor runs bill to your Apify account at each Actor's price, so they can cost money; the free plan includes $5 of usage a month.",
      id: "Server resmi Apify: agen mencari di Apify Store, mengecek input dan harga sebuah Actor, menjalankannya, lalu membaca hasilnya. Setiap run ditagih ke akun Apify kamu sesuai harga Actor itu, jadi bisa memakan biaya; paket gratis mencakup pemakaian $5 per bulan.",
    },
    features: [
      feature(
        "Find an Actor",
        "search Apify Store and read its input schema and pricing",
        "Cari Actor",
        "cari di Apify Store dan baca skema input serta harganya",
      ),
      feature("Run it", "start a run, check its status or abort it", "Jalankan", "mulai run, cek statusnya, atau batalkan"),
      feature(
        "Read the results",
        "get dataset items and key-value store records",
        "Baca hasil",
        "ambil item dataset dan record key-value store",
      ),
      feature(
        "Search and fetch",
        "search the web and fetch pages through Apify's own Actors",
        "Cari dan ambil",
        "cari di web dan ambil halaman lewat Actor milik Apify",
      ),
    ],
    tools: names(`
      search-actors fetch-actor-details call-actor fetch-actor-mcp-tool-list call-actor-mcp-tool send-server-actor-request
      get-actor-run get-dataset-items get-key-value-store-record abort-actor-run search-apify-docs fetch-apify-docs
      apify--web-search apify--web-fetch
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.apify.com" },
  },
  {
    id: "deepwiki",
    name: "DeepWiki",
    by: "Cognition",
    site: "https://cognition.ai",
    docs: "https://docs.devin.ai/work-with-devin/deepwiki-mcp",
    category: "code",
    logo: { src: "/brands/deepwiki.png", icon: true },
    desc: { en: "Docs and answers for public GitHub repos", id: "Dokumentasi dan jawaban repo GitHub publik" },
    about: {
      en: "Cognition's own server: agents read documentation about public GitHub repositories and ask questions about them. It is free, needs no sign-in, and covers public repositories only.",
      id: "Server resmi Cognition: agen membaca dokumentasi repository GitHub publik dan bertanya tentang isinya. Gratis, tanpa login, dan hanya mencakup repository publik.",
    },
    features: [
      feature(
        "See the topics",
        "list the documentation topics of a repository",
        "Lihat topik",
        "lihat daftar topik dokumentasi sebuah repository",
      ),
      feature(
        "Read the docs",
        "view the documentation about a repository",
        "Baca dokumentasi",
        "lihat dokumentasi tentang sebuah repository",
      ),
      feature(
        "Ask a question",
        "get an answer grounded in the repository",
        "Ajukan pertanyaan",
        "dapatkan jawaban yang berdasar pada repository itu",
      ),
    ],
    tools: names("ask_wiki_question read_wiki_contents read_wiki_structure"),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.deepwiki.com/mcp" },
  },
  {
    id: "gitlab",
    name: "GitLab",
    by: "GitLab",
    site: "https://about.gitlab.com",
    docs: "https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/",
    category: "code",
    logo: { src: "/brands/gitlab.png", icon: true },
    desc: { en: "Repos, merge requests and pipelines on GitLab", id: "Repo, merge request, dan pipeline di GitLab" },
    about: {
      en: "GitLab's own server: agents search projects, open and merge merge requests, manage work items, push commits and run pipelines, within what your GitLab account may do. These change real projects, and on GitLab.com MCP access must first be allowed for the top-level group.",
      id: "Server resmi GitLab: agen mencari proyek, membuka dan menggabungkan merge request, mengelola work item, mengirim commit, dan menjalankan pipeline, sebatas izin akun GitLab kamu. Semua itu mengubah proyek sungguhan, dan di GitLab.com akses MCP harus diizinkan dulu untuk grup level teratas.",
    },
    features: [
      feature(
        "Find things",
        "search projects, groups, labels, members and to-dos",
        "Temukan",
        "cari proyek, grup, label, anggota, dan to-do",
      ),
      feature("Merge requests", "create, review, comment on and merge them", "Merge request", "buat, tinjau, komentari, dan gabungkan"),
      feature(
        "Repositories",
        "read files and commits, add branches and commits, fork",
        "Repository",
        "baca file dan commit, tambah branch dan commit, fork",
      ),
      feature(
        "Pipelines",
        "read jobs and artifacts, create, retry or cancel pipelines",
        "Pipeline",
        "baca job dan artifact, buat, ulangi, atau batalkan pipeline",
      ),
    ],
    tools: names(`
      get_mcp_server_version get_project save_project get_user list_groups list_projects list_project_members list_todos
      save_note search search_labels semantic_search save_merge_request get_merge_request list_merge_requests
      save_merge_request_review accept_merge_request get_work_item get_work_item_types link_work_items
      get_saved_view_work_items list_work_item_saved_views save_work_item list_work_items add_branch fork_repository
      list_branches get_repository_file list_repository_tree get_commit list_commits list_releases list_tags add_commit
      get_pipeline get_job get_artifact_file list_pipelines save_pipeline
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://gitlab.com/api/v4/mcp" },
  },
  {
    id: "netlify",
    name: "Netlify",
    by: "Netlify",
    site: "https://www.netlify.com",
    docs: "https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/",
    category: "code",
    logo: { src: "/brands/netlify.png", icon: true },
    desc: { en: "Projects, deploys and env vars on Netlify", id: "Proyek, deploy, dan env var di Netlify" },
    about: {
      en: "Netlify's own server: agents create and deploy projects, change environment variables, access controls and forms, and install extensions. These change your real Netlify account.",
      id: "Server resmi Netlify: agen membuat dan men-deploy proyek, mengubah environment variable, kontrol akses, dan form, serta memasang extension. Semua itu mengubah akun Netlify kamu yang sungguhan.",
    },
    features: [
      feature("Ship projects", "create, rename and deploy them", "Rilis proyek", "buat, ganti nama, dan deploy"),
      feature(
        "Change settings",
        "manage environment variables, secrets and access controls",
        "Ubah pengaturan",
        "kelola environment variable, secret, dan kontrol akses",
      ),
      feature(
        "See what happened",
        "read deploys, request logs and traffic counts",
        "Lihat yang terjadi",
        "baca deploy, log request, dan jumlah trafik",
      ),
      feature("Extensions", "install or uninstall Netlify extensions", "Extension", "pasang atau lepas extension Netlify"),
    ],
    tools: names(`
      get-netlify-coding-context netlify-open-deployments netlify-user-services-reader netlify-team-services-reader
      netlify-project-services-reader netlify-project-services-updater netlify-deploy-services-reader
      netlify-deploy-services-updater netlify-extension-services-reader netlify-extension-services-updater
      netlify-observability-services-reader netlify-feedback-services-updater
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.netlify.com/mcp" },
  },
  {
    id: "railway",
    name: "Railway",
    by: "Railway",
    site: "https://railway.com",
    docs: "https://docs.railway.com/reference/mcp-server",
    category: "code",
    logo: { src: "/brands/railway.png", icon: true },
    desc: { en: "Projects, deploys and flags on Railway", id: "Proyek, deploy, dan feature flag di Railway" },
    about: {
      en: "Railway's own server: agents list and create projects, redeploy services, change feature flags, and hand multi-step work such as log analysis to Railway's AI agent. These act on your real projects, and accept-deploy commits staged changes and deploys them.",
      id: "Server resmi Railway: agen melihat dan membuat proyek, men-deploy ulang layanan, mengubah feature flag, dan menyerahkan pekerjaan bertahap seperti analisis log ke agen AI Railway. Semua itu berlaku pada proyek sungguhan, dan accept-deploy meng-commit perubahan yang tertahan lalu men-deploy-nya.",
    },
    features: [
      feature("Projects", "list projects and services, create new projects", "Proyek", "lihat proyek dan layanan, buat proyek baru"),
      feature(
        "Deploys",
        "redeploy a service or commit staged changes and deploy",
        "Deploy",
        "deploy ulang layanan atau commit perubahan tertahan lalu deploy",
      ),
      feature("Feature flags", "list, read, set and delete them", "Feature flag", "lihat, baca, atur, dan hapus"),
      feature(
        "Railway's agent",
        "hand it debugging, log analysis and service configuration",
        "Agen Railway",
        "serahkan debugging, analisis log, dan konfigurasi layanan",
      ),
    ],
    tools: names(`
      whoami list-projects create-project list-services list-feature-flags get-feature-flag set-feature-flag
      delete-feature-flag redeploy accept-deploy railway-agent
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.railway.com" },
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    by: "Cloudflare",
    site: "https://www.cloudflare.com",
    docs: "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/",
    category: "code",
    logo: { src: "/brands/cloudflare.jpg", icon: true },
    desc: { en: "The Cloudflare API and its developer docs", id: "API Cloudflare dan dokumentasi developernya" },
    about: {
      en: "Cloudflare's own server: agents write code that finds and calls Cloudflare API endpoints across Workers, DNS, R2, D1 and more, and search the developer docs. It can change real resources, limited by the permissions you pick when signing in.",
      id: "Server resmi Cloudflare: agen menulis kode untuk mencari dan memanggil endpoint API Cloudflare di Workers, DNS, R2, D1, dan lainnya, serta mencari di dokumentasi developer. Server ini bisa mengubah resource sungguhan, sebatas izin yang kamu pilih saat login.",
    },
    features: [
      feature(
        "Find endpoints",
        "write code that searches the API specification",
        "Cari endpoint",
        "tulis kode untuk mencari di spesifikasi API",
      ),
      feature(
        "Call the API",
        "write code that calls the endpoints it found",
        "Panggil API",
        "tulis kode untuk memanggil endpoint yang ditemukan",
      ),
      feature(
        "Read the docs",
        "search Cloudflare's developer documentation",
        "Baca dokumentasi",
        "cari di dokumentasi developer Cloudflare",
      ),
      feature("Check the account", "see which user or account is connected", "Cek akun", "lihat user atau akun yang tersambung"),
    ],
    tools: names("docs search execute whoami"),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.cloudflare.com/mcp" },
  },
  {
    id: "neon",
    name: "Neon",
    by: "Neon",
    site: "https://neon.com",
    docs: "https://neon.com/docs/ai/neon-mcp-server",
    category: "code",
    logo: { src: "/brands/neon.png", icon: true },
    desc: { en: "Postgres projects, branches and SQL on Neon", id: "Proyek Postgres, branch, dan SQL di Neon" },
    about: {
      en: "Neon's own server: agents manage projects and branches, run SQL and prepare migrations on your Neon databases. It can delete projects and change data, and Neon recommends it for development and testing, not production.",
      id: "Server resmi Neon: agen mengelola proyek dan branch, menjalankan SQL, dan menyiapkan migrasi di database Neon kamu. Server ini bisa menghapus proyek dan mengubah data, dan Neon menyarankannya untuk development dan testing, bukan production.",
    },
    features: [
      feature("Projects and branches", "list, create, reset and delete them", "Proyek dan branch", "lihat, buat, reset, dan hapus"),
      feature(
        "Run SQL",
        "run single queries or transactions and read table schemas",
        "Jalankan SQL",
        "jalankan satu query atau transaksi dan baca skema tabel",
      ),
      feature(
        "Migrate on a branch",
        "test a schema change on a temporary branch, then apply it",
        "Migrasi di branch",
        "uji perubahan skema di branch sementara, lalu terapkan",
      ),
      feature(
        "Tune queries",
        "find slow queries, read execution plans and test optimizations",
        "Optimalkan query",
        "temukan query lambat, baca execution plan, dan uji optimasi",
      ),
    ],
    moreTools: true,
    tools: names(`
      list_projects count_projects describe_project create_project delete_project list_organizations list_branches
      create_branch delete_branch describe_branch reset_from_parent compare_database_schema list_snapshots create_snapshot
      restore_snapshot list_branch_computes get_connection_string run_sql run_sql_transaction get_database_tables
      describe_table_schema prepare_database_migration complete_database_migration inspect_database list_slow_queries
      explain_sql_statement prepare_query_tuning complete_query_tuning provision_neon_auth get_neon_auth_config
      provision_neon_data_api search fetch search_docs get_doc list_functions deploy_function list_storage_buckets
      create_storage_bucket query_logs
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.neon.tech/mcp" },
  },
  {
    id: "postman",
    name: "Postman",
    by: "Postman",
    site: "https://www.postman.com",
    docs: "https://learning.postman.com/docs/developer/postman-api/postman-mcp-server/",
    category: "code",
    logo: { src: "/brands/postman.png", icon: true },
    desc: { en: "Collections, specs and mocks in Postman", id: "Koleksi, spec, dan mock di Postman" },
    about: {
      en: "Postman's own server: agents read and change workspaces, collections, environments, mocks, monitors and specs, and can run collections and monitors. This address loads the full set of more than 100 tools, which can also delete those things and publish mocks and documentation.",
      id: "Server resmi Postman: agen membaca dan mengubah workspace, koleksi, environment, mock, monitor, dan spec, serta bisa menjalankan koleksi dan monitor. Alamat ini memuat set lengkap berisi lebih dari 100 tool, yang juga bisa menghapus semua itu dan memublikasikan mock serta dokumentasi.",
    },
    features: [
      feature(
        "Work with collections",
        "create, update, duplicate and run collections",
        "Kelola koleksi",
        "buat, ubah, duplikat, dan jalankan koleksi",
      ),
      feature(
        "Set up test targets",
        "environments, mock servers and monitors",
        "Siapkan target uji",
        "environment, mock server, dan monitor",
      ),
      feature(
        "Keep specs in step",
        "generate specs and sync them with collections",
        "Selaraskan spec",
        "buat spec dan selaraskan dengan koleksi",
      ),
    ],
    moreTools: true,
    tools: names(`
      getWorkspaces getWorkspace createWorkspace updateWorkspace deleteWorkspace getCollections getCollection createCollection putCollection
      patchCollection deleteCollection duplicateCollection generateCollection runCollection createCollectionRequest getCollectionRequest
      updateCollectionRequest deleteCollectionRequest createCollectionResponse getEnvironments getEnvironment createEnvironment putEnvironment
      deleteEnvironment getMocks getMock createMock publishMock getMonitors createMonitor runMonitor getAllSpecs getSpec createSpec
      syncCollectionWithSpec syncSpecWithCollection generateSpecFromCollection publishDocumentation searchPostmanElements getAuthenticatedUser
      getEnabledTools
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.postman.com/mcp" },
  },
  {
    id: "posthog",
    name: "PostHog",
    by: "PostHog",
    site: "https://posthog.com",
    docs: "https://posthog.com/docs/model-context-protocol",
    category: "code",
    logo: { src: "/brands/posthog.png", icon: true },
    desc: { en: "Analytics, flags and errors in PostHog", id: "Analitik, flag, dan error di PostHog" },
    about: {
      en: "PostHog's own server: agents query analytics and read and change feature flags, experiments, dashboards and more, including deleting them. Some tools send email, and some AI-powered tools may be billed as PostHog AI spend.",
      id: "Server resmi PostHog: agen menjalankan query analitik serta membaca dan mengubah feature flag, eksperimen, dashboard, dan lainnya, termasuk menghapusnya. Sebagian tool mengirim email, dan sebagian tool berbasis AI bisa ditagih sebagai biaya AI PostHog.",
    },
    features: [
      feature("Ask the data", "trends, funnels, retention and SQL", "Tanya data", "tren, funnel, retensi, dan SQL"),
      feature("Ship changes", "feature flags and experiments", "Rilis perubahan", "feature flag dan eksperimen"),
      feature("Find problems", "error tracking, logs and session replays", "Temukan masalah", "pelacakan error, log, dan rekaman sesi"),
      feature(
        "Region follows your login",
        "US or EU, set by the account you sign in with",
        "Region mengikuti akun",
        "US atau EU, sesuai akun yang dipakai masuk",
      ),
    ],
    moreTools: true,
    tools: names(`
      docs-search read-data-schema execute-sql insight-query insights-list insight-get insight-create insight-update insight-delete query-trends
      query-funnel query-retention query-paths query-web-overview query-logs dashboards-get-all dashboard-get dashboard-create dashboard-update
      feature-flag-get-all feature-flag-get-definition create-feature-flag update-feature-flag delete-feature-flag experiment-list experiment-get
      experiment-create experiment-results-get query-error-tracking-issues-list query-error-tracking-issue error-tracking-issues-partial-update
      surveys-get-all survey-create query-session-recordings-list session-recording-get query-llm-traces-list persons-list cohorts-list
      workflows-send-email-prepare workflows-send-email-execute
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.posthog.com/mcp" },
  },
  {
    id: "grafana",
    name: "Grafana",
    by: "Grafana Labs",
    site: "https://grafana.com",
    docs: "https://grafana.com/docs/grafana-cloud/ai-tools/mcp-servers/cloud-mcp/",
    category: "code",
    logo: { src: "/brands/grafana.png", icon: true },
    desc: { en: "Dashboards, metrics and logs in Grafana Cloud", id: "Dashboard, metrik, dan log di Grafana Cloud" },
    about: {
      en: "Grafana Labs' own server for Grafana Cloud: agents read dashboards, metrics, logs, alerts and incidents. You pick read, query and write access when you sign in: write access changes dashboards, alerts and incidents, raw SQL queries can modify data, and each user plus any tool that calls an Assistant model adds to your Grafana Assistant usage.",
      id: "Server resmi Grafana Labs untuk Grafana Cloud: agen membaca dashboard, metrik, log, alert, dan insiden. Kamu memilih akses baca, query, dan tulis saat masuk: akses tulis mengubah dashboard, alert, dan insiden, query SQL mentah bisa mengubah data, dan tiap pengguna serta tool yang memanggil model Assistant menambah pemakaian Grafana Assistant kamu.",
    },
    features: [
      feature(
        "Query signals",
        "Prometheus metrics, Loki logs and Pyroscope profiles",
        "Query sinyal",
        "metrik Prometheus, log Loki, dan profil Pyroscope",
      ),
      feature(
        "Query other sources",
        "CloudWatch, Elasticsearch, ClickHouse, Snowflake and more",
        "Query sumber lain",
        "CloudWatch, Elasticsearch, ClickHouse, Snowflake, dan lainnya",
      ),
      feature(
        "Follow an incident",
        "alerts, incidents, on-call and investigations",
        "Ikuti insiden",
        "alert, insiden, on-call, dan investigasi",
      ),
      feature(
        "Choose the access",
        "read, query and write are separate at sign-in",
        "Pilih akses",
        "baca, query, dan tulis terpisah saat masuk",
      ),
    ],
    moreTools: true,
    tools: names(`
      search_dashboards search_folders generate_deeplink get_dashboard_by_uid get_dashboard_summary get_dashboard_panel_queries update_dashboard
      create_folder list_datasources get_datasource list_prometheus_metric_names list_prometheus_label_names query_prometheus list_loki_label_names
      query_loki_logs query_loki_stats query_loki_patterns query_pyroscope query_athena query_clickhouse query_cloudwatch query_elasticsearch
      query_influxdb query_snowflake alerting_manage_rules alerting_manage_routing get_annotations create_annotation update_annotation
      list_incidents get_incident create_incident add_activity_to_incident list_oncall_schedules get_current_oncall_users list_alert_groups
      get_alert_group list_investigations create_investigation ask_assistant describe_infrastructure get_panel_image
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.grafana.com/mcp" },
  },
  {
    id: "betterstack",
    name: "Better Stack",
    by: "Better Stack",
    site: "https://betterstack.com",
    docs: "https://betterstack.com/docs/getting-started/integrations/mcp/",
    category: "code",
    logo: { src: "/brands/betterstack.png", icon: true },
    desc: { en: "Incidents, monitors and logs on Better Stack", id: "Insiden, monitor, dan log di Better Stack" },
    about: {
      en: "Better Stack's own server: agents read incidents, monitors, on-call schedules, logs and errors. With full access they can also acknowledge, escalate and resolve incidents, which notifies people, change monitors and status pages, and invite or remove team members.",
      id: "Server resmi Better Stack: agen membaca insiden, monitor, jadwal on-call, log, dan error. Dengan akses penuh, agen juga bisa mengakui, mengeskalasi, dan menyelesaikan insiden, yang akan memberi tahu orang terkait, mengubah monitor dan status page, serta mengundang atau mengeluarkan anggota tim.",
    },
    features: [
      feature(
        "Handle incidents",
        "timelines, comments, acknowledge and resolve",
        "Tangani insiden",
        "linimasa, komentar, akui, dan selesaikan",
      ),
      feature("Watch uptime", "monitors, heartbeats and availability", "Pantau uptime", "monitor, heartbeat, dan ketersediaan"),
      feature("Query telemetry", "logs, metrics, traces and errors", "Query telemetri", "log, metrik, trace, dan error"),
      feature("Build dashboards", "charts, sections and chart alerts", "Buat dashboard", "chart, bagian, dan alert chart"),
    ],
    tools: names(`
      documentation incidents incident incident_timeline incident_comments create_incident_comment acknowledge_incident escalate_incident
      resolve_incident monitors monitor create_monitor monitor_availability monitor_response_times create_heartbeat on_calls on_call
      escalation_policies escalation_policy create_status_page_report sources source source_fields query render_chart query_help metrics_query_help
      errors_query_help metrics_schema dashboard create_dashboard add_chart_to_dashboard edit_chart remove_dashboard remove_chart chart_alerts
      create_chart_alert errors update_error_state create_error_issue applications releases
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.betterstack.com" },
  },
  {
    id: "jam",
    name: "Jam",
    by: "Jam",
    site: "https://jam.dev",
    docs: "https://jam.dev/docs/debug-a-jam/mcp",
    category: "code",
    logo: { src: "/brands/jam.png", icon: true },
    desc: { en: "Bug reports, logs and comments in Jam", id: "Laporan bug, log, dan komentar di Jam" },
    about: {
      en: "Jam's own server: agents read a Jam's console logs, network requests, screenshots and video transcript, and can comment on and organize Jams. It can also delete Jams and folders for good, and deleting a folder removes every Jam inside it.",
      id: "Server resmi Jam: agen membaca log konsol, request jaringan, screenshot, dan transkrip video dari sebuah Jam, serta bisa berkomentar dan merapikan Jam. Server ini juga bisa menghapus Jam dan folder secara permanen, dan menghapus folder ikut menghapus semua Jam di dalamnya.",
    },
    features: [
      feature(
        "Read a bug report",
        "console logs, network requests and user events",
        "Baca laporan bug",
        "log konsol, request jaringan, dan aksi pengguna",
      ),
      feature(
        "See what happened",
        "screenshots, video frames and transcripts",
        "Lihat kejadiannya",
        "screenshot, frame video, dan transkrip",
      ),
      feature(
        "Search and organize",
        "find Jams, move them and link related ones",
        "Cari dan rapikan",
        "cari Jam, pindahkan, dan tautkan yang terkait",
      ),
      feature("No recording", "the server cannot record new Jams", "Tanpa perekaman", "server ini tidak bisa merekam Jam baru"),
    ],
    tools: names(`
      getDetails getConsoleLogs getNetworkRequests getUserEvents getEvents getMetadata getScreenshots getVideoTranscript getVideoChapters getFrames
      searchJams listMembers listFolders createComment editComment deleteComment addReaction removeReaction updateJam addResource removeResource
      markRelated markUnrelated deleteJam createFolder updateFolder deleteFolder listRecordingLinks getRecordingLink listRecordingLinkJams
      createRecordingLink updateRecordingLink deleteRecordingLink listRecordingUrls getRecordingUrlVerifyLink submitFeedback
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.jam.dev/mcp" },
  },
  {
    id: "clickup",
    name: "ClickUp",
    by: "ClickUp",
    site: "https://clickup.com",
    docs: "https://developer.clickup.com/docs/mcp-tools",
    category: "work",
    logo: { src: "/brands/clickup.png", icon: true },
    desc: { en: "Tasks, docs and time tracking in ClickUp", id: "Tugas, dokumen, dan catatan waktu di ClickUp" },
    about: {
      en: "ClickUp's own server: agents find, create and change tasks, docs, lists and time entries, and post comments and chat messages as you. It can also send tasks to Trash and delete comments.",
      id: "Server resmi ClickUp: agen mencari, membuat, dan mengubah tugas, dokumen, list, dan catatan waktu, serta mengirim komentar dan pesan chat atas nama kamu. Server ini juga bisa memindahkan tugas ke Trash dan menghapus komentar.",
    },
    features: [
      feature(
        "Manage tasks",
        "create, update, move, merge and link tasks",
        "Kelola tugas",
        "buat, ubah, pindahkan, gabungkan, dan tautkan tugas",
      ),
      feature("Track time", "timers, time entries and time in status", "Catat waktu", "timer, catatan waktu, dan waktu per status"),
      feature("Write and talk", "docs, task comments and chat messages", "Tulis dan kabari", "dokumen, komentar tugas, dan pesan chat"),
      feature("Search the workspace", "tasks, members, lists and folders", "Cari di workspace", "tugas, anggota, list, dan folder"),
    ],
    moreTools: true,
    tools: names(`
      clickup_search clickup_filter_tasks clickup_get_task clickup_create_task clickup_update_task clickup_delete_task clickup_move_task
      clickup_merge_tasks clickup_add_task_dependency clickup_add_task_link clickup_add_tag_to_task clickup_get_custom_fields
      clickup_start_time_tracking clickup_stop_time_tracking clickup_add_time_entry clickup_get_time_entries clickup_attach_task_file
      clickup_get_task_comments clickup_create_task_comment clickup_update_comment clickup_delete_comment clickup_create_document
      clickup_get_document_pages clickup_create_document_page clickup_update_document_page clickup_get_chat_channels
      clickup_get_chat_channel_messages clickup_send_chat_message clickup_get_list clickup_create_list clickup_update_list clickup_get_folder
      clickup_create_folder clickup_create_reminder clickup_search_reminders clickup_get_workspace_hierarchy clickup_get_workspace_members
      clickup_get_schema clickup_get_operators clickup_execute_operator
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.clickup.com/mcp" },
  },
  {
    id: "monday",
    name: "monday.com",
    by: "monday.com",
    site: "https://monday.com",
    docs: "https://github.com/mondaycom/mcp",
    category: "work",
    logo: { src: "/brands/monday.png", icon: true },
    desc: { en: "Boards, items and docs on monday.com", id: "Board, item, dan dokumen di monday.com" },
    about: {
      en: "monday.com's own server: agents read and change boards, items, columns, docs and forms. It can also delete items and columns, and send people notifications in the app or by email.",
      id: "Server resmi monday.com: agen membaca dan mengubah board, item, kolom, dokumen, dan formulir. Server ini juga bisa menghapus item dan kolom, serta mengirim notifikasi ke orang lain di aplikasi atau lewat email.",
    },
    features: [
      feature("Work on boards", "create boards, groups, columns and items", "Kelola board", "buat board, grup, kolom, dan item"),
      feature(
        "Update the work",
        "change column values, move items and post updates",
        "Perbarui pekerjaan",
        "ubah nilai kolom, pindahkan item, dan kirim update",
      ),
      feature(
        "Docs and forms",
        "create and read docs, forms and submissions",
        "Dokumen dan formulir",
        "buat dan baca dokumen, formulir, dan isiannya",
      ),
      feature(
        "Dashboards and automations",
        "create dashboards and manage automations",
        "Dashboard dan otomatisasi",
        "buat dashboard dan kelola otomatisasi",
      ),
    ],
    moreTools: true,
    tools: names(`
      get_board_items_page get_board_info get_board_schema get_board_activity get_full_board_data create_board create_item create_items delete_item
      change_item_column_values update_items move_item_to_group create_group create_column update_column delete_column create_update get_updates
      delete_update create_doc read_docs update_doc add_content_to_doc list_workspaces workspace_info create_workspace create_folder move_object
      create_form get_form create_form_submission create_dashboard create_widget search list_users_and_teams get_user_context create_notification
      list_automations manage_automations undo_action
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.monday.com/mcp" },
  },
  {
    id: "todoist",
    name: "Todoist",
    by: "Doist",
    site: "https://www.todoist.com",
    docs: "https://github.com/Doist/todoist-ai",
    category: "work",
    logo: { src: "/brands/todoist.png", icon: true },
    desc: { en: "Tasks, projects and comments in Todoist", id: "Tugas, proyek, dan komentar di Todoist" },
    about: {
      en: "Todoist's own server: agents find, add, complete and reschedule tasks, and manage projects, sections, labels and comments. It can also delete them, and comments notify the people an agent names.",
      id: "Server resmi Todoist: agen mencari, menambah, menyelesaikan, dan menjadwal ulang tugas, serta mengelola proyek, bagian, label, dan komentar. Server ini juga bisa menghapus semua itu, dan komentar memberi tahu orang yang disebut agen.",
    },
    features: [
      feature(
        "Manage tasks",
        "add, update, complete and reschedule tasks",
        "Kelola tugas",
        "tambah, ubah, selesaikan, dan jadwal ulang tugas",
      ),
      feature("Organize", "projects, sections, labels and filters", "Rapikan", "proyek, bagian, label, dan filter"),
      feature("Work with others", "collaborators, assignments and comments", "Kerja bersama", "kolaborator, penugasan, dan komentar"),
      feature(
        "See progress",
        "overviews, activity and productivity stats",
        "Lihat progres",
        "ringkasan, aktivitas, dan statistik produktivitas",
      ),
    ],
    moreTools: true,
    tools: names(`
      add-tasks update-tasks complete-tasks uncomplete-tasks reschedule-tasks find-tasks find-tasks-by-date find-completed-tasks add-projects
      update-projects find-projects project-management project-move add-sections update-sections find-sections add-comments update-comments
      find-comments add-reminders update-reminders find-reminders add-labels update-labels find-labels add-filters find-filters
      find-project-collaborators manage-assignments find-activity get-productivity-stats get-project-health get-overview delete-object fetch-object
      reorder-objects user-info list-workspaces view-attachment search
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://ai.todoist.net/mcp" },
  },
  {
    id: "airtable",
    name: "Airtable",
    by: "Airtable",
    site: "https://airtable.com",
    docs: "https://airtable.com/developers/agents/mcp/getting-started",
    category: "work",
    logo: { src: "/brands/airtable.png", icon: true },
    desc: { en: "Bases, records and automations in Airtable", id: "Base, record, dan otomatisasi di Airtable" },
    about: {
      en: "Airtable's own server: agents read and change bases, tables, fields and records, and build interfaces. It can also delete records and whole tables; new automations stay off until you turn them on in Airtable.",
      id: "Server resmi Airtable: agen membaca dan mengubah base, tabel, field, dan record, serta membuat interface. Server ini juga bisa menghapus record dan seluruh tabel; otomatisasi baru tetap mati sampai kamu menyalakannya di Airtable.",
    },
    features: [
      feature("Work with records", "search, create, update and delete records", "Kelola record", "cari, buat, ubah, dan hapus record"),
      feature("Shape the base", "create bases, tables and fields", "Atur base", "buat base, tabel, dan field"),
      feature(
        "Build interfaces",
        "create interfaces and pages, submit forms",
        "Buat interface",
        "buat interface dan halaman, kirim formulir",
      ),
      feature(
        "Draft automations",
        "saved as drafts for you to review and turn on",
        "Susun otomatisasi",
        "disimpan sebagai draf untuk kamu tinjau dan nyalakan",
      ),
    ],
    tools: names(`
      list_workspaces list_bases search_bases create_base list_tables_for_base get_table_schema create_table update_table delete_table create_field
      update_field list_views_for_table list_records_for_table search_records create_records_for_table update_records_for_table
      delete_records_for_table display_records_for_table search_candidate_linked_records revert_action list_pages_for_base create_interface
      delete_interface create_page delete_page describe_page_type describe_page_element list_records_for_page get_record_for_page get_form_schema
      submit_form list_automations get_automation get_create_automation_instructions create_automation update_automation delete_automation
      fetch_automation_input_data test_automation_webhook_trigger list_external_accounts
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.airtable.com/mcp" },
  },
  {
    id: "miro",
    name: "Miro",
    by: "Miro",
    site: "https://miro.com",
    docs: "https://developers.miro.com/docs/mcp-intro",
    category: "work",
    logo: { src: "/brands/miro.png", icon: true },
    desc: { en: "Boards, diagrams and comments on Miro", id: "Board, diagram, dan komentar di Miro" },
    about: {
      en: "Miro's own server: agents read boards, create boards, diagrams, documents and tables, update them, and reply to comments, within your existing board permissions. Summarizing a board uses AI credits, and on Enterprise plans an admin must enable the server first.",
      id: "Server resmi Miro: agen membaca board, membuat board, diagram, dokumen, dan tabel, mengubahnya, serta membalas komentar, sesuai izin board yang sudah kamu miliki. Meringkas board memakai kredit AI, dan di paket Enterprise admin harus mengaktifkan server ini dulu.",
    },
    features: [
      feature("Read a board", "search boards, list items and summarize content", "Baca board", "cari board, lihat item, dan ringkas isi"),
      feature(
        "Add to a board",
        "diagrams, documents, tables, images and code",
        "Tambah ke board",
        "diagram, dokumen, tabel, gambar, dan kode",
      ),
      feature("Handle comments", "read, reply and resolve threads", "Kelola komentar", "baca, balas, dan selesaikan utas"),
    ],
    tools: names(`
      board_create board_search_boards board_list_items context_get context_explore layout_create layout_update layout_read layout_get_dsl
      diagram_create doc_create doc_update table_create table_sync_rows image_create image_get_url code_widget_create comment_list_comments
      comment_reply comment_resolve
    `),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.miro.com/" },
  },
  {
    id: "cal",
    name: "Cal.com",
    by: "Cal.com",
    site: "https://cal.com",
    docs: "https://cal.com/docs/mcp-server",
    category: "work",
    logo: { src: "/brands/cal.png", icon: true },
    desc: { en: "Bookings and event types on Cal.com", id: "Booking dan tipe acara di Cal.com" },
    about: {
      en: "Cal.com's own server: agents read and change your profile, event types, schedules, routing forms and bookings, including creating and cancelling real bookings, and can manage team and organization memberships. It has 76 tools, more than the most used ones listed here, and one of them can call any Cal.com API v2 operation.",
      id: "Server resmi Cal.com: agen membaca dan mengubah profil, tipe acara, jadwal, formulir routing, dan booking, termasuk membuat dan membatalkan booking sungguhan, serta bisa mengelola keanggotaan tim dan organisasi. Ada 76 tool, lebih banyak daripada yang paling sering dipakai di sini, dan salah satunya bisa memanggil operasi apa pun di Cal.com API v2.",
    },
    features: [
      feature(
        "Manage bookings",
        "create, reschedule, cancel and confirm",
        "Kelola booking",
        "buat, jadwalkan ulang, batalkan, dan konfirmasi",
      ),
      feature(
        "Check availability",
        "open slots and busy times from calendars",
        "Cek ketersediaan",
        "slot kosong dan waktu sibuk dari kalender",
      ),
      feature("Set up event types", "create, edit, delete and duplicate", "Atur tipe acara", "buat, ubah, hapus, dan duplikasi"),
      feature("Run teams", "invites, memberships and routing forms", "Kelola tim", "undangan, keanggotaan, dan formulir routing"),
    ],
    moreTools: true,
    tools: names(
      "get_me search_docs get_app_link get_event_types get_event_type create_event_type update_event_type delete_event_type get_bookings get_booking create_booking reschedule_booking cancel_booking confirm_booking mark_booking_absent add_booking_attendee get_booking_attendees get_schedules get_schedule create_schedule update_schedule delete_schedule get_default_schedule get_availability get_busy_times get_connected_calendars get_conferencing_apps list_contacts add_contact get_my_teams get_org_teams create_team_invite get_team_memberships get_org_memberships get_routing_form create_routing_form get_org_routing_forms calculate_routing_form_slots find_api_operation describe_api_operation call_api_operation",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.cal.com/mcp" },
  },
  {
    id: "semrush",
    name: "Semrush",
    by: "Semrush",
    site: "https://www.semrush.com",
    docs: "https://developer.semrush.com/api/introduction/semrush-mcp/",
    category: "data",
    logo: { src: "/brands/semrush.png", icon: true },
    desc: { en: "Keyword and backlink data from Semrush", id: "Data kata kunci dan backlink dari Semrush" },
    about: {
      en: "Semrush's own server: agents read SEO API and Trends API data, and read your projects without being able to create them or change their settings. Each request uses API units, and access needs an eligible Semrush plan or a Trends API subscription.",
      id: "Server resmi Semrush: agen membaca data SEO API dan Trends API, serta membaca proyekmu tanpa bisa membuat atau mengubah pengaturannya. Setiap permintaan memakai unit API, dan aksesnya butuh paket Semrush yang memenuhi syarat atau langganan Trends API.",
    },
    features: [
      feature("Research keywords", "volume, difficulty, intent and CPC", "Riset kata kunci", "volume, tingkat kesulitan, intent, dan CPC"),
      feature(
        "Compare competitors",
        "keyword and backlink gaps between domains",
        "Bandingkan pesaing",
        "selisih kata kunci dan backlink antardomain",
      ),
      feature(
        "Inspect backlinks",
        "referring domains, anchors and Authority Score",
        "Periksa backlink",
        "domain perujuk, anchor, dan Authority Score",
      ),
      feature(
        "Read site audits",
        "issues from your existing Site Audit projects",
        "Baca audit situs",
        "masalah dari proyek Site Audit yang sudah ada",
      ),
    ],
    tools: names(
      "keyword_research organic_research competitors_research domain_overview backlinks_research paid_search_research traffic_overview projects site_audit get_report_schema execute_report",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.semrush.com/v2/mcp" },
  },
  {
    id: "canva",
    name: "Canva",
    by: "Canva",
    site: "https://www.canva.com",
    docs: "https://www.canva.dev/docs/apps/mcp/",
    category: "work",
    logo: { src: "/brands/canva.png", icon: true },
    desc: { en: "Designs, templates and exports on Canva", id: "Desain, template, dan ekspor di Canva" },
    about: {
      en: "Canva's own server: agents search, create, edit, comment on and export designs, and uploads and generated designs land in the Canva account you sign in with. Autofill, brand templates and resize need Canva Pro or above.",
      id: "Server resmi Canva: agen mencari, membuat, mengubah, mengomentari, dan mengekspor desain, dan hasil unggahan serta desain buatan masuk ke akun Canva yang kamu pakai untuk masuk. Autofill, template brand, dan resize butuh Canva Pro ke atas.",
    },
    features: [
      feature("Generate designs", "create designs from a text description", "Buat desain", "buat desain dari deskripsi teks"),
      feature("Edit in draft", "edits stay in draft until committed", "Edit sebagai draf", "perubahan tetap draf sampai di-commit"),
      feature("Export files", "Pro quality on Canva Pro and above", "Ekspor file", "kualitas Pro di Canva Pro ke atas"),
      feature(
        "Keep things organized",
        "upload assets and move items into folders",
        "Rapikan isi akun",
        "unggah aset dan pindahkan item ke folder",
      ),
    ],
    moreTools: true,
    tools: names(
      "upload-asset-from-url get-assets create-upload-url autofill-design get-brand-template-dataset get-design-dataset search-brand-templates list-brand-kits create-design-from-brand-template create-brand-template-draft publish-brand-template comment-on-design reply-to-comment list-comments list-replies search-designs get-design get-design-pages get-design-content get-presenter-notes generate-design create-design-from-candidate create-design copy-design merge-designs import-design-from-url export-design generate-image remove-background separate-image-layers create-folder list-folder-items search-folders move-item-to-folder resize-design start-editing-transaction perform-editing-operations commit-editing-transaction cancel-editing-transaction get-design-thumbnail",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.canva.com/mcp" },
  },
  {
    id: "resend",
    name: "Resend",
    by: "Resend",
    site: "https://resend.com",
    docs: "https://resend.com/docs/mcp-server",
    category: "work",
    logo: { src: "/brands/resend.png", icon: true },
    desc: { en: "Email, contacts and broadcasts on Resend", id: "Email, kontak, dan broadcast di Resend" },
    about: {
      en: "Resend's own server: agents can send real email and broadcasts to real people, read received mail, and change contacts, domains, webhooks and API keys on your account. It offers many more tools than the most used ones listed here.",
      id: "Server resmi Resend: agen bisa mengirim email dan broadcast sungguhan ke orang sungguhan, membaca email masuk, dan mengubah kontak, domain, webhook, serta API key di akunmu. Tool-nya jauh lebih banyak daripada yang paling sering dipakai di sini.",
    },
    features: [
      feature(
        "Send email",
        "HTML, attachments, scheduling and batch sends",
        "Kirim email",
        "HTML, lampiran, penjadwalan, dan kirim massal",
      ),
      feature("Work an inbox", "threads, labels, drafts and replies", "Kelola inbox", "utas, label, draf, dan balasan"),
      feature("Run broadcasts", "create, schedule and send campaigns", "Jalankan broadcast", "buat, jadwalkan, dan kirim kampanye"),
      feature("Set up sending", "verify domains and manage webhooks", "Siapkan pengiriman", "verifikasi domain dan kelola webhook"),
    ],
    moreTools: true,
    tools: names(
      "send-email send-batch-emails list-emails get-email cancel-email update-email list-received-emails get-received-email get-received-email-attachment create-inbox list-inboxes list-inbox-threads search-inbox-threads reply-to-inbox-thread-email send-new-inbox-email create-inbox-draft send-inbox-draft create-broadcast send-broadcast list-broadcasts get-broadcast cancel-broadcast create-contact list-contacts get-contact update-contact remove-contact create-contact-import create-template list-templates compose-template publish-template create-domain list-domains verify-domain list-segments create-automation send-event create-api-key create-webhook list-logs",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.resend.com/mcp" },
  },
  {
    id: "brevo",
    name: "Brevo",
    by: "Brevo",
    site: "https://www.brevo.com",
    docs: "https://developers.brevo.com/docs/mcp-protocol",
    category: "work",
    logo: { src: "/brands/brevo.png", icon: true },
    desc: { en: "Campaigns, contacts and deals on Brevo", id: "Kampanye, kontak, dan deal di Brevo" },
    about: {
      en: "Brevo's own server: agents can create and send email, SMS and WhatsApp campaigns to real recipients, and change contacts, deals, senders, domains and users on your account. It covers 27 modules, with many more tools than the ones listed here.",
      id: "Server resmi Brevo: agen bisa membuat dan mengirim kampanye email, SMS, dan WhatsApp ke penerima sungguhan, serta mengubah kontak, deal, pengirim, domain, dan pengguna di akunmu. Cakupannya 27 modul, dengan tool jauh lebih banyak daripada yang tercantum di sini.",
    },
    features: [
      feature("Email campaigns", "create, manage and view performance", "Kampanye email", "buat, kelola, dan lihat performa"),
      feature("SMS and WhatsApp", "create and send campaigns", "SMS dan WhatsApp", "buat dan kirim kampanye"),
      feature("CRM", "deals, companies, tasks, notes and pipelines", "CRM", "deal, perusahaan, tugas, catatan, dan pipeline"),
      feature("Contacts", "lists, segments and bulk import or export", "Kontak", "daftar, segmen, dan impor atau ekspor massal"),
    ],
    moreTools: true,
    tools: names(
      "accounts_get_account attributes_get_attributes campaign_analytics_get_email_event_report domains_get_domains email_campaign_management_create_email_campaign email_campaign_management_get_email_campaign email_campaign_management_get_shared_template_url email_campaign_management_send_email_campaign_now email_campaign_management_send_test_email email_campaign_management_update_campaign_status email_campaign_management_update_email_campaign get_brevo_guide list_brevo_guides lists_get_list lists_get_lists segments_get_segments senders_get_senders templates_create_smtp_template templates_get_smtp_template templates_post_preview_smtp_email_templates templates_send_test_template templates_update_smtp_template",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.brevo.com/v1/brevo/mcp" },
  },
  {
    id: "webflow",
    name: "Webflow",
    by: "Webflow",
    site: "https://webflow.com",
    docs: "https://developers.webflow.com/mcp/reference/overview",
    category: "work",
    logo: { src: "/brands/webflow.png", icon: true },
    desc: { en: "Pages, CMS content and styles on Webflow", id: "Halaman, konten CMS, dan gaya di Webflow" },
    about: {
      en: "Webflow's own server: agents change elements, styles, pages, custom code and CMS items on sites in the workspace you authorize, and can publish CMS items and delete assets. They work within your Webflow role and appear in the site activity log, and a few features need the Designer open with the Bridge App.",
      id: "Server resmi Webflow: agen mengubah elemen, gaya, halaman, kode kustom, dan item CMS di situs dalam workspace yang kamu izinkan, serta bisa menerbitkan item CMS dan menghapus aset. Agen bekerja sesuai peran Webflow-mu dan tercatat di log aktivitas situs, dan beberapa fitur butuh Designer terbuka dengan Bridge App.",
    },
    features: [
      feature(
        "Design and build",
        "elements, styles, components and variables",
        "Desain dan bangun",
        "elemen, gaya, komponen, dan variabel",
      ),
      feature(
        "Manage the CMS",
        "collections, fields, bulk updates and publishing",
        "Kelola CMS",
        "koleksi, field, pembaruan massal, dan penerbitan",
      ),
      feature("Update SEO", "meta titles, descriptions and Open Graph tags", "Perbarui SEO", "judul meta, deskripsi, dan tag Open Graph"),
      feature(
        "Read analytics",
        "traffic and top pages with the Analyze add-on",
        "Baca analitik",
        "trafik dan halaman teratas dengan add-on Analyze",
      ),
    ],
    tools: names(
      "data_sites_tool data_pages_tool data_cms_tool data_components_tool data_scripts_tool data_comments_tool data_webhook_tool data_enterprise_tool data_workflows_tool ask_webflow_ai webflow_guide_tool element_tool element_builder whtml_builder element_snapshot_tool style_tool variable_tool asset_tool get_image_preview de_page_tool de_component_tool component_builder",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.webflow.com/mcp" },
  },
  {
    id: "zapier",
    name: "Zapier",
    by: "Zapier",
    site: "https://zapier.com",
    docs: "https://docs.zapier.com/mcp/home",
    category: "work",
    logo: { src: "/brands/zapier.png", icon: true },
    desc: { en: "Actions across thousands of apps via Zapier", id: "Aksi di ribuan aplikasi lewat Zapier" },
    about: {
      en: "Zapier's own server: agents find, enable and run actions across 9,000+ apps, so they can send messages and change real data there, and each successful call uses two tasks from your Zapier plan. Signing in sets up your server with the apps already connected to your Zapier account; with none it starts empty, and you connect each app the first time an agent needs it.",
      id: "Server resmi Zapier: agen mencari, mengaktifkan, dan menjalankan aksi di 9.000+ aplikasi, jadi bisa mengirim pesan dan mengubah data sungguhan di sana, dan setiap panggilan yang berhasil memakai dua task dari paket Zapier. Saat masuk, server disiapkan dengan aplikasi yang sudah terhubung ke akun Zapier; kalau belum ada, server mulai kosong dan kamu menghubungkan tiap aplikasi saat pertama kali dibutuhkan agen.",
    },
    features: [
      feature("Find actions", "search apps and enable what a task needs", "Cari aksi", "cari aplikasi dan aktifkan yang dibutuhkan"),
      feature("Run actions", "separate tools for reads and writes", "Jalankan aksi", "tool terpisah untuk baca dan tulis"),
      feature("Pick a connection", "list app connections and set the default", "Pilih koneksi", "lihat koneksi aplikasi dan atur default"),
      feature("Save skills", "reusable workflow instructions", "Simpan skill", "instruksi alur kerja yang bisa dipakai ulang"),
    ],
    tools: names(
      "inspect_zapier_actions discover_zapier_actions enable_zapier_action disable_zapier_action auto_provision_mcp execute_zapier_read_action execute_zapier_write_action list_zapier_connections manage_zapier_connections get_configuration_url list_zapier_skills get_zapier_skill create_zapier_skill update_zapier_skill delete_zapier_skill send_feedback",
    ),
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.zapier.com/api/v1/connect" },
  },
  {
    id: "make",
    name: "Make",
    by: "Make",
    site: "https://www.make.com",
    docs: "https://developers.make.com/mcp-server/make-mcp-server",
    category: "work",
    logo: { src: "/brands/make.png", icon: true },
    desc: { en: "Scenarios and automations on Make", id: "Skenario dan otomasi di Make" },
    about: {
      en: "Make's own server: agents run your scenarios and, on paid plans, view and change scenarios, connections, webhooks, data stores, teams and organizations, according to the scopes you pick at sign-in. Only active and on-demand scenarios become tools, so set them up in Make first with inputs, outputs and a clear description; the run scope covers all of them in the organization.",
      id: "Server resmi Make: agen menjalankan skenariomu dan, di paket berbayar, melihat serta mengubah skenario, koneksi, webhook, data store, tim, dan organisasi, sesuai scope yang kamu pilih saat masuk. Hanya skenario aktif dan on-demand yang menjadi tool, jadi siapkan dulu di Make dengan input, output, dan deskripsi yang jelas; scope menjalankan skenario mencakup semuanya di organisasi itu.",
    },
    features: [
      feature("Run scenarios", "active and on-demand scenarios as tools", "Jalankan skenario", "skenario aktif dan on-demand sebagai tool"),
      feature(
        "Manage Make",
        "connections, webhooks and data stores on paid plans",
        "Kelola Make",
        "koneksi, webhook, dan data store di paket berbayar",
      ),
      feature("Choose access", "pick the organization and scopes at sign-in", "Pilih akses", "pilih organisasi dan scope saat masuk"),
      feature(
        "Long runs",
        "a timed-out scenario keeps running up to 40 minutes",
        "Proses panjang",
        "skenario yang timeout tetap jalan hingga 40 menit",
      ),
    ],
    tools: [],
    added: "2026-11",
    server: { transport: "http", url: "https://mcp.make.com/v2" },
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
