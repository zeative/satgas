// Turns what a page measured at desktop and phone width into ranked findings and the design's measured tokens.
import type { Measured } from "./probe";

export type Severity = "high" | "medium" | "low";

export interface Finding {
  severity: Severity;
  id: string;
  where: "desktop" | "phone" | "both";
  message: string;
  examples: string[];
}

export interface Tokens {
  // Families by share of the text set in them, largest first.
  families: { family: string; share: number }[];
  // Sizes that carry at least 1% of the text, smallest first, with the step to the next one.
  scale: { size: number; share: number }[];
  ratio: number | null;
  weights: number[];
  textColors: string[];
  backgrounds: string[];
  // The spacing values used most, smallest first, and how many sit on a 4px grid.
  spacing: number[];
  onGrid: number;
  radii: number[];
  // Median width of the body paragraphs (px) and their characters per line.
  column: number | null;
  measure: number | null;
}

export interface Axe {
  violations: { id: string; impact?: string | null; help: string; nodeCount?: number }[];
}

export interface Report {
  url: string;
  findings: Finding[];
  tokens: Tokens;
  counts: Record<Severity, number>;
}

const top = (m: Record<string, number>, n: number) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? null;
};
const unique = (xs: string[]) => [...new Set(xs)];
const share = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0);

export function tokensOf(m: Measured): Tokens {
  const chars = total(m.sizes);
  const scale = Object.entries(m.sizes)
    .filter(([, n]) => n / Math.max(chars, 1) >= 0.01)
    .map(([s, n]) => ({ size: Number(s), share: share(n, chars) }))
    .sort((a, b) => a.size - b.size);
  // The type scale's step: the median ratio between neighbouring sizes, the way a designer would read it off a page.
  const steps = scale.slice(1).map((s, i) => s.size / (scale[i]?.size ?? s.size));
  const ratio = median(steps);
  const spacing = top(m.spacing, 10)
    .map(([v]) => Number(v))
    .sort((a, b) => a - b);
  const used = total(m.spacing);
  const grid = Object.entries(m.spacing).reduce((n, [v, c]) => (Number(v) % 4 === 0 ? n + c : n), 0);
  return {
    families: top(m.families, 4).map(([family, n]) => ({ family, share: share(n, total(m.families)) })),
    scale,
    ratio: ratio ? Math.round(ratio * 100) / 100 : null,
    weights: top(m.weights, 4)
      .map(([w]) => Number(w))
      .sort((a, b) => a - b),
    textColors: top(m.textColors, 5).map(([c]) => c),
    backgrounds: top(m.backgrounds, 5).map(([c]) => c),
    spacing,
    onGrid: used ? Math.round((grid / used) * 100) : 100,
    radii: top(m.radii, 4)
      .map(([r]) => Number(r))
      .sort((a, b) => a - b),
    column: median(m.columns),
    measure: median(m.measures),
  };
}

