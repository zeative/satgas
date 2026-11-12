import { expect, test } from "bun:test";
import bridge from "../../src/server/app-bridge.js.txt" with { type: "text" };

// The bridge in a bare framed window: enough of the DOM for it to start, and a parent that sends it messages.
function framed() {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const parent = { postMessage() {} };
  let frames = 0;
  const appended: unknown[] = [];
  const el = () => ({ setAttribute() {}, remove() {}, appendChild() {}, style: {}, attachShadow: () => ({}) });
  const doc = {
    head: { appendChild: (n: unknown) => appended.push(n) },
    body: null,
    documentElement: { style: {}, scrollHeight: 0, appendChild() {} },
    createElement: el,
    addEventListener() {},
    querySelectorAll: () => [],
    styleSheets: [],
  };
  const win: Record<string, unknown> = {
    parent,
    requestAnimationFrame: () => ++frames,
    cancelAnimationFrame() {},
    addEventListener: (t: string, f: (e: unknown) => void) => {
      listeners[t] ??= [];
      listeners[t].push(f);
    },
    location: { pathname: "/", search: "", hash: "" },
  };
  const g = globalThis as Record<string, unknown>;
  g.MutationObserver ??= class {
    observe() {}
  };
  g.ResizeObserver ??= class {
    observe() {}
  };
  new Function("window", "document", "history", "addEventListener", "location", "innerHeight", "scrollY", "getComputedStyle", bridge)(
    win,
    doc,
    { pushState() {}, replaceState() {} },
    win.addEventListener,
    win.location,
    800,
    0,
    () => ({}),
  );
  const send = (m: Record<string, unknown>) => {
    for (const f of listeners.message ?? []) f({ source: parent, data: { satgas: true, ...m } });
  };
  const raf = win.requestAnimationFrame as (cb: () => void) => number;
  return { send, raf, frames: () => frames, appended };
}

// A board of live pages must not animate against the canvas while it pans: the page holds its frames and its CSS
// animations, and lets them go the moment the person looks at it again.
test("a page holds its animation frames while the canvas moves and releases them when live", () => {
  const page = framed();
  page.raf(() => {});
  expect(page.frames()).toBe(1);
  page.send({ type: "run", mode: "still" });
  page.raf(() => {});
  expect(page.frames()).toBe(1);
  expect(page.appended).toHaveLength(1);
  page.send({ type: "run", mode: "live" });
  expect(page.frames()).toBe(2);
});
