// A drawn face per seed (Notionists by Zoish, CC0, via DiceBear), drawn by the server and cached by the browser.
export function avatarUri(seed: string): string {
  return `/api/avatar/${encodeURIComponent(seed)}.svg`;
}

// One soft tint per person behind the line drawing; same lightness and chroma, so a team reads as one set.
const HUES = [15, 55, 95, 150, 195, 240, 285, 330];

const hueOf = (seed: string) => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
};

export const avatarTint = (seed: string) => `oklch(0.88 0.05 ${hueOf(seed)})`;

// The same hue with enough colour to mark someone on the board: their pointer and its name tag.
export const avatarInk = (seed: string) => `oklch(0.72 0.13 ${hueOf(seed)})`;
