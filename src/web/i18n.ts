import type { AgentKind, NodeStatus, RunStatus } from "../shared/types";

const en = {
  newMission: "New mission",
  missions: "Missions",
  missionsEmpty: "No missions yet. Missions you launch show up here.",
  missionsError: "Could not load missions.",
  retry: "Retry",
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",

  composeOverline: "New mission",
  composeTitle: "What's the mission?",
  composeLead: "Describe the outcome you want. Satgas plots the route, splits the work across agents, and runs it.",
  missionLabel: "Mission brief",
  missionPlaceholder: "Build a landing page with a waitlist form and an API that stores signups in SQLite…",
  examplesLabel: "Start from an example",
  examples: [
    "Audit this repo for security issues and write a report",
    "Add unit tests for the untested modules and make them pass",
    "Write a README that explains how this project works",
  ],
  folderLabel: "Working folder",
  folderHint: "Agents read, write and run commands in this folder.",
  changeFolder: "Change working folder",
  launch: "Launch",
  launching: "Launching…",
  missionRequired: "Write the mission brief first.",

  node: {
    pending: "Waiting",
    running: "Running",
    done: "Done",
    failed: "Failed",
    skipped: "Skipped",
    cancelled: "Cancelled",
  } satisfies Record<NodeStatus, string>,
  run: {
    planning: "Planning",
    running: "Running",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
  } satisfies Record<RunStatus, string>,
  agent: { claude: "Claude Code", codex: "Codex" } satisfies Record<AgentKind, string>,

  plotting: "Plotting the route",
  cancel: "Cancel",
  cancelling: "Cancelling…",
  connected: "Connected",
  connecting: "Connecting",
  offline: "Reconnecting",
  slots: "Agents",
  loadingMission: "Loading mission",
  notFoundTitle: "Mission not found",
  notFoundLead: "It may have been deleted from this machine.",
  graphLabel: "Mission graph. Arrow keys pan, plus and minus zoom, 0 fits the view.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to view",

  overview: "Overview",
  report: "Report",
  planner: "Planner",
  activity: "Activity",
  brief: "Brief",
  progress: (done: number, total: number) => `${done} of ${total} tasks done`,
  tasks: "Tasks",
  mission: "Mission",
  folder: "Folder",
  started: "Started",
  backToMission: "Mission",
  noActivity: "No activity yet.",
  reportPending: "The report appears when the final task finishes.",
  nodeReportPending: "Available when this task finishes.",
  noReport: "The agent finished without writing a report.",
  noFinalReport: "The mission finished without a final report.",
  dependsOn: "Depends on",
  noDependencies: "Starts as soon as an agent slot is free.",
  instructions: "Instructions",
  skippedBecause: (title: string) => `Skipped because "${title}" did not finish.`,
  cancelledNote: "This task was stopped before it finished.",
  waitingFor: (titles: string) => `Starts after ${titles}.`,
  waitingSlot: "Ready. Waiting for a free agent slot.",
  cancelledRun: "The mission was cancelled. Finished tasks keep their changes.",
  failedTitle: "Mission failed",
  taskFailed: "Task failed",
  openFailed: "Open failed task",
  announce: (title: string, status: string) => `${title}: ${status}`,

  moreActions: "More actions",
  runAgain: "Run again",
  copyReport: "Copy report",
  deleteMission: "Delete mission",
  deleteLive: "Cancel the mission before deleting it.",
  themeNight: "Switch to night theme",
  themeChart: "Switch to chart theme",
  toggleSidebar: "Toggle sidebar",
  fitCanvas: "Fit graph to view",
  cancelMission: "Cancel mission",
  search: "Search or run…",
  searchPlaceholder: "Search missions or type a command…",
  paletteActions: "Actions",
  paletteMissions: "Missions",
  paletteEmpty: "No matches.",
  paletteNavigate: "Navigate",
  paletteRun: "Open",
  paletteClose: "Close",

  confirmDeleteTitle: "Delete this mission?",
  confirmDeleteText:
    "This removes the mission, its plan and its logs from this machine. Files the agents created stay in the working folder.",
  keepMission: "Keep mission",
  deleting: "Deleting…",
  reportCopied: "Report copied",
  copyFailed: "Could not copy the report.",
  missionDeleted: "Mission deleted",
};

