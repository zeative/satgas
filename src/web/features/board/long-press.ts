const HOLD_MS = 500;
const SLOP_PX = 10;

// iOS never fires a context menu, so a held finger asks for one; the board's own handler then treats it as a right click.
export function watchLongPress(el: EventTarget, hold = HOLD_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = undefined;
  };
  const onStart = (e: Event) => {
    cancel();
    const { touches, target } = e as TouchEvent;
    const touch = touches[0];
    if (touches.length !== 1 || !touch || !target) return;
    start = { x: touch.clientX, y: touch.clientY };
    const { clientX, clientY } = touch;
    timer = setTimeout(() => {
      cancel();
      target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY }));
    }, hold);
  };
  const onMove = (e: Event) => {
    const touch = (e as TouchEvent).touches[0];
    if (!start || !touch) return;
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > SLOP_PX) cancel();
  };
  // Capturing, because React Flow's pan and drag stop these events on their way back up.
  el.addEventListener("touchstart", onStart, { capture: true, passive: true });
  el.addEventListener("touchmove", onMove, { capture: true, passive: true });
  el.addEventListener("touchend", cancel, true);
  el.addEventListener("touchcancel", cancel, true);
  // Android opens its own menu first, and one menu is enough.
  el.addEventListener("contextmenu", cancel, true);
  return () => {
    cancel();
    el.removeEventListener("touchstart", onStart, true);
    el.removeEventListener("touchmove", onMove, true);
    el.removeEventListener("touchend", cancel, true);
    el.removeEventListener("touchcancel", cancel, true);
    el.removeEventListener("contextmenu", cancel, true);
  };
}
