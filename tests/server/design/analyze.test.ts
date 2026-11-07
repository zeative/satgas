import { expect, test } from "bun:test";
import { analyze, describeReport, describeTokens, tokensOf } from "../../../src/server/design/analyze";
import type { Measured } from "../../../src/server/design/probe";

const page = (over: Partial<Measured> = {}): Measured => ({
  url: "file:///page.html",
  width: 1280,
  layoutWidth: 1280,
  height: 800,
  docWidth: 1280,
  docHeight: 2400,
  families: { Inter: 900, Fraunces: 100 },
  sizes: { "14": 200, "16": 700, "20": 50, "32": 40, "48": 10 },
  weights: { "400": 900, "600": 100 },
  textColors: { "#18181b": 800, "#52525b": 200 },
  backgrounds: { "#ffffff": 900000, "#f4f4f5": 100000 },
  spacing: { "8": 20, "16": 40, "24": 30, "48": 10 },
  radii: { "8": 10, "12": 4 },
  headings: [{ tag: "h1", size: 48, weight: 600, family: "Fraunces", text: "Kopi dari Sukoharjo" }],
  measures: [64, 70, 72],
  columns: [640, 660, 680],
  contrast: { checked: 40, unchecked: 2, fails: [], failCount: 0 },
  overflow: [],
  clipped: [],
  clippedCount: 0,
  images: { total: 4, broken: [], blurry: [], oversized: [], unsized: 0 },
  bytes: { total: 900_000, scripts: 40_000, images: 700_000, fonts: 120_000 },
  smallTargets: [],
  smallTargetCount: 0,
  hiddenText: 0,
  gradients: 0,
  emoji: 0,
  trackedCaps: 0,
  transitionAll: 0,
  ...over,
});
const phone = (over: Partial<Measured> = {}) => page({ width: 390, layoutWidth: 390, height: 844, docWidth: 390, ...over });

test("a clean page has no findings", () => {
  const r = analyze(page(), phone());
  expect(r.findings).toEqual([]);
  expect(r.counts).toEqual({ high: 0, medium: 0, low: 0 });
});

test("a page wider than a phone is the first thing to fix, with where it spills", () => {
  const r = analyze(page(), phone({ layoutWidth: 792, docWidth: 792, overflow: [{ sel: "div.wide", text: "Wide", by: 402 }] }));
  expect(r.findings[0]).toMatchObject({ severity: "high", id: "overflow", where: "phone" });
  expect(r.findings[0]?.message).toContain("792px wide");
  expect(r.findings[0]?.examples).toEqual(["div.wide (+402px)"]);
});

test("findings come worst first, and one seen at both widths is reported once with no repeated examples", () => {
  const fail = { sel: "p.faint", text: "Too light", ratio: 1.92, need: 4.5, fg: "#bbbbbb", bg: "#ffffff" };
  const contrast = { checked: 10, unchecked: 0, fails: [fail], failCount: 1 };
  const r = analyze(
    page({ contrast, gradients: 9, emoji: 3, images: { total: 1, broken: ["a.png"], blurry: [], oversized: [], unsized: 0 } }),
    phone({ contrast, smallTargetCount: 1, smallTargets: [{ sel: "a.x", text: "X", w: 14, h: 14 }] }),
    { violations: [{ id: "image-alt", impact: "critical", help: "Images must have alternate text", nodeCount: 2 }] },
    ["ReferenceError: x is not defined"],
  );
  expect(r.findings.map((f) => f.severity)).toEqual(["high", "high", "high", "medium", "medium", "low"]);
  const c = r.findings.find((f) => f.id === "contrast");
  expect(c).toMatchObject({ where: "both" });
  expect(c?.examples).toHaveLength(1);
  expect(r.findings.map((f) => f.id)).toContain("a11y:image-alt");
  // Gradients are a choice, not a tell; emoji in text is.
  expect(r.findings.find((f) => f.id === "tells")?.examples).toEqual(["3 emoji in text"]);
});

test("axe's own contrast rule is left out, since contrast is measured with blended backgrounds", () => {
  const r = analyze(page(), phone(), {
    violations: [
      { id: "color-contrast", impact: "serious", help: "x" },
      { id: "region", impact: "moderate", help: "y" },
    ],
  });
  expect(r.findings).toEqual([]);
});

test("the tokens read a design the way a designer would: type share, scale step, grid fit, text column", () => {
  const t = tokensOf(page());
  expect(t.families[0]).toEqual({ family: "Inter", share: 90 });
  expect(t.scale.map((s) => s.size)).toEqual([14, 16, 20, 32, 48]);
  expect(t.ratio).toBe(1.5);
  expect(t.onGrid).toBe(100);
  expect(t.column).toBe(660);
  expect(t.measure).toBe(70);
  expect(describeTokens(t)).toContain("Inter 90%");
});

test("loose spacing, long lines and too many families or sizes are low findings", () => {
  const r = analyze(
    page({
      families: { A: 1, B: 1, C: 1, D: 1 },
      spacing: { "7": 50, "13": 30, "16": 20 },
      measures: [120, 130, 140],
      sizes: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(10 + i * 2), 100])),
    }),
    phone(),
  );
  expect(r.findings.map((f) => f.id).sort()).toEqual(["families", "measure", "scale", "spacing-grid"]);
  expect(r.findings.every((f) => f.severity === "low")).toBe(true);
  expect(describeReport(r)).toContain("0 high, 0 medium, 4 low");
});

test("page weight is measured, not guessed: oversized pictures and a heavy page are medium, a page with no byte counts has none", () => {
  const heavy = analyze(
    page({
      bytes: { total: 5 * 1048576, scripts: 900 * 1024, images: 4 * 1048576, fonts: 100 * 1024 },
      images: { total: 2, broken: [], blurry: [], oversized: ["hero.jpg 4000px in 600px"], unsized: 2 },
    }),
    phone(),
  );
  expect(heavy.findings.map((f) => f.id)).toEqual(["oversized-image", "heavy-page", "unsized-image"]);
  expect(heavy.findings.find((f) => f.id === "heavy-page")?.message).toContain("5 MB");
  // file:// pages report no bytes; that is unknown, never zero, so no weight finding is made from it.
  expect(analyze(page({ bytes: null }), phone()).findings).toEqual([]);
});
