// What a page measures as rendered, read from the browser's computed styles. `probe` runs inside the page: it is sent as
// its own source text, so everything it uses lives inside it, and it sums up in the page to keep the result small.

export interface Example {
  sel: string;
  text?: string;
}

export interface Measured {
  url: string;
  // The width asked for, and the one the page laid out at: wider means it does not fit and a phone zooms it out.
  width: number;
  layoutWidth: number;
  height: number;
  docWidth: number;
  docHeight: number;
  // Characters of text set in each family, size (px) and weight: what the reader actually sees most.
  families: Record<string, number>;
  sizes: Record<string, number>;
  weights: Record<string, number>;
  textColors: Record<string, number>;
  // Painted area (px²) of each background colour.
  backgrounds: Record<string, number>;
  spacing: Record<string, number>;
  radii: Record<string, number>;
  headings: { tag: string; size: number; weight: number; family: string; text: string }[];
  // Characters per line of the body paragraphs, measured with the paragraph's own font.
  measures: number[];
  // Width of the paragraphs (px), so the text column of a reference can be read.
  columns: number[];
  contrast: {
    checked: number;
    unchecked: number;
    fails: (Example & { ratio: number; need: number; fg: string; bg: string })[];
    failCount: number;
  };
  overflow: (Example & { by: number })[];
  clipped: Example[];
  clippedCount: number;
  // Pictures shown far smaller than their pixels (wasted bytes), and ones with no size set before they load.
  images: { total: number; broken: string[]; blurry: string[]; oversized: string[]; unsized: number };
  // Bytes the page fetched, by kind, from Resource Timing; null where the browser cannot tell (file:// pages).
  bytes: { total: number; scripts: number; images: number; fonts: number } | null;
  smallTargets: (Example & { w: number; h: number })[];
  smallTargetCount: number;
  // Counted tells: text hidden until scripts reveal it, gradients, emoji, tracked capitals, `transition: all`.
  hiddenText: number;
  gradients: number;
  emoji: number;
  trackedCaps: number;
  transitionAll: number;
}

