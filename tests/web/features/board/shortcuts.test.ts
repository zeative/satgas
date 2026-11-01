import { describe, expect, test } from "bun:test";
import { shortcutOf } from "../../../../src/web/features/board/shortcuts";

const key = (code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcutOf", () => {
  test("uses Command on a Mac and Ctrl elsewhere", () => {
    expect(shortcutOf(key("KeyD", { metaKey: true }), true)).toBe("duplicate");
    expect(shortcutOf(key("KeyD", { ctrlKey: true }), false)).toBe("duplicate");
    expect(shortcutOf(key("KeyD", { ctrlKey: true }), true)).toBeNull();
  });

  test("arranges with brackets, Option or Alt going all the way", () => {
    expect(shortcutOf(key("BracketRight", { metaKey: true }), true)).toBe("forward");
    expect(shortcutOf(key("BracketRight", { metaKey: true, altKey: true }), true)).toBe("front");
    expect(shortcutOf(key("BracketLeft", { metaKey: true }), true)).toBe("backward");
    expect(shortcutOf(key("BracketLeft", { metaKey: true, altKey: true }), true)).toBe("back");
  });

  test("reads modifier combinations for lock, styles, image and snap", () => {
    expect(shortcutOf(key("KeyL", { metaKey: true, shiftKey: true }), true)).toBe("lock");
    expect(shortcutOf(key("KeyC", { metaKey: true, altKey: true }), true)).toBe("copyStyle");
    expect(shortcutOf(key("KeyV", { metaKey: true, altKey: true }), true)).toBe("pasteStyle");
    expect(shortcutOf(key("KeyC", { altKey: true, shiftKey: true }), true)).toBe("copyPng");
    expect(shortcutOf(key("Quote", { metaKey: true, shiftKey: true }), true)).toBe("snap");
    expect(shortcutOf(key("KeyG", { metaKey: true }), true)).toBe("group");
    expect(shortcutOf(key("KeyG", { metaKey: true, shiftKey: true }), true)).toBe("ungroup");
  });

  test("aligns with Option or Alt letters and distributes with Shift added", () => {
    expect(shortcutOf(key("KeyA", { altKey: true }), true)).toBe("align:left");
    expect(shortcutOf(key("KeyS", { altKey: true }), true)).toBe("align:bottom");
    expect(shortcutOf(key("KeyV", { altKey: true }), true)).toBe("align:middle");
    expect(shortcutOf(key("KeyH", { altKey: true, shiftKey: true }), true)).toBe("distributeH");
    expect(shortcutOf(key("KeyA", { altKey: true }), false)).toBe("align:left");
  });

  test("leaves plain letters to the tools and copy or paste to the browser", () => {
    expect(shortcutOf(key("KeyH"), true)).toBeNull();
    expect(shortcutOf(key("KeyH", { shiftKey: true }), true)).toBe("flipH");
    expect(shortcutOf(key("Digit1", { shiftKey: true }), true)).toBe("fit");
    expect(shortcutOf(key("KeyC", { metaKey: true }), true)).toBeNull();
    expect(shortcutOf(key("KeyV", { metaKey: true }), true)).toBeNull();
  });
});
