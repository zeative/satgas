// What the rendered page itself gives away, read from the DOM after it draws: text people cannot read, a type scale
// with no hierarchy, copy that reads as generated, pictures that failed, a page wider than the screen. Checked by
// Satgas on every page, because a rule only written in a skill is a rule an agent can skip.

export interface TextFact {
  text: string;
  size: number;
  weight: number;
  color: string;
  bg: string | null;
  heading: boolean;
  // Drawn over a photo, video or background image, where its contrast cannot be read from colours alone.
  overImage: boolean;
}

export interface PageFacts {
  texts: TextFact[];
  overflow: number;
  broken: string[];
  // Pictures shown more than once on the page at a size people look at.
  repeated?: string[];
  // Buttons and links on screen that a fixed bar sits on top of, so they cannot be tapped.
  covered?: string[];
}

// Runs in the page; returns PageFacts as JSON.
export const COLLECT = `(() => {
  const rgba = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = rgba(cs.backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return cs.backgroundColor;
    }
    return "rgb(255, 255, 255)";
  };
  const texts = [];
  const seen = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (texts.length >= 400) break;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\\s+/g, " ").trim();
    if (!own || seen.has(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || cs.visibility === "hidden" || Number(cs.opacity) < 0.2) continue;
    seen.add(el);
    let overImage = false;
    const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 20);
    if (cy >= 0 && cy <= innerHeight) {
      const stack = document.elementsFromPoint(cx, cy);
      const i = stack.indexOf(el);
      overImage = stack.slice(i + 1).some((s) => /^(IMG|VIDEO|CANVAS|PICTURE)$/.test(s.tagName) || getComputedStyle(s).backgroundImage !== "none");
    }
    const bg = bgOf(el);
    texts.push({
      text: own.slice(0, 80),
      size: parseFloat(cs.fontSize),
      weight: Number(cs.fontWeight) || 400,
      color: cs.color,
      bg,
      heading: /^H[1-3]$/.test(el.tagName) || el.getAttribute("role") === "heading",
      overImage: overImage || bg === null,
    });
  }
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map((i) => i.getAttribute("src").slice(0, 80));
  const counts = {};
  for (const i of document.images) {
    const r = i.getBoundingClientRect();
    const src = (i.currentSrc || i.src || "").split("?")[0];
    if (src && r.width >= 120 && r.height >= 120) counts[src] = (counts[src] || 0) + 1;
  }
  const repeated = Object.keys(counts).filter((k) => counts[k] > 1).map((k) => k.replace(location.origin, "").slice(0, 80));
  const fixedUp = (e) => {
    for (; e && e !== document.body; e = e.parentElement) if (/fixed|sticky/.test(getComputedStyle(e).position)) return e;
    return null;
  };
  const covered = [];
  for (const el of document.querySelectorAll("a, button, [role=button], input, select, textarea")) {
    if (covered.length >= 6 || fixedUp(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom <= 0 || r.top >= innerHeight) continue;
    const top = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 1, r.top + r.height / 2));
    const bar = top && !el.contains(top) && fixedUp(top);
    if (bar) covered.push((el.innerText || el.getAttribute("aria-label") || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 40));
  }
  return JSON.stringify({ texts, overflow: document.documentElement.scrollWidth - innerWidth, broken: broken.slice(0, 6), repeated: repeated.slice(0, 6), covered });
})()`;

const channels = (css: string): number[] | null => {
  const m = css.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
};
const luminance = ([r, g, b]: number[]) => {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
};
export function contrast(fg: string, bg: string): number | null {
  const a = channels(fg);
  const b = channels(bg);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const GREETING = /^(selamat (pagi|siang|sore|malam)|welcome back|good (morning|afternoon|evening)|halo|hai|hello|hi)\b/i;
const quote = (t: string) => `"${t.length > 48 ? `${t.slice(0, 47)}…` : t}"`;

export function auditFindings(facts: PageFacts, width: number): string[] {
  const out: string[] = [];
  const low = facts.texts.filter((t) => {
    if (t.overImage || !t.bg) return false;
    const ratio = contrast(t.color, t.bg);
    const large = t.size >= 24 || (t.size >= 18.6 && t.weight >= 700);
    return ratio !== null && ratio < (large ? 3 : 4.5);
  });
  if (low.length)
    out.push(
      `${low.length} texts too faint to read (WCAG contrast under 4.5:1, or 3:1 for large text): ${low
        .slice(0, 4)
        .map((t) => `${quote(t.text)} ${(contrast(t.color, t.bg ?? "") ?? 0).toFixed(1)}:1`)
        .join(", ")}`,
    );
  const tiny = facts.texts.filter((t) => t.size < 12);
  if (tiny.length)
    out.push(
      `${tiny.length} texts under 12px: ${tiny
        .slice(0, 4)
        .map((t) => `${quote(t.text)} ${t.size}px`)
        .join(", ")}`,
    );
  const shout = facts.texts.filter((t) => /!(\s|$)/.test(t.text));
  if (shout.length)
    out.push(
      `Exclamation marks in interface text, which read as generated: ${shout
        .slice(0, 4)
        .map((t) => quote(t.text))
        .join(", ")}`,
    );
  const greet = facts.texts.filter((t) => (t.heading || t.size >= 18) && GREETING.test(t.text));
  if (greet.length)
    out.push(
      `A greeting as a headline; name the place or the period instead: ${greet
        .slice(0, 2)
        .map((t) => quote(t.text))
        .join(", ")}`,
    );
  // Hierarchy: the biggest text should stand well above the body text most of the page is set in.
  const sizes = facts.texts.map((t) => t.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] ?? 0;
  const top = sizes.at(-1) ?? 0;
  if (sizes.length >= 8 && body > 0 && top / body < 1.6)
    out.push(`Flat type hierarchy: the largest text is ${top}px against ${body}px body text; give the lead a real step up`);
  // A screen's big figure at zero is the empty state shown as the main view, where the target shows the screen in use.
  const zero = facts.texts.filter(
    (t) => (t.size >= 28 && /^(rp\s?|\$\s?)?0+([.,:]0+)*(\s?%)?$/i.test(t.text.trim())) || /^(rp|\$)\s?0+([.,]0+)?$/i.test(t.text.trim()),
  );
  if (zero.length)
    out.push(
      `The main figure shows zero (${zero
        .slice(0, 2)
        .map((t) => quote(t.text))
        .join(", ")}): show the screen in use, with real values, as the target does`,
    );
  if (facts.overflow > 4) out.push(`The page is ${facts.overflow}px wider than the ${width}px screen, so it scrolls sideways`);
  if (facts.broken.length) out.push(`Pictures that failed to load: ${facts.broken.join(", ")}`);
  if (facts.covered?.length)
    out.push(
      `A fixed bar covers buttons people need to tap (${facts.covered.map(quote).join(", ")}); leave room under the content for the bar, as tall as the bar and its gap`,
    );
  if (facts.repeated?.length)
    out.push(`The same picture shown more than once, which reads as filler; give each its own: ${facts.repeated.join(", ")}`);
  return out;
}
