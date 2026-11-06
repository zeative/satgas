import { type RefObject, useLayoutEffect, useRef } from "react";

const EASE = "cubic-bezier(0.2, 0, 0, 1)";

// Cards that changed place slide there from where they were (FLIP), so a task visibly moves to its next column
// instead of vanishing and reappearing. Positions are kept relative to the container, so scrolling never animates.
export function useFlip(container: RefObject<HTMLElement | null>) {
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const origin = root.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    for (const el of root.querySelectorAll<HTMLElement>("[data-flip]")) {
      const id = el.dataset.flip;
      if (!id) continue;
      const r = el.getBoundingClientRect();
      const at = { x: r.left - origin.left, y: r.top - origin.top };
      next.set(id, at);
      const was = last.current.get(id);
      if (reduce || !was) continue;
      const dx = was.x - at.x;
      const dy = was.y - at.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: EASE });
    }
    last.current = next;
  });
}
