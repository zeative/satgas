import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  Ban,
  ChevronDown,
  ChevronRight,
  Columns3,
  Copy,
  Crosshair,
  FileText,
  Grid2x2,
  Hash,
  Heading,
  Image,
  Link2,
  List,
  Minus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pilcrow,
  Plus,
  RectangleHorizontal,
  Rows3,
  ScanLine,
  Search,
  Shapes,
  TextCursorInput,
  Type,
  Video,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  closeInspect,
  type DesignTab,
  editAttr,
  editStyle,
  editText,
  editToken,
  type Layer,
  type PickedEl,
  resetEdits,
  type Sizing,
  selectLayer,
  setDesignTab,
  setPicking,
  type Token,
  useInspect,
} from "@/stores/inspect";
import { sendPrompt } from "@/stores/runs";

const ti = t.board.inspect;

const FONTS = [
  "Inter",
  "Geist",
  "Manrope",
  "DM Sans",
  "Plus Jakarta Sans",
  "Outfit",
  "Sora",
  "Space Grotesk",
  "IBM Plex Sans",
  "Work Sans",
  "Fraunces",
  "Playfair Display",
  "Instrument Serif",
  "Newsreader",
  "JetBrains Mono",
  "IBM Plex Mono",
];
const SHADOWS = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.08)",
  md: "0 4px 12px rgba(0, 0, 0, 0.1)",
  lg: "0 12px 32px rgba(0, 0, 0, 0.14)",
} as const;
const KIND_ICON: Record<string, typeof Hash> = {
  page: FileText,
  group: Hash,
  row: Columns3,
  column: Rows3,
  grid: Grid2x2,
  heading: Heading,
  paragraph: Pilcrow,
  text: Type,
  image: Image,
  svg: Shapes,
  video: Video,
  button: RectangleHorizontal,
  link: Link2,
  input: TextCursorInput,
  list: List,
  item: Minus,
  form: TextCursorInput,
  header: PanelTop,
  footer: PanelBottom,
  nav: PanelTop,
  section: Hash,
};

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const family = (v: string | undefined) => (v ?? "").split(",")[0]?.replace(/["']/g, "").trim() ?? "";
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pxNum = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? "");
  return Number.isFinite(n) ? n : null;
};
// A computed px shows as a plain number; anything the stylesheet wrote (clamp(), %, em) shows as written.
const shown = (v: string | undefined) => {
  if (!v) return "";
  const m = /^(-?[\d.]+)px$/.exec(v);
  return m ? String(round(Number(m[1]))) : v;
};
const withUnit = (raw: string, unit = "px") => (/^-?[\d.]+$/.test(raw.trim()) ? `${raw.trim()}${unit}` : raw.trim());

// Computed colours arrive as rgb() or rgba(); the panel shows and takes hex.
function hex(v: string | undefined): string | null {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(v ?? "");
  if (!m) return /^#[0-9a-f]{3,8}$/i.test(v ?? "") ? (v ?? null) : null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return `#${[m[1], m[2], m[3]].map((c) => Math.round(Number(c)).toString(16).padStart(2, "0")).join("")}`;
}
const shadowOf = (v: string | undefined) =>
  !v || v === "none" ? "none" : (Object.entries(SHADOWS).find(([, css]) => css === v)?.[0] ?? "custom");
const blurOf = (v: string | undefined) => {
  const m = /blur\(([\d.]+)px\)/.exec(v ?? "");
  return m ? Number(m[1]) : null;
};

function cssOf(selector: string, edits: Record<string, string>, tokens: Record<string, string>) {
  const out: string[] = [];
  const e = Object.entries(edits);
  if (e.length) out.push(`${selector} {\n${e.map(([k, v]) => `  ${kebab(k)}: ${v};`).join("\n")}\n}`);
  const tk = Object.entries(tokens);
  if (tk.length) out.push(`:root {\n${tk.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`);
  return out.join("\n\n");
}

