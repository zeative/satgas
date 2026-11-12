import { Panel } from "@xyflow/react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { closeInspect, editStyle, editText, type PickedEl, resetEdits, setPicking, useInspect } from "@/stores/inspect";
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
const WEIGHTS = ["300", "400", "500", "600", "700", "800"];
const SHADOWS = {
  none: "none",
  sm: "0 1px 2px rgba(0, 0, 0, 0.08)",
  md: "0 4px 12px rgba(0, 0, 0, 0.1)",
  lg: "0 12px 32px rgba(0, 0, 0, 0.14)",
} as const;
const ALIGNS = [
  ["left", AlignLeft],
  ["center", AlignCenter],
  ["right", AlignRight],
  ["justify", AlignJustify],
] as const;

const px = (v: string | undefined) => {
  const n = Number.parseFloat(v ?? "");
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};
const family = (v: string | undefined) => (v ?? "").split(",")[0]?.replace(/["']/g, "").trim() ?? "";

// Computed colours arrive as rgb() or rgba(); the panel shows and takes hex, the way Figma does.
function hex(v: string | undefined): string | null {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(v ?? "");
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return `#${[m[1], m[2], m[3]].map((c) => Math.round(Number(c)).toString(16).padStart(2, "0")).join("")}`;
}
const shadowOf = (v: string | undefined) =>
  !v || v === "none" ? "none" : (Object.entries(SHADOWS).find(([, css]) => css === v)?.[0] ?? "custom");

// What the team gets: the element as the page reported it, and each change from what it was to what it should be.
function editPrompt(app: string, el: PickedEl, edits: Record<string, string>, text: string | null, ask: string): string {
  const from = el.styles;
  const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const lines = Object.entries(edits).map(([k, v]) => `- ${kebab(k)}: ${from[k] ?? "unset"} → ${v}`);
  if (text !== null) lines.push(`- text: "${el.text}" → "${text}"`);
  return [
    `Design edit from the inspector on the \`${app}\` app, page \`${el.path}\`.`,
    "",
    `Element: \`<${el.tag}>\`${el.text ? ` with the text "${el.text.slice(0, 80)}"` : ""}, selector \`${el.selector}\`${el.loc ? `, source \`${el.loc}\`` : ""}.`,
    el.classes ? `Its classes: \`${el.classes}\`.` : "",
    "```html",
    el.html,
    "```",
    lines.length ? `Change:\n${lines.join("\n")}` : "",
    ask ? `Also: ${ask}` : "",
    "",
    "Write it into the source so it holds after a reload, in the project's own styling (its Tailwind classes or design tokens, not inline styles). Change only this element, or its shared component when it is one, and keep everything else as it is. Check the page in the browser afterwards.",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");
}

// Figma's right-hand properties panel for the element picked in a frame. Every change previews on the page at once;
// Apply hands them to the team, who write them into the source.
export function Inspector({ shifted }: { shifted: boolean }) {
  const target = useInspect((s) => s.target);
  const edits = useInspect((s) => s.edits);
  const text = useInspect((s) => s.text);
  const [ask, setAsk] = useState("");
  const [sending, setSending] = useState(false);
  if (!target) return null;
  const { el } = target;
  const s = { ...el.styles, ...edits };
  const count = Object.keys(edits).length + (text !== null ? 1 : 0);
  const set = (k: string, v: string) => editStyle({ [k]: v });
  const flex = /flex|grid/.test(s.display ?? "");
  const hasText = !!el.text;

  const apply = () => {
    setSending(true);
    sendPrompt(target.runId, editPrompt(target.app, el, edits, text, ask.trim()), [], [target.cardId])
      .then(() => {
        toast.success(ti.sent);
        setAsk("");
        setPicking(null);
        closeInspect(true);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setSending(false));
  };

  return (
    <Panel
      position="top-right"
      className={cn(
        "nodrag nowheel m-4! mt-16! flex max-h-[calc(100%-6rem)] w-64 flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
        shifted && "me-[calc(var(--panel-w)+1.5rem)]!",
      )}
    >
      <section aria-label={ti.label} className="flex min-h-0 flex-col">
        <header className="flex h-10 shrink-0 items-center gap-2 border-b ps-3 pe-1.5">
          <span className="shrink-0 rounded bg-muted px-1.5 font-mono text-[11px] leading-5 text-foreground">{el.tag}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={el.selector}>
            {el.text || el.selector}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={ti.close}
            title={ti.close}
            className="size-7 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
            onClick={() => closeInspect()}
          >
            <X />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Group title={ti.layout}>
            <Num tag="W" label={ti.width} value={px(s.width)} onChange={(v) => set("width", `${v}px`)} />
            <Num tag="H" label={ti.height} value={px(s.height)} onChange={(v) => set("height", `${v}px`)} />
            <Num
              tag="↔"
              label={ti.padX}
              value={px(s.paddingLeft)}
              onChange={(v) => editStyle({ paddingLeft: `${v}px`, paddingRight: `${v}px` })}
            />
            <Num
              tag="↕"
              label={ti.padY}
              value={px(s.paddingTop)}
              onChange={(v) => editStyle({ paddingTop: `${v}px`, paddingBottom: `${v}px` })}
            />
            {flex && <Num tag="G" label={ti.gap} value={px(s.gap)} onChange={(v) => set("gap", `${v}px`)} />}
            <Num tag="R" label={ti.radius} value={px(s.borderTopLeftRadius)} onChange={(v) => set("borderRadius", `${v}px`)} />
          </Group>
          {hasText && (
            <Group title={ti.typography}>
              <Pick
                wide
                label={ti.font}
                value={family(s.fontFamily)}
                options={[...new Set([family(s.fontFamily), ...FONTS])].filter(Boolean).map((f) => [f, f])}
                onChange={(v) => set("fontFamily", `"${v}", ui-sans-serif, system-ui, sans-serif`)}
              />
              <Pick
                label={ti.weight}
                value={String(Math.round(Number(s.fontWeight) / 100) * 100)}
                options={WEIGHTS.map((w) => [w, w])}
                onChange={(v) => set("fontWeight", v)}
              />
              <Num tag="Aa" label={ti.size} value={px(s.fontSize)} onChange={(v) => set("fontSize", `${v}px`)} />
              <Num
                tag="↕A"
                label={ti.lineHeight}
                value={px(s.lineHeight)}
                placeholder="Auto"
                onChange={(v) => set("lineHeight", `${v}px`)}
              />
              <Num
                tag="A↔"
                label={ti.letterSpacing}
                value={px(s.letterSpacing) ?? 0}
                step={0.1}
                onChange={(v) => set("letterSpacing", `${v}px`)}
              />
              <fieldset aria-label={ti.align} className="col-span-2 m-0 flex h-7 items-center gap-0.5 rounded-md bg-muted/60 p-0.5">
                {ALIGNS.map(([a, Icon]) => (
                  <button
                    key={a}
                    type="button"
                    aria-label={ti.aligns[a]}
                    aria-pressed={s.textAlign === a || (a === "left" && s.textAlign === "start")}
                    title={ti.aligns[a]}
                    onClick={() => set("textAlign", a)}
                    className="flex h-6 flex-1 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </button>
                ))}
              </fieldset>
              <Color wide label={ti.color} value={hex(s.color)} onChange={(v) => set("color", v)} />
            </Group>
          )}
          <Group title={ti.fill}>
            <Color wide label={ti.background} value={hex(s.backgroundColor)} onChange={(v) => set("backgroundColor", v)} />
          </Group>
          <Group title={ti.stroke}>
            <Num
              tag="B"
              label={ti.border}
              value={s.borderTopStyle === "none" ? 0 : px(s.borderTopWidth)}
              onChange={(v) => editStyle({ borderWidth: `${v}px`, borderStyle: v > 0 ? "solid" : "none" })}
            />
            <Color label={ti.borderColor} value={hex(s.borderTopColor)} onChange={(v) => set("borderColor", v)} />
          </Group>
          <Group title={ti.effects}>
            <Num
              tag="%"
              label={ti.opacity}
              value={Math.round(Number(s.opacity ?? 1) * 100)}
              min={0}
              max={100}
              onChange={(v) => set("opacity", String(v / 100))}
            />
            <Pick
              label={ti.shadow}
              value={shadowOf(s.boxShadow)}
              options={[
                ...Object.keys(SHADOWS).map((k) => [k, ti.shadows[k as keyof typeof SHADOWS]] as [string, string]),
                ...(shadowOf(s.boxShadow) === "custom" ? [["custom", ti.shadows.custom] as [string, string]] : []),
              ]}
              onChange={(v) => v in SHADOWS && set("boxShadow", SHADOWS[v as keyof typeof SHADOWS])}
            />
          </Group>
          {el.ownText && (
            <Group title={ti.content}>
              <textarea
                aria-label={ti.content}
                value={text ?? el.text}
                rows={2}
                onChange={(e) => editText(e.target.value)}
                className="col-span-2 min-h-14 resize-none rounded-md border border-transparent bg-muted/60 px-2 py-1.5 text-xs transition-colors outline-none hover:border-border focus:border-ring"
              />
            </Group>
          )}
        </div>
        <footer className="flex shrink-0 flex-col gap-2 border-t p-3">
          <textarea
            aria-label={ti.ask}
            value={ask}
            rows={2}
            placeholder={ti.askHint}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (count || ask.trim())) apply();
            }}
            className="min-h-14 resize-none rounded-md border bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">{count ? ti.changes(count) : ""}</span>
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
    </Panel>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 grid grid-cols-2 gap-1.5 border-0 border-b px-3 pt-2 pb-3 last:border-b-0">
      <legend className="float-left col-span-2 mb-0.5 h-6 text-xs leading-6 font-medium">{title}</legend>
      {children}
    </fieldset>
  );
}