export function probe(expected?: number): Measured {
  const W = expected || window.innerWidth;
  const H = window.innerHeight;
  const de = document.documentElement;
  const add = (m: Record<string, number>, k: string, n = 1) => {
    m[k] = (m[k] ?? 0) + n;
  };
  const sel = (el: Element) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return `${s}#${el.id}`;
    const cls = [...el.classList].slice(0, 2);
    if (cls.length) s += `.${cls.join(".")}`;
    const parent = el.parentElement;
    return parent && parent !== document.body ? `${parent.tagName.toLowerCase()} > ${s}` : s;
  };
  const snippet = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const parse = (c: string): [number, number, number, number] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m?.[1]) return null;
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
  };
  const hex = (c: [number, number, number, number]) =>
    `#${c
      .slice(0, 3)
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")}`;
  const over = (top: [number, number, number, number], under: [number, number, number, number]): [number, number, number, number] => {
    const a = top[3];
    return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
  };
  const lum = (c: [number, number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  // The colour behind an element: its own and its ancestors' backgrounds, blended down to the first opaque one. A
  // picture or gradient on the way makes the colour unknowable from styles.
  const behind = (el: Element): [number, number, number, number] | null => {
    const layers: [number, number, number, number][] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none") return null;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let base: [number, number, number, number] = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i] as [number, number, number, number], base);
    return base;
  };
  const visible = (el: Element, r: DOMRect, cs: CSSStyleDeclaration) =>
    r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[aria-hidden=true], [inert]");
  // Whether an ancestor below the page itself cuts the element off inside the screen; root clipping is the page's own.
  const clippedBy = (el: Element): "box" | "root" | null => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (!/hidden|clip|auto|scroll/.test(cs.overflowX)) continue;
      if (e === document.body || e === de) return "root";
      if (e.getBoundingClientRect().right <= W + 1) return "box";
    }
    return null;
  };

  const out: Measured = {
    url: location.href,
    width: W,
    layoutWidth: window.innerWidth,
    height: H,
    docWidth: Math.max(de.scrollWidth, document.body?.scrollWidth ?? 0, window.innerWidth),
    docHeight: Math.max(de.scrollHeight, document.body?.scrollHeight ?? 0),
    families: {},
    sizes: {},
    weights: {},
    textColors: {},
    backgrounds: {},
    spacing: {},
    radii: {},
    headings: [],
    measures: [],
    columns: [],
    contrast: { checked: 0, unchecked: 0, fails: [], failCount: 0 },
    overflow: [],
    clipped: [],
    clippedCount: 0,
    images: { total: 0, broken: [], blurry: [], oversized: [], unsized: 0 },
    bytes: null,
    smallTargets: [],
    smallTargetCount: 0,
    hiddenText: 0,
    gradients: 0,
    emoji: 0,
    trackedCaps: 0,
    transitionAll: 0,
  };
  const canvas = document.createElement("canvas").getContext("2d");
  const all = [...document.body.querySelectorAll("*")];
  const overflowing: { el: Element; by: number }[] = [];
  // Pictures, video and painted backgrounds: text laid over one has no single colour behind it to check against.
  const pictures: { el: Element; r: DOMRect }[] = [];
  for (const e of all) {
    if (pictures.length >= 400) break;
    const ps = getComputedStyle(e);
    if (!/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|svg)$/.test(e.tagName) && ps.backgroundImage === "none") continue;
    const pr = e.getBoundingClientRect();
    if (pr.width >= 24 && pr.height >= 24 && ps.visibility !== "hidden" && ps.display !== "none") pictures.push({ el: e, r: pr });
  }
  const onPicture = (el: Element, r: DOMRect) =>
    pictures.some((p) => {
      if (p.el === el || el.contains(p.el)) return false;
      const w = Math.min(r.right, p.r.right) - Math.max(r.left, p.r.left);
      const h = Math.min(r.bottom, p.r.bottom) - Math.max(r.top, p.r.top);
      return w > 0 && h > 0 && w * h > r.width * r.height * 0.3;
    });
  const targets: { el: Element; r: DOMRect }[] = [];

  for (const el of all) {
    if (el.closest("svg, script, style, noscript, template")) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!visible(el, r, cs)) continue;
    const absTop = r.top + window.scrollY;

    for (const k of ["marginTop", "marginBottom", "paddingTop", "paddingBottom", "paddingLeft", "rowGap", "columnGap"] as const) {
      const v = Number.parseFloat(cs[k]);
      if (v > 0 && v < 400) add(out.spacing, String(Math.round(v)));
    }
    const radius = Number.parseFloat(cs.borderTopLeftRadius);
    if (radius > 0) add(out.radii, String(Math.round(radius)));
    if (cs.backgroundImage.includes("gradient")) out.gradients++;
    const bg = parse(cs.backgroundColor);
    if (bg && bg[3] > 0.05) add(out.backgrounds, hex(bg), Math.round((r.width * r.height) / 100) * 100);
    if (cs.transitionProperty.split(",").some((p) => p.trim() === "all") && Number.parseFloat(cs.transitionDuration) > 0)
      out.transitionAll++;

    // Past the edge counts when nothing inside the page cuts it off; cut by the page itself, it counts only for text.
    if (r.right > W + 1 && r.left < W && cs.position !== "fixed") {
      const cut = clippedBy(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!cut || (cut === "root" && hasText)) overflowing.push({ el, by: Math.round(r.right - W) });
    }

    if (el.tagName === "IMG") {
      const img = el as HTMLImageElement;
      out.images.total++;
      const src = (img.currentSrc || img.src).split("/").pop()?.slice(0, 60) ?? "";
      const lazyAndFar = img.loading === "lazy" && absTop > window.scrollY + H * 2;
      if (img.complete && img.naturalWidth === 0 && !lazyAndFar) out.images.broken.push(src);
      else if (img.naturalWidth > 0 && r.width > img.naturalWidth * 1.5) out.images.blurry.push(src);
      else if (img.naturalWidth > 1200 && img.naturalWidth > r.width * 2.5)
        out.images.oversized.push(`${src} ${img.naturalWidth}px in ${Math.round(r.width)}px`);
      if (!img.getAttribute("width") && !img.getAttribute("height") && cs.aspectRatio === "auto") out.images.unsized++;
    }

    const interactive = el.matches("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], summary");
    // A link inside running text is sized by the sentence it sits in, which WCAG leaves out of target size.
    const inline =
      cs.display === "inline" && [...(el.parentElement?.childNodes ?? [])].some((n) => n.nodeType === 3 && n.textContent?.trim());
    if (interactive && !inline) targets.push({ el, r });

    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!own) continue;
    const chars = own.length;
    if (Number.parseFloat(cs.opacity) === 0) {
      out.hiddenText += chars;
      continue;
    }
    const family = (cs.fontFamily.split(",")[0] ?? "").replace(/["']/g, "").trim();
    const size = Math.round(Number.parseFloat(cs.fontSize));
    const weight = Number.parseInt(cs.fontWeight, 10) || 400;
    add(out.families, family, chars);
    add(out.sizes, String(size), chars);
    add(out.weights, String(weight), chars);
    out.emoji += (own.match(/\p{Emoji_Presentation}/gu) ?? []).length;
    if (cs.textTransform === "uppercase" && Number.parseFloat(cs.letterSpacing) > size * 0.04) out.trackedCaps++;
    if (/^H[1-6]$/.test(el.tagName) && out.headings.length < 12)
      out.headings.push({ tag: el.tagName.toLowerCase(), size, weight, family, text: own.slice(0, 60) });

    const fg = parse(cs.color);
    if (fg) add(out.textColors, hex(fg), chars);
    // Text painted by a gradient or picture (background-clip: text) has no single colour to check.
    const painted = cs.backgroundClip === "text" || /rgba\([^)]*,\s*0\)|transparent/.test(cs.webkitTextFillColor);
    const back = painted || onPicture(el, r) ? null : behind(el);
    if (!fg || !back) out.contrast.unchecked++;
    else {
      const shown = over(fg, back);
      const [a, b] = [lum(shown), lum(back)].sort((x, y) => y - x) as [number, number];
      const ratio = (a + 0.05) / (b + 0.05);
      const large = size >= 24 || (size >= 18.5 && weight >= 700);
      const need = large ? 3 : 4.5;
      out.contrast.checked++;
      if (ratio < need) {
        out.contrast.failCount++;
        if (out.contrast.fails.length < 10)
          out.contrast.fails.push({
            sel: sel(el),
            text: own.slice(0, 60),
            ratio: Math.round(ratio * 100) / 100,
            need,
            fg: hex(shown),
            bg: hex(back),
          });
      }
    }

    const intended = cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none";
    const cut = /hidden|clip/.test(cs.overflowX) || /hidden|clip/.test(cs.overflowY);
    if (cut && !intended && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) {
      out.clippedCount++;
      if (out.clipped.length < 8) out.clipped.push({ sel: sel(el), text: own.slice(0, 60) });
    }

    if (canvas && chars > 120 && /^(P|LI|DD|BLOCKQUOTE)$/.test(el.tagName)) {
      canvas.font = `${cs.fontStyle} ${weight} ${cs.fontSize} ${cs.fontFamily}`;
      const sample = own.slice(0, 400);
      const per = canvas.measureText(sample).width / sample.length;
      const inner = r.width - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight);
      if (per > 0) out.measures.push(Math.round(inner / per));
      out.columns.push(Math.round(r.width));
    }
  }

  // WCAG 2.2 AA (2.5.8): a target under 24px passes when a 24px circle on its centre touches no other target.
  // Apple and Google ask for 44 and 48, which the review rubric covers.
  for (const t of targets) {
    if (t.r.width >= 24 && t.r.height >= 24) continue;
    const cx = t.r.left + t.r.width / 2;
    const cy = t.r.top + t.r.height / 2;
    const crowded = targets.some((o) => {
      if (o.el === t.el || o.el.contains(t.el) || t.el.contains(o.el)) return false;
      const dx = Math.max(o.r.left - cx, 0, cx - o.r.right);
      const dy = Math.max(o.r.top - cy, 0, cy - o.r.bottom);
      return Math.hypot(dx, dy) < 12;
    });
    if (!crowded) continue;
    out.smallTargetCount++;
    if (out.smallTargets.length < 8)
      out.smallTargets.push({ sel: sel(t.el), text: snippet(t.el), w: Math.round(t.r.width), h: Math.round(t.r.height) });
  }

  const entries = [
    ...performance.getEntriesByType("navigation"),
    ...performance.getEntriesByType("resource"),
  ] as PerformanceResourceTiming[];
  const size = (e: PerformanceResourceTiming) => e.transferSize || e.encodedBodySize || 0;
  if (entries.some((e) => size(e) > 0)) {
    const kind = (e: PerformanceResourceTiming, re: RegExp, types: string[]) => types.includes(e.initiatorType) || re.test(e.name);
    const sum = (f: (e: PerformanceResourceTiming) => boolean) => entries.filter(f).reduce((n, e) => n + size(e), 0);
    out.bytes = {
      total: sum(() => true),
      scripts: sum((e) => kind(e, /\.m?js(\?|$)/, ["script"])),
      images: sum((e) => kind(e, /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i, ["img", "image"])),
      fonts: sum((e) => /\.(woff2?|ttf|otf)(\?|$)/i.test(e.name)),
    };
  }

  // Only the outermost of a stack of overflowing boxes, so one wide section is one finding.
  overflowing.sort((a, b) => b.by - a.by);
  for (const o of overflowing) {
    if (out.overflow.length >= 8) break;
    if (overflowing.some((p) => p.el !== o.el && p.el.contains(o.el) && p.by >= o.by)) continue;
    out.overflow.push({ sel: sel(o.el), text: snippet(o.el), by: o.by });
  }
  return out;
}

// The source text sent to the page: the function, called with the width the page is meant to fit.
export const probeScript = (width: number) => `(${probe.toString()})(${Math.round(width)})`;
