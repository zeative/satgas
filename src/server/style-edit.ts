import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { extendTailwindMerge } from "tailwind-merge";
import { parseLoc } from "./text-edit";

// Style changes from the design panel, written into the picked element's own Tailwind classes, the way a design tool's
// edits land at once. Only what maps to a class without guessing is written, and only into a className the element
// owns as plain text on its own line; a class built in code (a component's variant, a cn() with several parts) and
// anything else goes to the team with the rest of the request.

type Css = Record<string, string>;

const SIDES: Record<string, string> = { Top: "t", Right: "r", Bottom: "b", Left: "l" };
const CORNERS: Record<string, string> = { TopLeft: "tl", TopRight: "tr", BottomRight: "br", BottomLeft: "bl" };
const WEIGHTS: Record<string, string> = {
  "100": "thin",
  "200": "extralight",
  "300": "light",
  "400": "normal",
  "500": "medium",
  "600": "semibold",
  "700": "bold",
  "800": "extrabold",
  "900": "black",
};
const SHADOWS: Record<string, string> = {
  none: "shadow-none",
  "0 1px 2px rgba(0, 0, 0, 0.08)": "shadow-sm",
  "0 4px 12px rgba(0, 0, 0, 0.1)": "shadow-md",
  "0 12px 32px rgba(0, 0, 0, 0.14)": "shadow-lg",
};
const KEYWORDS: Record<string, Record<string, string>> = {
  textAlign: { left: "text-left", center: "text-center", right: "text-right", justify: "text-justify" },
  display: {
    block: "block",
    flex: "flex",
    grid: "grid",
    inline: "inline",
    "inline-block": "inline-block",
    "inline-flex": "inline-flex",
    none: "hidden",
  },
  flexDirection: { row: "flex-row", column: "flex-col" },
  alignSelf: { "flex-start": "self-start", center: "self-center", "flex-end": "self-end", stretch: "self-stretch" },
  position: { static: "static", relative: "relative", absolute: "absolute", fixed: "fixed", sticky: "sticky" },
  overflow: {
    visible: "overflow-visible",
    hidden: "overflow-hidden",
    clip: "overflow-clip",
    auto: "overflow-auto",
    scroll: "overflow-scroll",
  },
  cursor: {
    auto: "cursor-auto",
    default: "cursor-default",
    pointer: "cursor-pointer",
    text: "cursor-text",
    move: "cursor-move",
    "not-allowed": "cursor-not-allowed",
  },
  borderStyle: { none: "border-none", solid: "border-solid", dashed: "border-dashed", dotted: "border-dotted" },
};

const LENGTH = /^-?[\d.]+(px|rem|em|%|vw|vh)$|^(clamp|min|max|calc)\(.+\)$/;
const COLOR = /^#[0-9a-f]{3,8}$/i;
// An arbitrary value as Tailwind writes it: no spaces, so clamp(40px, 6vw, 80px) becomes clamp(40px,6vw,80px).
const arb = (v: string) => `[${v.trim().replace(/,\s+/g, ",").replace(/\s+/g, "_")}]`;
const len = (prefix: string, v: string) =>
  v === "auto" ? `${prefix}-auto` : v === "0px" || v === "0" ? `${prefix}-0` : LENGTH.test(v) ? `${prefix}-${arb(v)}` : null;

function one(key: string, v: string): string | null {
  const word = KEYWORDS[key]?.[v];
  if (word) return word;
  if (KEYWORDS[key]) return null;
  for (const [side, s] of Object.entries(SIDES)) {
    if (key === `padding${side}`) return len(`p${s}`, v);
    if (key === `margin${side}`) return len(`m${s}`, v);
  }
  for (const [corner, c] of Object.entries(CORNERS)) if (key === `border${corner}Radius`) return len(`rounded-${c}`, v);
  switch (key) {
    case "padding":
      return len("p", v);
    case "margin":
      return len("m", v);
    case "gap":
      return len("gap", v);
    case "width":
    case "height": {
      const p = key === "width" ? "w" : "h";
      return v === "fit-content" ? `${p}-fit` : v === "100%" ? `${p}-full` : len(p, v);
    }
    case "maxWidth":
      return v === "none" ? "max-w-none" : len("max-w", v);
    case "flexGrow":
      return v === "0" ? "grow-0" : v === "1" ? "grow" : /^\d+$/.test(v) ? `grow-${v}` : null;
    case "flexBasis":
      return v === "0px" || v === "0" ? "basis-0" : len("basis", v);
    case "fontSize":
      return LENGTH.test(v) ? `text-${arb(v)}` : null;
    case "fontWeight":
      return WEIGHTS[v] ? `font-${WEIGHTS[v]}` : null;
    case "lineHeight":
      return v === "normal" ? "leading-normal" : /^[\d.]+$/.test(v) || LENGTH.test(v) ? `leading-${arb(v)}` : null;
    case "letterSpacing":
      return LENGTH.test(v) ? `tracking-${arb(v)}` : v === "normal" ? "tracking-normal" : null;
    case "color":
      return COLOR.test(v) ? `text-${arb(v)}` : null;
    case "backgroundColor":
      return COLOR.test(v) ? `bg-${arb(v)}` : null;
    case "borderColor":
      return COLOR.test(v) ? `border-${arb(v)}` : null;
    case "borderWidth":
      return v === "0px" ? "border-0" : /^[\d.]+px$/.test(v) ? `border-${arb(v)}` : null;
    case "borderRadius":
      return v === "0px" ? "rounded-none" : len("rounded", v);
    case "opacity": {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1) return null;
      return Number.isInteger(n * 100) ? `opacity-${Math.round(n * 100)}` : `opacity-${arb(String(n))}`;
    }
    case "boxShadow":
      return SHADOWS[v] ?? null;
    case "filter":
      return v === "none" ? "blur-none" : /^blur\([\d.]+px\)$/.test(v) ? `blur-${arb(v.slice(5, -1))}` : null;
    case "backdropFilter":
      return v === "none" ? "backdrop-blur-none" : /^blur\([\d.]+px\)$/.test(v) ? `backdrop-blur-${arb(v.slice(5, -1))}` : null;
    case "zIndex":
      return v === "auto" ? "z-auto" : /^-?\d+$/.test(v) ? `z-${arb(v)}` : null;
    default:
      return null;
  }
}