// Findings, worst first. `where` says which width showed it; one found at both widths is reported once.
export function analyze(desktop: Measured, phone: Measured, axe?: Axe | null, errors: string[] = []): Report {
  const out: Finding[] = [];
  const push = (f: Finding) => out.push(f);
  const both = (pick: (m: Measured) => number) => {
    const d = pick(desktop) > 0;
    const p = pick(phone) > 0;
    return d && p ? "both" : d ? "desktop" : "phone";
  };

  for (const [m, where] of [
    [desktop, "desktop"],
    [phone, "phone"],
  ] as const) {
    const wider = m.docWidth > m.width + 1;
    if (wider || m.overflow.length)
      push({
        severity: "high",
        id: "overflow",
        where,
        message: `Content runs past the right edge at ${m.width}px${wider ? `: the page is ${m.docWidth}px wide, so a phone scrolls it sideways or zooms it out` : ""}.`,
        examples: m.overflow.map((o) => `${o.sel} (+${o.by}px)`),
      });
  }
  const contrast = Math.max(desktop.contrast.failCount, phone.contrast.failCount);
  if (contrast)
    push({
      severity: "high",
      id: "contrast",
      where: both((m) => m.contrast.failCount),
      message: `${contrast} text block${contrast > 1 ? "s" : ""} below WCAG AA contrast.`,
      examples: unique(
        [...desktop.contrast.fails, ...phone.contrast.fails].map(
          (f) => `${f.sel} "${f.text}" ${f.ratio}:1, needs ${f.need}:1 (${f.fg} on ${f.bg})`,
        ),
      ).slice(0, 6),
    });
  const broken = [...new Set([...desktop.images.broken, ...phone.images.broken])];
  if (broken.length)
    push({ severity: "high", id: "broken-image", where: "both", message: `${broken.length} image(s) did not load.`, examples: broken });
  if (errors.length)
    push({
      severity: "high",
      id: "page-error",
      where: "both",
      message: `${errors.length} script error(s) on the page.`,
      examples: errors.slice(0, 4),
    });

  const clipped = Math.max(desktop.clippedCount, phone.clippedCount);
  if (clipped)
    push({
      severity: "medium",
      id: "clipped-text",
      where: both((m) => m.clippedCount),
      message: `${clipped} text block${clipped > 1 ? "s are" : " is"} cut off by its box.`,
      examples: unique([...phone.clipped, ...desktop.clipped].map((c) => `${c.sel} "${c.text}"`)).slice(0, 5),
    });
  if (phone.smallTargetCount)
    push({
      severity: "medium",
      id: "small-target",
      where: "phone",
      message: `${phone.smallTargetCount} control${phone.smallTargetCount > 1 ? "s are" : " is"} under 24px and crowded by a neighbour, too small to tap on a phone (WCAG 2.5.8).`,
      examples: phone.smallTargets.map((t) => `${t.sel} "${t.text}" ${t.w}x${t.h}`),
    });
  const blurry = [...new Set([...desktop.images.blurry, ...phone.images.blurry])];
  if (blurry.length)
    push({
      severity: "medium",
      id: "blurry-image",
      where: "both",
      message: `${blurry.length} image(s) shown larger than their pixels.`,
      examples: blurry,
    });
  const oversized = unique([...desktop.images.oversized, ...phone.images.oversized]);
  if (oversized.length)
    push({
      severity: "medium",
      id: "oversized-image",
      where: "both",
      message: `${oversized.length} image(s) are far larger than where they show; resize them.`,
      examples: oversized,
    });
  const mb = (n: number) => `${Math.round((n / 1048576) * 10) / 10} MB`;
  const b = desktop.bytes;
  // A page past these takes seconds on a phone connection. A lower bound: cached and cross-origin files may hide their size.
  if (b && (b.total > 3 * 1048576 || b.scripts > 600 * 1024))
    push({
      severity: "medium",
      id: "heavy-page",
      where: "desktop",
      message: `The page fetches at least ${mb(b.total)} (scripts ${mb(b.scripts)}, images ${mb(b.images)}, fonts ${mb(b.fonts)}).`,
      examples: [],
    });
  for (const v of axe?.violations ?? []) {
    // Contrast is measured above with blended backgrounds; axe would report the same blocks twice.
    if (v.id === "color-contrast") continue;
    if (v.impact !== "critical" && v.impact !== "serious") continue;
    push({
      severity: "medium",
      id: `a11y:${v.id}`,
      where: "desktop",
      message: `${v.help} (${v.nodeCount ?? 1} element(s)).`,
      examples: [],
    });
  }
  if (desktop.hiddenText > 200)
    push({
      severity: "medium",
      id: "hidden-text",
      where: "desktop",
      message: `${desktop.hiddenText} characters stay invisible until a script reveals them; with scripts off or before a scroll, they are missing.`,
      examples: [],
    });

  if (desktop.images.unsized)
    push({
      severity: "low",
      id: "unsized-image",
      where: "desktop",
      message: `${desktop.images.unsized} image(s) have no width and height, so the text jumps when they load.`,
      examples: [],
    });
  const t = tokensOf(desktop);
  if (Object.keys(desktop.families).length > 3)
    push({
      severity: "low",
      id: "families",
      where: "desktop",
      message: `${Object.keys(desktop.families).length} font families; a page reads as one voice with two.`,
      examples: Object.keys(desktop.families),
    });
  if (t.scale.length > 10)
    push({
      severity: "low",
      id: "scale",
      where: "desktop",
      message: `${t.scale.length} text sizes carry the page; a clear scale has about five or six.`,
      examples: t.scale.map((s) => `${s.size}px`),
    });
  if (t.onGrid < 70)
    push({
      severity: "low",
      id: "spacing-grid",
      where: "desktop",
      message: `Only ${t.onGrid}% of spacing sits on a 4px grid, so the rhythm looks uneven.`,
      examples: t.spacing.map(String),
    });
  if (t.measure && t.measure > 90)
    push({
      severity: "low",
      id: "measure",
      where: "desktop",
      message: `Body lines run about ${t.measure} characters; 60 to 80 reads best.`,
      examples: [],
    });
  const tells = [
    desktop.emoji && `${desktop.emoji} emoji in text`,
    desktop.trackedCaps && `${desktop.trackedCaps} tracked capital labels`,
    desktop.transitionAll && `${desktop.transitionAll} elements with transition: all`,
  ].filter(Boolean) as string[];
  if (tells.length) push({ severity: "low", id: "tells", where: "desktop", message: "Generated-looking tells.", examples: tells });

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of out) counts[f.severity]++;
  return { url: desktop.url, findings: out, tokens: t, counts };
}

// The tokens as a few lines an agent can put into a design brief.
export function describeTokens(t: Tokens): string {
  const lines = [
    `Type: ${t.families.map((f) => `${f.family} ${f.share}%`).join(", ") || "none measured"}`,
    `Scale: ${t.scale.map((s) => `${s.size}px`).join(" / ") || "none"}${t.ratio ? ` (step about ${t.ratio})` : ""}; weights ${t.weights.join(", ")}`,
    `Text colours: ${t.textColors.join(", ")}; backgrounds: ${t.backgrounds.join(", ")}`,
    `Spacing: ${t.spacing.join(", ")}px (${t.onGrid}% on a 4px grid); radii ${t.radii.join(", ") || "none"}px`,
  ];
  if (t.column) lines.push(`Text column: about ${t.column}px wide, ${t.measure ?? "?"} characters per line`);
  return lines.join("\n");
}

// The report as text: what to fix first, then the measured tokens.
export function describeReport(r: Report): string {
  const head = `${r.url}: ${r.counts.high} high, ${r.counts.medium} medium, ${r.counts.low} low`;
  const body = r.findings.map(
    (f) =>
      `- [${f.severity}] ${f.id} (${f.where}): ${f.message}${f.examples.length ? `\n    ${f.examples.slice(0, 5).join("\n    ")}` : ""}`,
  );
  return [head, ...body, "", describeTokens(r.tokens)].join("\n");
}