// What the team gets: the element as the page reported it, and each change from what it was to what it should be.
function editPrompt(
  app: string,
  el: PickedEl | null,
  edits: Record<string, string>,
  text: string | null,
  attrs: Record<string, string>,
  tokens: Record<string, string>,
  ask: string,
): string {
  const lines = el ? Object.entries(edits).map(([k, v]) => `- ${kebab(k)}: ${el.styles[k] ?? "unset"} → ${v}`) : [];
  if (el && text !== null) lines.push(`- text: "${el.text}" → "${text}"`);
  for (const [k, v] of Object.entries(attrs)) lines.push(`- ${k} attribute → "${v}"`);
  const tk = Object.entries(tokens).map(([k, v]) => `- ${k} → ${v}`);
  return [
    `Design edit from the design panel on the \`${app}\` app${el ? `, page \`${el.path}\`` : ""}.`,
    "",
    el
      ? `Element: \`<${el.tag}>\`${el.text ? ` with the text "${el.text.slice(0, 80)}"` : ""}, selector \`${el.selector}\`${el.loc ? `, source \`${el.loc}\`` : ""}.`
      : "",
    el?.classes ? `Its classes: \`${el.classes}\`.` : "",
    el ? ["```html", el.html, "```"].join("\n") : "",
    lines.length ? `Change:\n${lines.join("\n")}` : "",
    tk.length ? `Change these design tokens for the whole app (where they are defined, not per element):\n${tk.join("\n")}` : "",
    ask ? `Also: ${ask}` : "",
    "",
    "Write it into the source so it holds after a reload, in the project's own styling (its Tailwind classes or design tokens, not inline styles). Change only what is asked, or the shared component when it is one, and keep everything else as it is. Check the page in the browser afterwards.",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

// The design panel: a frame's picked element with its layers and properties, its code, and the page's tokens. Every
// change previews on the page at once; Apply hands them to the team, who write them into the source.
export default function DesignPanel({ className }: { className?: string }) {
  const target = useInspect((s) => s.target);
  const tab = useInspect((s) => s.tab);
  const edits = useInspect((s) => s.edits);
  const text = useInspect((s) => s.text);
  const attrs = useInspect((s) => s.attrs);
  const tokenEdits = useInspect((s) => s.tokenEdits);
  const [ask, setAsk] = useState("");
  const [sending, setSending] = useState(false);
  if (!target) return null;
  const el = target.el;
  const count = Object.keys(edits).length + (text !== null ? 1 : 0) + Object.keys(attrs).length + Object.keys(tokenEdits).length;

  const apply = () => {
    setSending(true);
    sendPrompt(target.runId, editPrompt(target.app, el, edits, text, attrs, tokenEdits, ask.trim()), [], [target.cardId])
      .then(() => {
        toast.success(ti.sent);
        setAsk("");
        setPicking(null);
        closeInspect(true);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setSending(false));
  };
  const close = () => {
    setPicking(null);
    closeInspect();
  };

  return (
    <section aria-label={ti.label} className={cn("flex flex-col overflow-hidden rounded-xl border bg-card text-xs shadow-sm", className)}>
      <header className="flex h-11 shrink-0 items-center gap-1 border-b ps-2 pe-1.5">
        <div role="tablist" aria-label={ti.label} className="flex min-w-0 flex-1 items-center gap-0.5">
          {(["properties", "code", "tweaks"] as DesignTab[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setDesignTab(k)}
              className={cn(
                "h-7 rounded-md border border-transparent px-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
                tab === k && "border-border bg-background text-foreground shadow-xs",
              )}
            >
              {ti.tabs[k]}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={ti.close}
          title={ti.close}
          className="size-7 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          onClick={close}
        >
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "tweaks" ? (
          <Tweaks />
        ) : !el ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-muted-foreground">
            <p className="text-pretty">{ti.empty}</p>
            <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={() => setPicking(target.cardId)}>
              <Crosshair className="size-3.5" aria-hidden="true" />
              {ti.pick}
            </Button>
          </div>
        ) : tab === "code" ? (
          <CodeTab el={el} edits={edits} tokens={tokenEdits} />
        ) : (
          <Properties key={el.selector} el={el} edits={edits} text={text} attrs={attrs} />
        )}
      </div>
      <footer className="flex shrink-0 flex-col gap-2 border-t p-2.5">
        <textarea
          aria-label={ti.ask}
          value={ask}
          rows={2}
          placeholder={ti.askHint}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (count || ask.trim())) apply();
          }}
          className="min-h-12 resize-none rounded-md border bg-background px-2 py-1.5 outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-muted-foreground tabular-nums">{count ? ti.changes(count) : ""}</span>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground" onClick={resetEdits}>
              {ti.reset}
            </Button>
          )}
          <Button size="sm" className="h-7 px-3 text-xs" disabled={sending || (!count && !ask.trim())} onClick={apply}>
            {ti.apply}
          </Button>
        </div>
      </footer>
    </section>
  );
}

