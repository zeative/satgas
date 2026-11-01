import type { Align } from "./edit";

// Board shortcuts beyond tools and undo, read from the physical key so they hold on any keyboard layout.
export type Shortcut =
  | "duplicate"
  | "selectAll"
  | "front"
  | "forward"
  | "backward"
  | "back"
  | "lock"
  | "group"
  | "ungroup"
  | "grid"
  | "snap"
  | "copyStyle"
  | "pasteStyle"
  | "copyPng"
  | "flipH"
  | "flipV"
  | "fit"
  | "zoomSelection"
  | "zoom100"
  | "distributeH"
  | "distributeV"
  | `align:${Align}`;

type Keys = Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

// Alignment follows Figma: Option or Alt with A D W S for edges, H V for centers.
const ALIGN: Record<string, Align> = { KeyA: "left", KeyH: "center", KeyD: "right", KeyW: "top", KeyV: "middle", KeyS: "bottom" };
const PLAIN: Record<string, Shortcut> = { KeyH: "flipH", KeyV: "flipV", Digit1: "fit", Digit2: "zoomSelection", Digit0: "zoom100" };

export function shortcutOf(e: Keys, mac: boolean): Shortcut | null {
  const mod = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  const { code, altKey: alt, shiftKey: shift } = e;
  if (other) return null;
  if (mod) {
    if (code === "BracketRight") return alt ? "front" : "forward";
    if (code === "BracketLeft") return alt ? "back" : "backward";
    if (alt) return shift ? null : code === "KeyC" ? "copyStyle" : code === "KeyV" ? "pasteStyle" : null;
    if (shift) return code === "KeyL" ? "lock" : code === "KeyG" ? "ungroup" : code === "Quote" ? "snap" : null;
    return code === "KeyD" ? "duplicate" : code === "KeyA" ? "selectAll" : code === "KeyG" ? "group" : code === "Quote" ? "grid" : null;
  }
  if (alt && shift) return code === "KeyC" ? "copyPng" : code === "KeyH" ? "distributeH" : code === "KeyV" ? "distributeV" : null;
  if (alt) return ALIGN[code] ? `align:${ALIGN[code]}` : null;
  return shift ? (PLAIN[code] ?? null) : null;
}
