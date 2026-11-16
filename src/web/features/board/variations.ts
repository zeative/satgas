import type { Device } from "../../../shared/board";

// Three takes on one page, each its own route beside the original, the way a design tool explores variations.
export const VARIATIONS = ["layout", "style", "bolder"] as const;
export type Variation = (typeof VARIATIONS)[number];
const HOW: Record<Variation, string> = {
  layout: "Keep its content and its look; give each a different layout, order and hierarchy.",
  style: "Keep its layout and content; give each a different visual style (type, colour, surfaces, imagery) that still fits the brand.",
  bolder: "Keep its content; make each a more daring take on the whole page, further from the original than you would dare by yourself.",
};
export function variationsPrompt(app: string, title: string, route: string, device: Device, kind: Variation): string {
  const stem = route === "/" ? "/home" : route.replace(/\/+$/, "");
  const routes = ["a", "b", "c"].map((x) => `\`${stem}-${x}\``).join(", ");
  return [
    `Explore three variations of the "${title}" page (\`${route}\`) of the \`${app}\` app. ${HOW[kind]}`,
    `Build them as new routes, ${routes}, and leave the original page as it is. List each in .satgas/screens.json right after the original, named "${title} · A", "· B" and "· C"${device === "desktop" ? "" : ` with "device": "${device}"`}, so they sit beside it on the board.`,
    "Then say in one line each how they differ and which one you would pick. I will choose one; the others can go.",
  ].join("\n\n");
}
