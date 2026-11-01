// Web stores import i18n (reads the browser language, tags <html>) and sonner (injects its CSS); Bun has no DOM. Import first.
if (!navigator.language) Object.defineProperty(navigator, "language", { value: "en-US" });
const node = { appendChild() {} };
(globalThis as { document?: unknown }).document ??= {
  documentElement: {},
  head: node,
  createElement: () => ({ ...node }),
  createTextNode: () => ({}),
};