// Which changes become classes, and which are left for the team.
export function classesFor(css: Css): { classes: string[]; written: string[]; rest: Css } {
  const classes: string[] = [];
  const written: string[] = [];
  const rest: Css = {};
  for (const [k, v] of Object.entries(css)) {
    const cls = one(k, String(v).trim());
    if (cls) {
      classes.push(cls);
      written.push(k);
    } else rest[k] = v;
  }
  return { classes, written, rest };
}

// The app's own design tokens (@theme in its stylesheets), so a new class replaces a token class of the same kind:
// rounded-[12px] takes the place of rounded-control, text-[20px] of text-display.
const THEME_KEYS: Record<string, string> = {
  color: "color",
  text: "text",
  radius: "radius",
  font: "font",
  shadow: "shadow",
  tracking: "tracking",
  leading: "leading",
  spacing: "spacing",
  "font-weight": "font-weight",
  blur: "blur",
};

async function cssFiles(dir: string, out: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 5 || out.length > 200) return out;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
    if (e.isDirectory()) await cssFiles(join(dir, e.name), out, depth + 1);
    else if (e.name.endsWith(".css")) out.push(join(dir, e.name));
  }
  return out;
}

export async function themeOf(dir: string): Promise<Record<string, string[]>> {
  const theme: Record<string, string[]> = {};
  for (const f of await cssFiles(dir)) {
    const text = await readFile(f, "utf8").catch(() => "");
    for (const block of text.matchAll(/@theme[^{]*\{([\s\S]*?)\}/g)) {
      for (const m of (block[1] ?? "").matchAll(/--([a-z]+(?:-weight)?)-([a-z0-9-]+)\s*:/g)) {
        const key = THEME_KEYS[m[1] ?? ""];
        if (!key || !m[2]) continue;
        const names = theme[key] ?? [];
        names.push(m[2]);
        theme[key] = names;
      }
    }
  }
  return theme;
}

export type StyleWrite = { ok: true; file: string; written: string[]; rest: Css } | { ok: false; reason: string; rest: Css };

const ATTR = /className=(?:"([^"\n]*)"|'([^'\n]*)'|\{\s*"([^"\n]*)"\s*\}|\{\s*cn\(\s*"([^"\n]*)"\s*\)\s*\})/;

export async function writeClasses(dir: string, loc: string, tag: string, css: Css): Promise<StyleWrite> {
  const { classes, written, rest } = classesFor(css);
  if (!classes.length) return { ok: false, reason: "nothing maps to a class", rest: css };
  const at = parseLoc(loc);
  if (!at || !/^[a-z][a-z0-9-]*$/.test(tag)) return { ok: false, reason: "no source line", rest: css };
  const file = resolve(dir, at.file);
  if (!file.startsWith(dir + sep) || /(^|[\\/])node_modules[\\/]/.test(file) || !/\.(jsx|tsx)$/.test(file))
    return { ok: false, reason: "not the app's own JSX", rest: css };
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return { ok: false, reason: "file not found", rest: css };
  const lines = text.split("\n");
  const i = at.line - 1;
  const line = lines[i];
  // The element's opening tag starts on its line; only one tag of that name there, so the edit lands on the right one.
  if (line === undefined || line.split(`<${tag}`).length !== 2) return { ok: false, reason: "tag not alone on its line", rest: css };
  const from = line.indexOf(`<${tag}`);
  // The opening tag may run over a few lines; it ends at the first ">" that is not inside braces or quotes.
  let end = i;
  let depth = 0;
  let quote = "";
  let found = false;
  for (let l = i; l < Math.min(lines.length, i + 12) && !found; l++) {
    const s = lines[l] ?? "";
    for (let c = l === i ? from : 0; c < s.length; c++) {
      const ch = s[c];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        end = l;
        found = true;
        break;
      }
    }
  }
  if (!found) return { ok: false, reason: "opening tag not found", rest: css };
  const opening = lines.slice(i, end + 1).join("\n");
  const head = opening.slice(from);
  const tw = extendTailwindMerge({ extend: { theme: await themeOf(dir) } });
  let next: string;
  const attrs = head.match(/className=/g)?.length ?? 0;
  if (attrs > 1) return { ok: false, reason: "several class names", rest: css };
  if (attrs === 1) {
    const m = ATTR.exec(head);
    if (!m) return { ok: false, reason: "class built in code", rest: css };
    const old = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    const merged = tw(old, classes.join(" "));
    next = opening.slice(0, from) + head.replace(m[0], m[0].replace(old, merged));
  } else {
    next = `${opening.slice(0, from)}<${tag} className="${classes.join(" ")}"${head.slice(tag.length + 1)}`;
  }
  const updated = [...lines.slice(0, i), ...next.split("\n"), ...lines.slice(end + 1)].join("\n");
  const tmp = `${file}.satgas-${crypto.randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, updated);
  await rename(tmp, file);
  return { ok: true, file: relative(dir, file), written, rest };
}
