import { computed, effect, signal } from "@preact/signals";

type Theme = "chart" | "night";

function readPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : null;
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or disabled storage: the preference just won't persist.
  }
}

// An explicit choice wins; otherwise the theme follows the operating system live.
const media = matchMedia("(prefers-color-scheme: dark)");
const systemNight = signal(media.matches);
media.addEventListener("change", (e) => {
  systemNight.value = e.matches;
});
const chosenTheme = signal<Theme | null>(readPref("satgas.theme", ["chart", "night"] as const));
export const theme = computed<Theme>(() => chosenTheme.value ?? (systemNight.value ? "night" : "chart"));

effect(() => {
  document.documentElement.dataset.theme = theme.value;
});

export function toggleTheme() {
  const next = theme.peek() === "night" ? "chart" : "night";
  chosenTheme.value = next;
  writePref("satgas.theme", next);
}

const narrow = matchMedia("(max-width: 860px)");
// On narrow screens the sidebar is a drawer, closed by default and never persisted.
export const sidebarOpen = signal(narrow.matches ? false : readPref("satgas.sidebar", ["open", "closed"] as const) !== "closed");

export function toggleSidebar(force?: boolean) {
  const next = force ?? !sidebarOpen.peek();
  sidebarOpen.value = next;
  if (!narrow.matches) writePref("satgas.sidebar", next ? "open" : "closed");
}

// Crossing into narrow closes the drawer; widening again restores the saved desktop preference.
narrow.addEventListener("change", (e) => {
  sidebarOpen.value = e.matches ? false : readPref("satgas.sidebar", ["open", "closed"] as const) !== "closed";
});

// Any navigation closes the narrow-screen drawer, so links stay plain links.
window.addEventListener("hashchange", () => {
  if (narrow.matches) sidebarOpen.value = false;
});

export const paletteOpen = signal(false);

// Bumped to ask the canvas to fit the graph to the view (from the palette or a shortcut).
export const fitRequest = signal(0);

export interface Toast {
  id: number;
  text: string;
  tone: "ink" | "hazard";
}

export const toasts = signal<Toast[]>([]);
let toastSeq = 0;

export function toast(text: string, tone: Toast["tone"] = "ink") {
  const id = ++toastSeq;
  toasts.value = [...toasts.peek(), { id, text, tone }];
  setTimeout(() => {
    toasts.value = toasts.peek().filter((x) => x.id !== id);
  }, 3200);
}

export interface ConfirmRequest {
  title: string;
  text: string;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
}

export const confirmRequest = signal<ConfirmRequest | null>(null);