function Properties({
  el,
  edits,
  text,
  attrs,
}: {
  el: PickedEl;
  edits: Record<string, string>;
  text: string | null;
  attrs: Record<string, string>;
}) {
  // What the panel shows: a change made here first, then what the stylesheet wrote, then the computed value.
  const s: Record<string, string> = { ...el.styles, ...el.declared, ...edits };
  const set = (k: string, v: string) => editStyle({ [k]: v });
  const parent = el.parent;
  const pFlex = !!parent && /flex/.test(parent.display);
  const pRow = pFlex && parent.flexDirection.startsWith("row");
  const flex = /flex|grid/.test(s.display ?? "");
  const hasText = !!el.text && el.tag !== "body";

  const sizingOf = (axis: "w" | "h"): Sizing => {
    const k = axis === "w" ? "width" : "height";
    const v = edits[k];
    if (v) return /content|auto/.test(v) ? "hug" : v === "100%" ? "fill" : "fixed";
    if (axis === "w" && pRow && edits.flexGrow) return Number(edits.flexGrow) > 0 ? "fill" : "hug";
    return el.sizing?.[axis] ?? "fixed";
  };
  const setSizing = (axis: "w" | "h", mode: Sizing) => {
    const k = axis === "w" ? "width" : "height";
    const main = pFlex && (axis === "w" ? pRow : !pRow);
    if (mode === "fixed") editStyle({ [k]: `${round(pxNum(el.styles[k]) ?? 0)}px`, ...(main ? { flexGrow: "0" } : {}) });
    else if (mode === "hug") editStyle({ [k]: "fit-content", ...(main ? { flexGrow: "0" } : {}) });
    else if (main) editStyle({ flexGrow: "1", flexBasis: "0px", [k]: "auto" });
    else if (pFlex) editStyle({ alignSelf: "stretch", [k]: "auto" });
    else editStyle({ [k]: "100%" });
  };
  // Aligning in the parent: the cross axis of a flex parent takes align-self, anything else takes auto margins.
  const align = (to: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => {
    const horizontal = to === "left" || to === "hcenter" || to === "right";
    const pos = to === "left" || to === "top" ? 0 : to === "hcenter" || to === "vcenter" ? 1 : 2;
    const self = ["flex-start", "center", "flex-end"][pos] as string;
    const margins = (a: string, b: string) => [
      [a, pos === 0 ? "0px" : "auto"],
      [b, pos === 2 ? "0px" : "auto"],
    ];
    if (pFlex && (horizontal ? !pRow : pRow)) editStyle({ alignSelf: self });
    else if (horizontal) editStyle(Object.fromEntries(margins("marginLeft", "marginRight")));
    else editStyle(Object.fromEntries(margins("marginTop", "marginBottom")));
  };
  const canVertical = pFlex;

  const opacity = Math.round(Number(s.opacity ?? 1) * 100);
  const borderStyle = s.borderTopStyle === "none" || pxNum(s.borderTopWidth) === 0 ? "none" : (s.borderTopStyle ?? "none");
  const shadow = shadowOf(s.boxShadow);
  const blur = blurOf(s.filter);
  const backdrop = blurOf(s.backdropFilter);
  const fontSize = pxNum(el.styles.fontSize) ?? 16;
  const lineHeight =
    s.lineHeight === "normal"
      ? "normal"
      : /px$/.test(s.lineHeight ?? "")
        ? String(round((pxNum(s.lineHeight) ?? 0) / fontSize, 2))
        : (s.lineHeight ?? "");
  const letter =
    s.letterSpacing === "normal" || !s.letterSpacing
      ? "0"
      : /px$/.test(s.letterSpacing)
        ? String(round((pxNum(s.letterSpacing) ?? 0) / fontSize, 3))
        : s.letterSpacing.replace(/em$/, "");
  const styleName =
    el.textStyles?.find(
      (ts) => family(ts.fontFamily) === family(s.fontFamily) && ts.fontSize === s.fontSize && ts.fontWeight === s.fontWeight,
    )?.name ?? "custom";
  const weight = String(Math.round(Number(s.fontWeight) / 100) * 100);

  return (
    <>
      {el.layers && el.layers.length > 0 && <Layers layers={el.layers} picked={el.ref} />}
      <div className="flex h-9 items-center justify-between border-b px-2.5">
        {(
          [
            ["left", AlignStartVertical, true],
            ["hcenter", AlignCenterVertical, true],
            ["right", AlignEndVertical, true],
            ["top", AlignStartHorizontal, canVertical],
            ["vcenter", AlignCenterHorizontal, canVertical],
            ["bottom", AlignEndHorizontal, canVertical],
          ] as const
        ).map(([k, Icon, on]) => (
          <IconBtn key={k} label={ti.alignTo[k]} disabled={!on} onClick={() => align(k)}>
            <Icon />
          </IconBtn>
        ))}
      </div>

      <Section title={ti.size}>
        <Row label={ti.width}>
          <div className="grid grid-cols-[1fr_5.5rem] gap-1.5">
            <Field value={shown(s.width)} unit="px" onCommit={(v) => set("width", withUnit(v))} />
            <Select value={sizingOf("w")} options={SIZINGS} onChange={(v) => setSizing("w", v as Sizing)} label={ti.width} />
          </div>
        </Row>
        <Row label={ti.height}>
          <div className="grid grid-cols-[1fr_5.5rem] gap-1.5">
            <Field value={shown(s.height)} unit="px" onCommit={(v) => set("height", withUnit(v))} />
            <Select value={sizingOf("h")} options={SIZINGS} onChange={(v) => setSizing("h", v as Sizing)} label={ti.height} />
          </div>
        </Row>
        <Row label={ti.maxWidth}>
          <Field
            value={s.maxWidth === "none" ? "" : shown(s.maxWidth)}
            placeholder="—"
            unit="px"
            onCommit={(v) => set("maxWidth", v ? withUnit(v) : "none")}
          />
        </Row>
        <Row label={ti.position}>
          <Select
            label={ti.position}
            value={s.position ?? "static"}
            options={Object.entries(ti.positions)}
            onChange={(v) => set("position", v)}
          />
        </Row>
        {pFlex && (
          <Row label={ti.grow}>
            <Field value={s.flexGrow ?? "0"} onCommit={(v) => set("flexGrow", v || "0")} />
          </Row>
        )}
      </Section>

      <Section
        title={ti.layout}
        action={
          !flex && (
            <IconBtn label={ti.layout} onClick={() => editStyle({ display: "flex", flexDirection: "column", gap: "8px" })}>
              <Plus />
            </IconBtn>
          )
        }
      >
        {flex && /flex/.test(s.display ?? "") && (
          <Row label={ti.direction}>
            <Seg
              value={s.flexDirection?.startsWith("column") ? "column" : "row"}
              options={[
                ["row", ti.directions.row, <Columns3 key="r" />],
                ["column", ti.directions.column, <Rows3 key="c" />],
              ]}
              onChange={(v) => set("flexDirection", v)}
            />
          </Row>
        )}
        {flex && (
          <Row label={ti.gap}>
            <Field value={shown(s.gap === "normal" ? "0px" : s.gap)} unit="px" onCommit={(v) => set("gap", withUnit(v))} />
          </Row>
        )}
        <Spacing label={ti.padding} prefix="padding" s={s} />
        <Spacing label={ti.margin} prefix="margin" s={s} />
      </Section>

      {hasText && (
        <Section title={ti.text}>
          <Row label={ti.textStyle}>
            <Select
              label={ti.textStyle}
              value={styleName}
              options={[["custom", ti.custom], ...(el.textStyles ?? []).map((ts) => [ts.name, ts.name] as [string, string])]}
              onChange={(v) => {
                const ts = el.textStyles?.find((x) => x.name === v);
                if (ts)
                  editStyle({
                    fontFamily: ts.fontFamily,
                    fontSize: ts.fontSize,
                    fontWeight: ts.fontWeight,
                    lineHeight: ts.lineHeight,
                    letterSpacing: ts.letterSpacing,
                  });
              }}
            />
          </Row>
          <Row label={ti.font}>
            <Select
              label={ti.font}
              value={family(s.fontFamily)}
              options={[...new Set([family(s.fontFamily), ...FONTS])].filter(Boolean).map((f) => [f, f])}
              onChange={(v) => set("fontFamily", `"${v}", ui-sans-serif, system-ui, sans-serif`)}
            />
          </Row>
          <Row label={ti.weight}>
            <Select label={ti.weight} value={weight} options={Object.entries(ti.weights)} onChange={(v) => set("fontWeight", v)} />
          </Row>
          <Row label={ti.fontSize}>
            <Field value={shown(s.fontSize)} unit="px" onCommit={(v) => set("fontSize", withUnit(v))} />
          </Row>
          <Row label={ti.spacing}>
            <div className="grid grid-cols-2 gap-1.5">
              <Field
                label={ti.lineHeight}
                glyph={<span className="font-mono text-[10px]">↕</span>}
                value={lineHeight}
                step={0.05}
                onCommit={(v) => set("lineHeight", v.trim() || "normal")}
              />
              <Field
                label={ti.letterSpacing}
                glyph={<span className="font-mono text-[10px]">|A|</span>}
                value={letter}
                unit="em"
                step={0.005}
                onCommit={(v) => set("letterSpacing", withUnit(v || "0", "em"))}
              />
            </div>
          </Row>
          <Row label={ti.color}>
            <ColorField label={ti.color} value={hex(s.color)} onChange={(v) => set("color", v)} />
          </Row>
          <Row label={ti.align}>
            <Seg
              value={s.textAlign === "start" ? "left" : s.textAlign === "end" ? "right" : (s.textAlign ?? "left")}
              options={[
                ["left", ti.aligns.left, <AlignLeft key="l" />],
                ["center", ti.aligns.center, <AlignCenter key="c" />],
                ["right", ti.aligns.right, <AlignRight key="r" />],
                ["justify", ti.aligns.justify, <AlignJustify key="j" />],
              ]}
              onChange={(v) => set("textAlign", v)}
            />
          </Row>
          {el.ownText && (
            <textarea
              aria-label={ti.content}
              value={text ?? el.text}
              rows={2}
              onChange={(e) => editText(e.target.value)}
              className="mt-0.5 min-h-12 w-full resize-none rounded-md border border-transparent bg-muted/60 px-2 py-1.5 transition-colors outline-none hover:border-border focus:border-ring"
            />
          )}
        </Section>
      )}

      <Section title={ti.appearance}>
        <Row label={ti.fill}>
          <ColorField label={ti.fill} value={hex(s.backgroundColor)} onChange={(v) => set("backgroundColor", v)} />
        </Row>
        <Row label={ti.opacity}>
          <div className="flex items-center gap-2">
            <Field className="w-20 shrink-0" value={String(opacity)} unit="%" onCommit={(v) => set("opacity", String(clamp01(v)))} />
            <input
              type="range"
              aria-label={ti.opacity}
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => set("opacity", String(Number(e.target.value) / 100))}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-foreground"
            />
          </div>
        </Row>
        <Corners s={s} />
        <Row label={ti.border}>
          <Seg
            value={borderStyle}
            options={[
              ["none", ti.borders.none, <Ban key="n" />],
              ["solid", ti.borders.solid, <Minus key="s" />],
              [
                "dashed",
                ti.borders.dashed,
                <span key="d" className="font-mono text-[11px] tracking-[-0.1em]">
                  --
                </span>,
              ],
              [
                "dotted",
                ti.borders.dotted,
                <span key="o" className="font-mono text-[11px]">
                  ···
                </span>,
              ],
            ]}
            onChange={(v) =>
              editStyle(
                v === "none"
                  ? { borderStyle: "none", borderWidth: "0px" }
                  : { borderStyle: v, ...(borderStyle === "none" ? { borderWidth: "1px" } : {}) },
              )
            }
          />
        </Row>
        {borderStyle !== "none" && (
          <Row label={ti.borderWidth}>
            <div className="grid grid-cols-[4.5rem_1fr] gap-1.5">
              <Field value={shown(s.borderTopWidth)} unit="px" onCommit={(v) => set("borderWidth", withUnit(v))} />
              <ColorField label={ti.borderColor} value={hex(s.borderTopColor)} onChange={(v) => set("borderColor", v)} />
            </div>
          </Row>
        )}
      </Section>

      <Section
        title={ti.effects}
        action={
          (shadow === "none" || blur === null || backdrop === null) && (
            <IconBtn
              label={ti.addEffect}
              onClick={() =>
                shadow === "none"
                  ? set("boxShadow", SHADOWS.md)
                  : blur === null
                    ? set("filter", "blur(4px)")
                    : set("backdropFilter", "blur(12px)")
              }
            >
              <Plus />
            </IconBtn>
          )
        }
      >
        {shadow !== "none" && (
          <Effect label={ti.shadow} onRemove={() => set("boxShadow", "none")}>
            <Select
              label={ti.shadow}
              value={shadow}
              options={[
                ...(["sm", "md", "lg"] as const).map((k) => [k, ti.shadows[k]] as [string, string]),
                ...(shadow === "custom" ? [["custom", ti.shadows.custom] as [string, string]] : []),
              ]}
              onChange={(v) => v in SHADOWS && set("boxShadow", SHADOWS[v as keyof typeof SHADOWS])}
            />
          </Effect>
        )}
        {blur !== null && (
          <Effect label={ti.blur} onRemove={() => set("filter", "none")}>
            <Field value={String(blur)} unit="px" onCommit={(v) => set("filter", `blur(${pxNum(v) ?? 0}px)`)} />
          </Effect>
        )}
        {backdrop !== null && (
          <Effect label={ti.backdrop} onRemove={() => set("backdropFilter", "none")}>
            <Field value={String(backdrop)} unit="px" onCommit={(v) => set("backdropFilter", `blur(${pxNum(v) ?? 0}px)`)} />
          </Effect>
        )}
      </Section>

      <Section title={ti.link}>
        <Row label={ti.destination}>
          <Field
            mono={false}
            value={attrs.href ?? el.href ?? ""}
            placeholder="https://…"
            onCommit={(v) => v !== (attrs.href ?? el.href ?? "") && editAttr("href", v)}
          />
        </Row>
      </Section>

      <Fold title={ti.export}>
        <div className="flex flex-col gap-0.5">
          <CopyRow label={ti.copyHtml} value={el.html} />
          <CopyRow label={ti.copyCss} value={cssOf(el.selector, edits, {})} />
          <CopyRow label={ti.copySelector} value={el.selector} />
        </div>
      </Fold>

      <Fold title={ti.advanced}>
        <Row label={ti.display}>
          <Select
            label={ti.display}
            value={s.display ?? "block"}
            options={["block", "flex", "grid", "inline", "inline-block", "inline-flex", "none"].map((v) => [v, v])}
            onChange={(v) => set("display", v)}
          />
        </Row>
        <Row label={ti.overflow}>
          <Select
            label={ti.overflow}
            value={s.overflow?.split(" ")[0] ?? "visible"}
            options={["visible", "hidden", "clip", "auto", "scroll"].map((v) => [v, v])}
            onChange={(v) => set("overflow", v)}
          />
        </Row>
        <Row label={ti.zIndex}>
          <Field value={s.zIndex ?? "auto"} onCommit={(v) => set("zIndex", v || "auto")} />
        </Row>
        <Row label={ti.cursor}>
          <Select
            label={ti.cursor}
            value={s.cursor ?? "auto"}
            options={["auto", "default", "pointer", "text", "move", "not-allowed"].map((v) => [v, v])}
            onChange={(v) => set("cursor", v)}
          />
        </Row>
        {el.classes && (
          <Row label={ti.classes}>
            <p className="line-clamp-3 font-mono text-[11px] break-all text-muted-foreground">{el.classes}</p>
          </Row>
        )}
        {el.loc && (
          <Row label={ti.source}>
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={el.loc}>
              {el.loc}
            </p>
          </Row>
        )}
      </Fold>
    </>
  );
}

