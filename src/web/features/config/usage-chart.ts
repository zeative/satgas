// A smooth line that never overshoots its points, so a quiet day next to a busy one still reads as quiet, not below zero.
export function smoothLine(points: [number, number][]): string {
  if (!points.length) return "";
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i] as [number, number];
    const [x1, y1] = points[i + 1] as [number, number];
    slopes.push((y1 - y0) / (x1 - x0));
  }
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0] ?? 0;
    if (i === n - 1) return slopes[n - 2] ?? 0;
    const a = slopes[i - 1] as number;
    const b = slopes[i] as number;
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  let d = `M${points[0]?.[0]},${points[0]?.[1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i] as [number, number];
    const [x1, y1] = points[i + 1] as [number, number];
    const h = (x1 - x0) / 3;
    d += `C${x0 + h},${y0 + (tangents[i] as number) * h},${x1 - h},${y1 - (tangents[i + 1] as number) * h},${x1},${y1}`;
  }
  return d;
}

// A round number just above the tallest point, so the gridlines land on figures people can read.
export function niceTop(max: number) {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 3, 4, 6, 8, 10].map((m) => m * step).find((n) => n >= max) ?? max;
}
