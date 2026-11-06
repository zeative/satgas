// Only the canvas zooms. Browsers offer no single switch for this: Chrome's trackpad pinch and Ctrl+wheel are wheel events,
// Safari's pinch is a gesture event and ignores the viewport tag, and iOS needs the two-finger move stopped as well.
const ZOOM_KEYS = new Set(["+", "=", "-", "_", "0"]);
const onCanvas = (target: EventTarget | null) => !!(target as Element | null)?.closest?.(".react-flow");

export function lockPageZoom(win: Pick<Window, "addEventListener">) {
  // The canvas reads the same wheel event for its own zoom, which this does not stop.
  win.addEventListener(
    "wheel",
    (e) => {
      if ((e as WheelEvent).ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) win.addEventListener(type, (e) => e.preventDefault());
  win.addEventListener(
    "touchmove",
    (e) => {
      if ((e as TouchEvent).touches.length > 1 && !onCanvas(e.target)) e.preventDefault();
    },
    { passive: false },
  );
  win.addEventListener("keydown", (e) => {
    const key = e as KeyboardEvent;
    if ((key.ctrlKey || key.metaKey) && ZOOM_KEYS.has(key.key)) e.preventDefault();
  });
}