const id: typeof en = {
  newMission: "Misi baru",
  missions: "Misi",
  missionsEmpty: "Belum ada misi. Misi yang kamu kerahkan muncul di sini.",
  missionsError: "Riwayat misi gagal dimuat.",
  retry: "Coba lagi",
  today: "Hari ini",
  yesterday: "Kemarin",
  earlier: "Sebelumnya",

  composeOverline: "Misi baru",
  composeTitle: "Apa misinya?",
  composeLead: "Jelaskan hasil yang kamu mau. Satgas memetakan rute, membagi kerja ke para agent, lalu menjalankannya.",
  missionLabel: "Brief misi",
  missionPlaceholder: "Bikin landing page dengan form waitlist dan API yang menyimpan pendaftar ke SQLite…",
  examplesLabel: "Mulai dari contoh",
  examples: [
    "Audit keamanan repo ini dan tulis laporannya",
    "Tambahkan unit test untuk modul yang belum dites sampai lolos",
    "Tulis README yang menjelaskan cara kerja proyek ini",
  ],
  folderLabel: "Folder kerja",
  folderHint: "Agent membaca, menulis, dan menjalankan perintah di folder ini.",
  changeFolder: "Ganti folder kerja",
  launch: "Kerahkan",
  launching: "Mengerahkan…",
  missionRequired: "Tulis brief misinya dulu.",

  node: {
    pending: "Menunggu",
    running: "Berjalan",
    done: "Selesai",
    failed: "Gagal",
    skipped: "Dilewati",
    cancelled: "Dibatalkan",
  },
  run: {
    planning: "Merencanakan",
    running: "Berjalan",
    done: "Selesai",
    failed: "Gagal",
    cancelled: "Dibatalkan",
  },
  agent: { claude: "Claude Code", codex: "Codex" },

  plotting: "Komandan memetakan rute",
  cancel: "Batalkan",
  cancelling: "Membatalkan…",
  connected: "Terhubung",
  connecting: "Menghubungkan",
  offline: "Menyambung ulang",
  slots: "Agent",
  loadingMission: "Memuat misi",
  notFoundTitle: "Misi tidak ditemukan",
  notFoundLead: "Mungkin sudah dihapus dari mesin ini.",
  graphLabel: "Graf misi. Tombol panah untuk geser, plus dan minus untuk zoom, 0 untuk menyesuaikan tampilan.",
  zoomIn: "Perbesar",
  zoomOut: "Perkecil",
  fit: "Sesuaikan tampilan",

  overview: "Ringkasan",
  report: "Laporan",
  planner: "Komandan",
  activity: "Aktivitas",
  brief: "Brief",
  progress: (done, total) => `${done} dari ${total} tugas selesai`,
  tasks: "Tugas",
  mission: "Misi",
  folder: "Folder",
  started: "Dimulai",
  backToMission: "Misi",
  noActivity: "Belum ada aktivitas.",
  reportPending: "Laporan muncul setelah tugas terakhir selesai.",
  nodeReportPending: "Tersedia setelah tugas ini selesai.",
  noReport: "Agent selesai tanpa menulis laporan.",
  noFinalReport: "Misi selesai tanpa laporan akhir.",
  dependsOn: "Bergantung pada",
  noDependencies: "Mulai begitu ada slot agent kosong.",
  instructions: "Instruksi",
  skippedBecause: (title) => `Dilewati karena "${title}" tidak selesai.`,
  cancelledNote: "Tugas ini dihentikan sebelum selesai.",
  waitingFor: (titles) => `Mulai setelah ${titles} selesai.`,
  waitingSlot: "Siap. Menunggu slot agent kosong.",
  cancelledRun: "Misi dibatalkan. Tugas yang sudah selesai tetap menyimpan perubahannya.",
  failedTitle: "Misi gagal",
  taskFailed: "Tugas gagal",
  openFailed: "Buka tugas yang gagal",
  announce: (title, status) => `${title}: ${status}`,

  moreActions: "Aksi lainnya",
  runAgain: "Jalankan ulang",
  copyReport: "Salin laporan",
  deleteMission: "Hapus misi",
  deleteLive: "Batalkan misinya dulu sebelum menghapus.",
  themeNight: "Ganti ke tema malam",
  themeChart: "Ganti ke tema terang",
  toggleSidebar: "Tampilkan/sembunyikan sidebar",
  fitCanvas: "Sesuaikan graf ke layar",
  cancelMission: "Batalkan misi",
  search: "Cari atau jalankan…",
  searchPlaceholder: "Cari misi atau ketik perintah…",
  paletteActions: "Aksi",
  paletteMissions: "Misi",
  paletteEmpty: "Tidak ada yang cocok.",
  paletteNavigate: "Pilih",
  paletteRun: "Buka",
  paletteClose: "Tutup",

  confirmDeleteTitle: "Hapus misi ini?",
  confirmDeleteText: "Misi, rencana, dan log-nya akan dihapus dari mesin ini. File yang dibuat para agent tetap ada di folder kerja.",
  keepMission: "Simpan misi",
  deleting: "Menghapus…",
  reportCopied: "Laporan disalin",
  copyFailed: "Laporan gagal disalin.",
  missionDeleted: "Misi dihapus",
};

export const lang = navigator.language.toLowerCase().startsWith("id") ? "id" : "en";
export const t = lang === "id" ? id : en;

document.documentElement.lang = lang;

export const isMac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
export const modKey = isMac ? "⌘" : "Ctrl";

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto", style: "short" });

export function fmtAgo(ts: number, now = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  if (s > -60) return rtf.format(s, "second");
  const m = Math.round(s / 60);
  if (m > -60) return rtf.format(m, "minute");
  const h = Math.round(m / 60);
  if (h > -24) return rtf.format(h, "hour");
  return rtf.format(Math.round(h / 24), "day");
}

const clock = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fmtClock = (ts: number) => clock.format(ts);

const dateTime = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
export const fmtDateTime = (ts: number) => dateTime.format(ts);
