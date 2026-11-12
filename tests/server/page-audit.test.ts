import { expect, test } from "bun:test";
import { auditFindings, COLLECT, contrast, type TextFact } from "../../src/server/page-audit";

const t = (text: string, over: Partial<TextFact> = {}): TextFact => ({
  text,
  size: 16,
  weight: 400,
  color: "rgb(20, 22, 26)",
  bg: "rgb(255, 255, 255)",
  heading: false,
  overImage: false,
  ...over,
});

test("contrast follows WCAG", () => {
  expect(contrast("rgb(0, 0, 0)", "rgb(255, 255, 255)")).toBeCloseTo(21, 0);
  expect(contrast("rgb(255, 255, 255)", "rgb(255, 255, 255)")).toBeCloseTo(1, 5);
  expect(contrast("nonsense", "rgb(0, 0, 0)")).toBeNull();
});

test("a clean page has no findings", () => {
  const texts = [t("Anggaran", { size: 34, heading: true }), ...Array.from({ length: 8 }, (_, i) => t(`Baris ${i}`))];
  expect(auditFindings({ texts, overflow: 0, broken: [] }, 390)).toEqual([]);
});

// The tells agents left in the Kantong build, and the faults a picture alone hides.
test("finds faint and tiny text, shouting and greeting copy, a flat scale, overflow and broken pictures", () => {
  const texts = [
    t("Selamat siang!", { size: 20, heading: true }),
    t("Saldo GoPay", { color: "rgb(200, 200, 200)" }),
    t("Di atas foto", { color: "rgb(250, 250, 250)", overImage: true }),
    t("Catatan kecil", { size: 10 }),
    ...Array.from({ length: 8 }, (_, i) => t(`Baris ${i}`)),
  ];
  const found = auditFindings({ texts, overflow: 38, broken: ["/images/hero.jpg"], repeated: ["/images/sculpt.jpg"] }, 390).join("\n");
  expect(found).toContain('"Saldo GoPay"');
  expect(found).not.toContain("Di atas foto");
  expect(found).toContain("under 12px");
  expect(found).toContain("Exclamation marks");
  expect(found).toContain("greeting as a headline");
  expect(found).toContain("Flat type hierarchy");
  expect(found).toContain("38px wider");
  expect(found).toContain("/images/hero.jpg");
  expect(found).toContain("give each its own: /images/sculpt.jpg");
});

test("a big figure at zero is the empty state shown as the main view", () => {
  const texts = [t("Rp 0", { size: 40 }), t("00:00", { size: 56 }), t("0 transaksi"), t("Rp 85.000", { size: 40 }), t("Rp0", { size: 15 })];
  const found = auditFindings({ texts, overflow: 0, broken: [] }, 390).join("\n");
  expect(found).toContain('The main figure shows zero ("Rp 0", "00:00")');
  expect(found).not.toContain("85.000");
  // A total of nothing is the empty state even when it is small, like a checkout footer before anything is picked.
  expect(auditFindings({ texts: [t("Rp0", { size: 15 })], overflow: 0, broken: [] }, 390).join("\n")).toContain("shows zero");
});

test("buttons under a fixed bar are named so the page leaves room for it", () => {
  const found = auditFindings({ texts: [], overflow: 0, broken: [], covered: ["Hubungi kedai"] }, 390).join("\n");
  expect(found).toContain('A fixed bar covers buttons people need to tap ("Hubungi kedai")');
});

test("the in-page collector is valid JavaScript", () => {
  expect(() => new Function(`return ${COLLECT}`)).not.toThrow();
});