const SIZINGS: [string, string][] = (["fixed", "hug", "fill"] as const).map((k) => [k, ti.sizing[k]]);
const clamp01 = (v: string) => Math.min(1, Math.max(0, (pxNum(v) ?? 100) / 100));

// The picked element among its ancestors and siblings, the way a design tool's layer list shows it.
function Layers({ layers, picked }: { layers: Layer[]; picked?: number }) {
  const pickedDepth = layers.find((l) => l.ref === picked)?.depth ?? -1;
  return (
    <nav aria-label={ti.layers} className="border-b py-1">
      <ul className="m-0 list-none p-0">
        {layers.map((l) => {
          const Icon = KIND_ICON[l.kind] ?? Hash;
          const on = l.ref === picked;
          const open = l.depth < pickedDepth || on;
          return (
            <li key={l.ref}>
              <button
                type="button"
                aria-current={on || undefined}
                onClick={() => selectLayer(l.ref)}
                style={{ paddingInlineStart: 8 + l.depth * 12 }}
                className={cn(
                  "flex h-7 w-full items-center gap-1.5 pe-2 text-start text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted focus-visible:outline-none",
                  on && "bg-muted text-foreground hover:bg-muted",
                )}
              >
                <span aria-hidden="true" className="flex size-3 shrink-0 items-center justify-center">
                  {l.kids > 0 && (open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)}
                </span>
                <Icon aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
                <span className="shrink-0">{ti.kinds[l.kind] ?? l.tag}</span>
                {l.text && <span className="min-w-0 truncate opacity-60">“{l.text}”</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CodeTab({ el, edits, tokens }: { el: PickedEl; edits: Record<string, string>; tokens: Record<string, string> }) {
  const css = cssOf(el.selector, edits, tokens);
  return (
    <>
      <Section title={ti.html} action={<CopyIcon value={el.html} />}>
        <pre className="max-h-72 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-4 break-all whitespace-pre-wrap">
          {el.html}
        </pre>
        {el.loc && <p className="truncate font-mono text-[11px] text-muted-foreground">{el.loc}</p>}
      </Section>
      <Section title={ti.changesCss} action={css ? <CopyIcon value={css} /> : null}>
        {css ? (
          <pre className="overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-4 whitespace-pre">{css}</pre>
        ) : (
          <p className="text-muted-foreground">{ti.noChanges}</p>
        )}
      </Section>
    </>
  );
}

const groupOf = (tk: Token): keyof typeof ti.tokens =>
  tk.hex
    ? "color"
    : /font|family|leading|tracking/.test(tk.name)
      ? "font"
      : /^-?[\d.]+(px|rem|em|%)?$/.test(tk.value) || /radius|spacing|size|width/.test(tk.name)
        ? "size"
        : "other";

// The page's design tokens, grouped and filterable; a change restyles the whole page at once.
function Tweaks() {
  const tokens = useInspect((s) => s.tokens);
  const tokenEdits = useInspect((s) => s.tokenEdits);
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const out: Record<string, Token[]> = {};
    for (const tk of tokens ?? []) {
      if (q && !tk.name.toLowerCase().includes(q.toLowerCase())) continue;
      const g = groupOf(tk);
      const list = out[g] ?? [];
      list.push(tk);
      out[g] = list;
    }
    return out;
  }, [tokens, q]);
  if (!tokens) return <p className="satgas-shimmer px-3 py-6 text-center">{ti.tokensLoading}</p>;
  if (!tokens.length) return <p className="px-6 py-10 text-center text-muted-foreground">{ti.tokensEmpty}</p>;
  return (
    <>
      <div className="flex flex-col gap-1.5 border-b px-2.5 py-2">
        <label className={cn(FIELD, "gap-1.5 ps-2")}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            aria-label={ti.tabs.tweaks}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="--color-…"
            className="h-full min-w-0 flex-1 bg-transparent pe-2 font-mono outline-none placeholder:text-muted-foreground"
          />
        </label>
        <p className="text-muted-foreground">{ti.tweaksHint}</p>
      </div>
      {(["color", "font", "size", "other"] as const).map((g) =>
        groups[g]?.length ? (
          <Section key={g} title={ti.tokens[g]}>
            {groups[g].map((tk) => {
              const v = tokenEdits[tk.name];
              return (
                <Row key={tk.name} label={tk.name.replace(/^--/, "")} mono>
                  {tk.hex ? (
                    <ColorField label={tk.name} value={v ?? tk.hex} onChange={(nv) => editToken(tk.name, nv)} />
                  ) : (
                    <Field value={v ?? tk.value} onCommit={(nv) => nv !== tk.value && editToken(tk.name, nv)} />
                  )}
                </Row>
              );
            })}
          </Section>
        ) : null,
      )}
    </>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-b px-2.5 pt-2 pb-3 last:border-b-0">
      <header className="flex h-6 items-center justify-between">
        <h3 className="text-[13px] font-medium">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between px-2.5 text-[13px] font-medium transition-colors hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:outline-none"
      >
        {title}
        <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden="true" />
      </button>
      {open && <div className="flex flex-col gap-1.5 px-2.5 pb-3">{children}</div>}
    </section>
  );
}

function Row({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="grid min-h-7 grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-2">
      <span className={cn("truncate text-muted-foreground", mono && "font-mono text-[11px]")} title={label}>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Effect({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        <IconBtn label={ti.removeEffect} onClick={onRemove}>
          <Minus />
        </IconBtn>
      </div>
    </Row>
  );
}

const SIDES = [
  ["Top", PanelTop],
  ["Right", PanelRight],
  ["Bottom", PanelBottom],
  ["Left", PanelLeft],
] as const;

// Padding or margin: one value while all sides match, four once they differ or the person splits them.
function Spacing({ label, prefix, s }: { label: string; prefix: "padding" | "margin"; s: Record<string, string> }) {
  const vals = SIDES.map(([side]) => shown(s[`${prefix}${side}`] ?? "0px"));
  const same = vals.every((v) => v === vals[0]);
  const [split, setSplit] = useState(!same);
  return (
    <>
      <Row label={label}>
        <div className="flex items-center gap-1">
          <Field
            className="flex-1"
            value={split ? "" : (vals[0] ?? "")}
            placeholder={split ? ti.perSide : ""}
            disabled={split}
            unit="px"
            onCommit={(v) => editStyle({ [prefix]: withUnit(v || "0") })}
          />
          <IconBtn label={ti.perSide} pressed={split} onClick={() => setSplit(!split)}>
            <ScanLine />
          </IconBtn>
        </div>
      </Row>
      {split && (
        <div className="grid grid-cols-[5.25rem_1fr_1fr_1.75rem] gap-x-2 gap-y-1.5">
          {SIDES.map(([side, Icon], i) => (
            <Field
              key={side}
              className={i % 2 === 0 ? "col-start-2" : "col-start-3"}
              label={`${label} ${ti.sides[side.toLowerCase() as keyof typeof ti.sides]}`}
              glyph={<Icon className="size-3" />}
              value={vals[i] ?? ""}
              onCommit={(v) => set1(`${prefix}${side}`, withUnit(v || "0"))}
            />
          ))}
        </div>
      )}
    </>
  );
}
const set1 = (k: string, v: string) => editStyle({ [k]: v });

function Corners({ s }: { s: Record<string, string> }) {
  const keys = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"];
  const vals = keys.map((k) => shown(s[k] ?? "0px"));
  const [split, setSplit] = useState(!vals.every((v) => v === vals[0]));
  return (
    <>
      <Row label={ti.radius}>
        <div className="flex items-center gap-1">
          <Field
            className="flex-1"
            value={split ? "" : (vals[0] ?? "")}
            placeholder={split ? ti.mixed : ""}
            disabled={split}
            unit="px"
            onCommit={(v) => editStyle({ borderRadius: withUnit(v || "0") })}
          />
          <IconBtn label={ti.perCorner} pressed={split} onClick={() => setSplit(!split)}>
            <ScanLine />
          </IconBtn>
        </div>
      </Row>
      {split && (
        <div className="grid grid-cols-[5.25rem_1fr_1fr_1.75rem] gap-x-2 gap-y-1.5">
          {keys.map((k, i) => (
            <Field
              key={k}
              className={i % 2 === 0 ? "col-start-2" : "col-start-3"}
              label={`${ti.radius} ${i + 1}`}
              glyph={<span className="font-mono text-[10px]">{["↖", "↗", "↘", "↙"][i]}</span>}
              value={vals[i] ?? ""}
              onCommit={(v) => set1(k, withUnit(v || "0"))}
            />
          ))}
        </div>
      )}
    </>
  );
}

const FIELD =
  "flex h-7 min-w-0 items-center rounded-md border border-transparent bg-muted/60 transition-colors hover:border-border focus-within:border-ring";

// A value field that takes any CSS the property allows; arrows nudge a number by its step (ten steps with Shift),
// keeping its unit, and apply at once.
function Field({
  value,
  onCommit,
  unit,
  glyph,
  label,
  placeholder,
  disabled,
  step = 1,
  mono = false,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  unit?: string;
  glyph?: ReactNode;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  step?: number;
  mono?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    if (raw.trim() !== value) onCommit(raw.trim());
    setDraft(null);
  };
  const num = /^-?[\d.]+$/.test(value);
  return (
    <label className={cn(FIELD, disabled && "opacity-60", className)} title={label}>
      {glyph && (
        <span aria-hidden="true" className="flex w-6 shrink-0 items-center justify-center text-muted-foreground">
          {glyph}
        </span>
      )}
      <input
        aria-label={label}
        value={draft ?? value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => draft !== null && commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && (num || value === "")) {
            e.preventDefault();
            const by = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
            const decimals = Math.max(0, -Math.floor(Math.log10(step)));
            onCommit(String(round((Number.parseFloat(value) || 0) + by, decimals)));
            setDraft(null);
          }
        }}
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-xs tabular-nums outline-none placeholder:text-muted-foreground",
          glyph ? "pe-1.5" : "px-2",
          mono && "font-mono",
        )}
      />
      {unit && num && <span className="shrink-0 pe-2 text-[11px] text-muted-foreground">{unit}</span>}
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className={cn(FIELD, "relative")} title={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent ps-2 pe-6 text-xs outline-none"
      >
        {!options.some(([v]) => v === value) && <option value={value}>{value}</option>}
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute end-1.5 size-3.5 text-muted-foreground" />
    </label>
  );
}

function Seg({ value, options, onChange }: { value: string; options: [string, string, ReactNode][]; onChange: (v: string) => void }) {
  return (
    <div className="flex h-7 items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
      {options.map(([v, label, icon]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={label}
          title={label}
          onClick={() => onChange(v)}
          className="flex h-6 flex-1 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs [&_svg]:size-3.5"
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const v = raw.trim().replace(/^#?/, "#");
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) && v.toLowerCase() !== value) onChange(v.toLowerCase());
    setDraft(null);
  };
  return (
    <div className={cn(FIELD, "gap-1.5 ps-1.5")} title={label}>
      <label
        className={cn(
          "relative size-4 shrink-0 cursor-pointer overflow-hidden rounded-sm border",
          !value && "bg-[repeating-conic-gradient(var(--color-muted)_0_25%,transparent_0_50%)] bg-size-[6px_6px]",
        )}
      >
        <span className="absolute inset-0" style={{ background: value ?? "transparent" }} aria-hidden="true" />
        <input
          type="color"
          aria-label={label}
          value={value ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        aria-label={label}
        value={draft ?? value ?? ""}
        placeholder={ti.noColor}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => draft !== null && commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
        className="h-full min-w-0 flex-1 bg-transparent pe-2 font-mono text-xs uppercase outline-none placeholder:text-muted-foreground placeholder:normal-case"
      />
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("size-7 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5", pressed && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  );
}

const copy = (value: string) =>
  void navigator.clipboard
    ?.writeText(value)
    .then(() => toast.success(ti.copied))
    .catch(() => toast.error(value.slice(0, 120)));

function CopyIcon({ value }: { value: string }) {
  return (
    <IconBtn label={ti.copied} onClick={() => copy(value)}>
      <Copy />
    </IconBtn>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      disabled={!value}
      onClick={() => copy(value)}
      className="flex h-7 items-center gap-2 rounded-md px-1.5 text-start text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
    >
      <Copy className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
