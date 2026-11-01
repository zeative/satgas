import "./fonts";
import "./styles.css";
import { effect, signal } from "@preact/signals";
import { render } from "preact";
import type { NodeStatus } from "../shared/types";
import { StatusBar, Topbar } from "./components/Chrome";
import { CommandPalette } from "./components/CommandPalette";
import { Composer } from "./components/Composer";
import { MissionView } from "./components/MissionView";
import { ConfirmDialog, Toasts } from "./components/Overlays";
import { Sidebar } from "./components/Sidebar";
import { t } from "./i18n";
import { currentId, openRun, run } from "./state";
import { paletteOpen, sidebarOpen, toggleSidebar } from "./ui";

// Screen readers hear one sentence per status change, never the raw log stream.
const announcement = signal("");
let seen = new Map<string, NodeStatus>();
let seenRun: string | undefined;
effect(() => {
  const r = run.value;
  if (!r) return;
  if (r.id !== seenRun) {
    seenRun = r.id;
    seen = new Map(r.nodes.map((n) => [n.id, n.status]));
    return;
  }
  for (const n of r.nodes) {
    if (seen.get(n.id) !== n.status) {
      if (seen.has(n.id)) announcement.value = t.announce(n.title, t.node[n.status]);
      seen.set(n.id, n.status);
    }
  }
});

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    paletteOpen.value = !paletteOpen.peek();
  } else if (mod && e.key === "\\") {
    e.preventDefault();
    toggleSidebar();
  } else if (!mod && !e.altKey && e.key.toLowerCase() === "n" && !isTyping(e.target) && !document.querySelector("dialog[open]")) {
    e.preventDefault();
    openRun(null);
    requestAnimationFrame(() => document.getElementById("mission")?.focus());
  }
});

function App() {
  return (
    <div class={`app${sidebarOpen.value ? "" : " sidebar-closed"}`}>
      <Topbar />
      <Sidebar />
      <main class="main">{currentId.value ? <MissionView id={currentId.value} /> : <Composer />}</main>
      <StatusBar />
      <CommandPalette />
      <ConfirmDialog />
      <Toasts />
      <div class="sr-only" aria-live="polite">
        {announcement.value}
      </div>
    </div>
  );
}

const root = document.getElementById("app");
if (!root) throw new Error("Satgas: #app root element is missing from index.html");
render(<App />, root);
