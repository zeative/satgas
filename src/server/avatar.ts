import { createAvatar } from "@dicebear/core";
import * as notionists from "@dicebear/notionists";

// Notionists by Zoish (CC0 1.0) via DiceBear: a drawn face per seed. Drawn on the server so the page stays light.
const cache = new Map<string, string>();
const MAX = 500;

export function avatarSvg(seed: string): string {
  let svg = cache.get(seed);
  if (!svg) {
    svg = createAvatar(notionists, { seed }).toString();
    if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
    cache.set(seed, svg);
  }
  return svg;
}
