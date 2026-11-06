export const FOCUS_BOARD = "satgas:focus-board";
// A closing panel takes focus with it; once it is gone the board takes it, unless something else already has it.
export const focusBoard = () =>
  requestAnimationFrame(() => {
    const el = document.activeElement;
    if (!el || el === document.body) window.dispatchEvent(new Event(FOCUS_BOARD));
  });

// Where the canvas should land when it next mounts: Chat Only has no canvas to tell, and the first time it has not even
// loaded yet, so no fixed delay is ever right. The canvas takes this once it has measured the card.
let landing: string | null = null;
export const landOnCard = (id: string) => {
  landing = id;
};
export const pendingLanding = () => landing;
export const clearLanding = () => {
  landing = null;
};
