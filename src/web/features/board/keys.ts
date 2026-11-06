import { useSyncExternalStore } from "react";
import { isMac } from "@/i18n";

// The modifier keys held right now, read by gestures that change meaning while they run (Shift while resizing,
// ⌘ while dragging). One window listener for the whole board instead of one per card.
let shift = false;
let mod = false;
const subs = new Set<() => void>();
const notify = () => {
  for (const f of subs) f();
};
const read = (e: KeyboardEvent | PointerEvent) => {
  const s = e.shiftKey;
  const m = isMac ? e.metaKey : e.ctrlKey;
  if (s === shift && m === mod) return;
  shift = s;
  mod = m;
  notify();
};
if (typeof window !== "undefined") {
  window.addEventListener("keydown", read, true);
  window.addEventListener("keyup", read, true);
  window.addEventListener("pointermove", read, { capture: true, passive: true });
  window.addEventListener("blur", () => {
    shift = false;
    mod = false;
    notify();
  });
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const useShiftKey = () =>
  useSyncExternalStore(
    subscribe,
    () => shift,
    () => false,
  );
export const modHeld = () => mod;
