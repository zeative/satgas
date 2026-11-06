import type { Options } from "roughjs/bin/core";
import { RoughGenerator } from "roughjs/bin/generator";
import type { Card } from "../../../shared/board";

const generator = new RoughGenerator();
// Every stroke of a sketchy card is computed once per look, and seeded by its id, so it never jitters between renders.
const cache = new Map<string, string[]>();
const CACHE_MAX = 2000;

const seedOf = (id: string) => {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 2147483647;
  return h || 1;
};

// The hand-drawn outline of a shape or line, as SVG path data; its fill stays the crisp shape underneath.
export function roughPaths(
  card: Pick<Card, "id" | "shape" | "line" | "points" | "rough" | "stroke" | "dash">,
  w: number,
  h: number,
): string[] {
  const sw = card.stroke ?? (card.line ? 2 : 1.5);
  const key = [card.id, card.shape, card.line, w, h, sw, card.rough, card.dash, card.points?.join()].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  // A second pass of the pen looks right on a solid stroke; on a dashed one it fills the gaps back in.
  const options: Options = {
    seed: seedOf(card.id),
    roughness: card.rough ?? 1,
    strokeWidth: sw,
    disableMultiStroke: !!card.dash && card.dash !== "solid",
  };
  const inset = sw / 2 + 1;
  const pts = card.points ?? [];
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) pairs.push([pts[i] ?? 0, pts[i + 1] ?? 0]);
  const drawable = card.line
    ? generator.linearPath(pairs, options)
    : card.shape === "ellipse"
      ? generator.ellipse(w / 2, h / 2, w - inset * 2, h - inset * 2, options)
      : card.shape === "diamond"
        ? generator.polygon(
            [
              [w / 2, inset],
              [w - inset, h / 2],
              [w / 2, h - inset],
              [inset, h / 2],
            ],
            options,
          )
        : card.shape === "triangle"
          ? generator.polygon(
              [
                [w / 2, inset],
                [w - inset, h - inset],
                [inset, h - inset],
              ],
              options,
            )
          : generator.rectangle(inset, inset, w - inset * 2, h - inset * 2, options);
  const paths = generator.toPaths(drawable).map((p) => p.d);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, paths);
  return paths;
}