const FIELD =
  "flex h-7 min-w-0 items-center rounded-md border border-transparent bg-muted/60 transition-colors hover:border-border focus-within:border-ring";

// A number field the way Figma's are: a short tag, the value, arrows nudge it by one (ten with Shift) and apply at once.
function Num({
  tag,
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  placeholder,
}: {
  tag: string;
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, v));
  const commit = (raw: string) => {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n !== value) onChange(clamp(Math.round(n * 10) / 10));
    setDraft(null);
  };
  return (
    <label className={FIELD} title={label}>
      <span aria-hidden="true" className="w-7 shrink-0 text-center font-mono text-[10px] text-muted-foreground">
        {tag}
      </span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft ?? (value === null ? "" : String(value))}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const by = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
            onChange(clamp(Math.round(((value ?? 0) + by) * 10) / 10));
            setDraft(null);
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent pe-2 font-mono text-xs tabular-nums outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

function Pick({
  label,
  value,
  options,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={cn(FIELD, wide && "col-span-2")} title={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent px-2 text-xs outline-none"
      >
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Color({ label, value, onChange, wide }: { label: string; value: string | null; onChange: (v: string) => void; wide?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const v = raw.trim().replace(/^#?/, "#");
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) && v.toLowerCase() !== value) onChange(v.toLowerCase());
    setDraft(null);
  };
  return (
    <div className={cn(FIELD, "gap-1.5 ps-1.5", wide && "col-span-2")} title={label}>
      <label className="relative size-4 shrink-0 cursor-pointer overflow-hidden rounded-sm border">
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
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
        className="h-full min-w-0 flex-1 bg-transparent pe-2 font-mono text-xs uppercase outline-none placeholder:text-muted-foreground placeholder:normal-case"
      />
    </div>
  );
}
