import { Link } from "@tanstack/react-router";
import {
  AppWindow,
  Blocks,
  Code2,
  Files,
  FileText,
  Folder,
  Frame,
  Image,
  MessageCircleQuestionMark,
  PenLine,
  Plug,
  ScrollText,
  Shapes,
  StickyNote,
  Table2,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ClaudeMark, CodexMark } from "@/components/brand-marks";
import { LinkedText } from "@/components/linked-text";
import { kindName, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { loadSettings, useSettings } from "@/stores/settings";
import { loadSkills, useSkills } from "@/stores/skills";
import type { Card } from "../../../shared/board";
import { catalogOf } from "../../../shared/catalog";
import { atToken, cardMentions, type Refs, splitTokens } from "../../../shared/refs";
import type { Run } from "../../../shared/types";
import { keyedSrc } from "../board/context";

const isMedia = (c: Card) => c.kind === "image" || c.kind === "preview";

// Each card kind has its own glyph, in the chat and in the @ menu.
export const KIND_ICON = {
  note: StickyNote,
  doc: FileText,
  table: Table2,
  image: Image,
  preview: AppWindow,
  code: Code2,
  files: Files,
  drawing: PenLine,
  text: Type,
  shape: Shapes,
  frame: Frame,
  widget: Blocks,
};

// The menu's tallest size, the room it wants before preferring the other side, and its floor when space is tight.
const MENU_MAX = 320;
const MENU_MIN = 240;
const MENU_MIN_HEIGHT = 120;
// The gap between field and menu, plus a margin from the window's edge.
const MENU_GAP = 16;

type Group = "actions" | "skills" | "agentSkills" | "builtinSkills" | "files" | "board" | "agents" | "connectors";
// Skills come in their own groups, the person's first, so a bundle of twenty never pushes theirs out of the menu.
const GROUPS: Record<"/" | "@", Group[]> = {
  "/": ["actions", "skills", "builtinSkills", "agentSkills"],
  "@": ["files", "board", "agents", "connectors"],
};
// Long groups show their best matches only, so the menu stays one glance tall.
const GROUP_CAP: Partial<Record<Group, number>> = { files: 5, board: 5, skills: 8, builtinSkills: 4, agentSkills: 6 };

export interface TokenItem {
  kind: "/" | "@";
  group: Group;
  // What a typed token is compared against; files keep their case, the rest compare in lowercase.
  name: string;
  insert: string;
  label: string;
  desc?: string;
  icon: React.ReactNode;
}

const AGENT = {
  claude: { name: "Claude Code", Mark: ClaudeMark },
  codex: { name: "Codex", Mark: CodexMark },
} as const;

// What `/` and `@` can name right now: actions and skills, files and cards of this board, agents and connectors.
export function useTokenCatalog(run?: Run) {
  const settings = useSettings((s) => s.settings);
  const skills = useSkills((s) => s.skills);
  const cards = run?.board?.cards;
  const runId = run?.id;
  const [tree, setTree] = useState<{ id: string; paths: string[] } | null>(null);

  useEffect(() => {
    if (!useSettings.getState().settings) void loadSettings();
    if (!useSkills.getState().skills) void loadSkills();
  }, []);

  // The workspace changes as agents work, so the file list is read again each time the @ menu opens.
  const loadTree = useCallback(() => {
    if (!runId) return;
    void fetch(`/api/runs/${runId}/tree`)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .catch(() => [] as string[])
      .then((paths) => setTree({ id: runId, paths }));
  }, [runId]);

  const items = useMemo(() => {
    const out: TokenItem[] = [];
    const agents = (["claude", "codex"] as const).filter((a) => settings?.agents[a].tasks);
    out.push({
      kind: "/",
      group: "actions",
      name: "ask",
      insert: "/ask",
      label: "/ask",
      desc: t.tokens.ask,
      icon: <MessageCircleQuestionMark />,
    });
    for (const a of agents) {
      const { name, Mark } = AGENT[a];
      out.push({ kind: "/", group: "actions", name: a, insert: `/${a}`, label: `/${a}`, desc: t.tokens.only(name), icon: <Mark /> });
    }
    // The satgas skill already guides every task, so naming it changes nothing; picking one of agent-skills tells the
    // team which part of the workflow to follow.
    for (const s of skills ?? []) {
      const group: Group | null = s.pack ? "agentSkills" : s.source.kind !== "builtin" ? "skills" : s.optional ? "builtinSkills" : null;
      if (s.enabled && group)
        out.push({
          kind: "/",
          group,
          name: s.name,
          insert: `/${s.name}`,
          label: `/${s.name}`,
          desc: s.description,
          icon: <ScrollText />,
        });
    }
    if (tree && tree.id === runId)
      for (const path of tree.paths)
        out.push({
          kind: "@",
          group: "files",
          name: path,
          insert: atToken(path),
          label: path,
          icon: path.endsWith("/") ? <Folder /> : <FileText />,
        });
    const mentions = cardMentions(cards ?? []);
    // Media first: the group shows five, and a picture has no text to search by if the person does not know its name.
    for (const c of [...(cards ?? [])].sort((a, b) => Number(isMedia(b)) - Number(isMedia(a)))) {
      const label = mentions.get(c.id);
      if (!label) continue;
      const Icon = KIND_ICON[c.kind];
      const thumb = c.kind === "image" && runId ? keyedSrc(c.src, runId, run?.fileKey) : undefined;
      out.push({
        kind: "@",
        group: "board",
        name: label.toLowerCase(),
        insert: atToken(label),
        label,
        desc: kindName(c),
        icon: thumb ? <img src={thumb} alt="" className="size-4 rounded-[3px] object-cover" /> : <Icon />,
      });
    }
    for (const a of agents) {
      const { name, Mark } = AGENT[a];
      out.push({ kind: "@", group: "agents", name: a, insert: `@${a}`, label: name, desc: `@${a}`, icon: <Mark /> });
    }
    for (const s of settings?.mcpServers ?? []) {
      if (!s.enabled) continue;
      const logo = catalogOf(s)?.logo;
      out.push({
        kind: "@",
        group: "connectors",
        name: s.name.toLowerCase(),
        insert: atToken(s.name),
        label: catalogOf(s)?.name ?? s.name,
        desc: `@${s.name}`,
        icon: logo ? <ConnectorLogo src={logo.src} dark={logo.dark} /> : <Plug />,
      });
    }
    return out;
  }, [settings, skills, tree, runId, cards, run?.fileKey]);

  const known = useMemo(() => {
    const names = new Set(items.map((i) => `${i.kind}${i.name}`));
    return (kind: "/" | "@", name: string) =>
      names.has(`${kind}${name}`) || names.has(`${kind}${name.toLowerCase()}`) || (kind === "@" && names.has(`@${name}/`));
  }, [items]);

  return { items, known, loadTree, filesLoading: !!runId && tree?.id !== runId };
}

function ConnectorLogo({ src, dark }: { src: string; dark?: string }) {
  return (
    <>
      <img src={src} alt="" className={cn("size-4 object-contain", dark && "dark:hidden")} />
      {dark && <img src={dark} alt="" className="hidden size-4 object-contain dark:block" />}
    </>
  );
}

// A token's chip: a tinted box with a soft edge that adds no width, so marked text lines up with the textarea's.
const MARK = "rounded-[4px] bg-signal/20 [box-shadow:0_0_0_2px_color-mix(in_oklab,var(--color-signal)_20%,transparent)]";

// The tokens a sent prompt resolved to, so the chat marks only the ones that named something.
export function knownFromRefs(refs: Refs | undefined, cards: Card[] = []) {
  const mentions = cardMentions(cards);
  const labels = new Set((refs?.cards ?? []).map((id) => (mentions.get(id) ?? "").toLowerCase()));
  const lower = (list?: string[]) => new Set((list ?? []).map((x) => x.toLowerCase()));
  const agents = lower(refs?.agents);
  const connectors = lower(refs?.connectors);
  const files = new Set((refs?.files ?? []).map((f) => f.replace(/\/$/, "")));
  return (kind: "/" | "@", name: string) => {
    if (!refs) return false;
    if (kind === "/") return (name === "ask" && !!refs.ask) || refs.only === name || !!refs.skills?.includes(name);
    const n = name.toLowerCase();
    return agents.has(n) || connectors.has(n) || labels.has(n) || files.has(name.replace(/\/$/, ""));
  };
}

// Prompt text with the tokens that name something marked, for the sent bubble.
export function TokenText({
  text,
  known,
  links,
}: {
  text: string;
  known: (kind: "/" | "@", name: string) => boolean;
  // Sent messages: their URLs open. The field's highlight layer leaves this off, its text must match the textarea.
  links?: boolean;
}) {
  let at = 0;
  return (
    <>
      {splitTokens(text).map((p) => {
        // A piece's offset in the text is its stable key.
        const key = at;
        at += p.text.length;
        return p.kind && p.name && known(p.kind, p.name) ? (
          <span key={key} className={MARK}>
            {p.text}
          </span>
        ) : (
          <span key={key}>{links ? <LinkedText text={p.text} /> : p.text}</span>
        );
      })}
    </>
  );
}

interface Open {
  kind: "/" | "@";
  start: number;
  query: string;
}

// The token being typed just before the cursor: `/word`, `@path` or `@"several words`.
function typing(text: string, caret: number): Open | null {
  const m = /(?:^|\s)(\/[a-z0-9-]*|@"[^"\n]*|@[^\s"]*)$/i.exec(text.slice(0, caret));
  const token = m?.[1];
  if (!token) return null;
  return { kind: token[0] as "/" | "@", start: caret - token.length, query: token.slice(1).replace(/^"/, "") };
}

function rank(item: TokenItem, q: string): number {
  if (!q) return 0;
  const hay = [item.name, item.label.toLowerCase(), item.group === "files" ? (item.name.split("/").filter(Boolean).pop() ?? "") : ""];
  if (hay.some((h) => h.toLowerCase().startsWith(q))) return 1;
  return hay.some((h) => h.toLowerCase().includes(q)) ? 2 : -1;
}

interface FieldProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
  catalog: ReturnType<typeof useTokenCatalog>;
  fieldRef: React.RefObject<HTMLTextAreaElement | null>;
  // Typography and padding, shared by the textarea and the layer that marks its tokens, so both lay text out alike.
  className: string;
}

// A prompt box where `/` and `@` open a menu of things to name, and named things are marked as you type.
export function TokenField({ value, onValueChange, catalog, fieldRef, className, onKeyDown, onScroll, ...rest }: FieldProps) {
  const [open, setOpen] = useState<Open | null>(null);
  // Opens above the field when it fits, else below, and never taller than the room it has on screen.
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ side: "top" | "bottom"; max: number }>({ side: "top", max: MENU_MAX });
  const isOpen = !!open;
  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const box = menu.current?.parentElement?.getBoundingClientRect();
      if (!box) return;
      const above = box.top - MENU_GAP;
      const below = window.innerHeight - box.bottom - MENU_GAP;
      const side = above >= Math.min(MENU_MAX, MENU_MIN) || above >= below ? "top" : "bottom";
      setPlace({ side, max: Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX, side === "top" ? above : below)) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isOpen]);
  const [active, setActive] = useState(0);
  // Escape closes the menu until a new token starts.
  const dismissed = useRef<number | null>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const id = useId();
  const { items, known, loadTree, filesLoading } = catalog;

  const sync = (text: string, caret: number) => {
    const next = typing(text, caret);
    if (!next || next.start === dismissed.current) {
      setOpen(null);
      return;
    }
    dismissed.current = null;
    setOpen((was) => {
      const opening = !was || was.start !== next.start;
      if (next.kind === "@" && opening) loadTree();
      // Skills change in Integrations (or by the lead), so the list is read again each time the / menu opens.
      if (next.kind === "/" && opening) void loadSkills();
      return next;
    });
  };

  const groups = useMemo(() => {
    if (!open) return [];
    const q = open.query.toLowerCase();
    return GROUPS[open.kind]
      .map((group) => {
        const found = items
          .filter((i) => i.kind === open.kind && i.group === group)
          .map((i, n) => ({ i, n, r: rank(i, q) }))
          .filter((x) => x.r >= 0)
          .sort((a, b) => a.r - b.r || a.n - b.n)
          .map((x) => x.i);
        return { group, items: found.slice(0, GROUP_CAP[group] ?? found.length) };
      })
      .filter((g) => g.items.length || (g.group === "files" && filesLoading));
  }, [open, items, filesLoading]);
  const flat = groups.flatMap((g) => g.items);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts again at the top.
  useEffect(() => setActive(0), [open?.query, open?.kind]);

  // The marking layer scrolls with the text once the box is full.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scroll offset can change with every edit.
  useLayoutEffect(() => {
    if (mirror.current && fieldRef.current) mirror.current.scrollTop = fieldRef.current.scrollTop;
  }, [value]);

  const pick = (item: TokenItem) => {
    if (!open) return;
    const el = fieldRef.current;
    const caret = el?.selectionStart ?? value.length;
    const after = value.slice(caret).replace(/^\S*/, "");
    const insert = `${item.insert}${after.startsWith(" ") ? "" : " "}`;
    onValueChange(value.slice(0, open.start) + insert + after);
    setOpen(null);
    const at = open.start + insert.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at, at);
    });
  };

  const optionId = (n: number) => `${id}-o${n}`;
  let n = -1;

  return (
    <div className="relative">
      <div
        ref={mirror}
        aria-hidden="true"
        className={cn(className, "pointer-events-none absolute inset-0 overflow-hidden break-words whitespace-pre-wrap text-transparent")}
      >
        <TokenText text={value} known={known} />
        {/* Keeps a trailing line break as tall as the textarea draws it. */}
        {"​"}
      </div>
      <textarea
        {...rest}
        ref={fieldRef}
        value={value}
        role="combobox"
        aria-expanded={!!open && flat.length > 0}
        aria-controls={open ? `${id}-list` : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && flat[active] ? optionId(active) : undefined}
        onChange={(e) => {
          onValueChange(e.target.value);
          sync(e.target.value, e.target.selectionStart);
        }}
        onSelect={(e) => sync(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setOpen(null)}
        onScroll={(e) => {
          if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop;
          onScroll?.(e);
        }}
        onKeyDown={(e) => {
          if (open && flat.length && !e.nativeEvent.isComposing) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const item = flat[active];
              if (item) pick(item);
              return;
            }
          }
          if (open && e.key === "Escape") {
            // The board's own Escape (closing a panel) waits until the menu is gone.
            e.preventDefault();
            e.stopPropagation();
            dismissed.current = open.start;
            setOpen(null);
            return;
          }
          onKeyDown?.(e);
        }}
        className={cn(className, "relative")}
      />
      {open && (
        <div
          ref={menu}
          style={{ maxHeight: place.max }}
          className={cn(
            "absolute inset-x-0 z-30 flex max-w-full flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg sm:end-auto sm:w-96",
            place.side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <div id={`${id}-list`} role="listbox" aria-label={t.tokens.label} className="min-h-0 overflow-y-auto p-1">
            {groups.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">{t.tokens.none}</p>}
            {groups.map((g) => (
              // biome-ignore lint/a11y/useSemanticElements: listbox options are grouped with role="group"; a fieldset is for form controls.
              <div key={g.group} role="group" aria-labelledby={`${id}-${g.group}`}>
                <p id={`${id}-${g.group}`} className="px-2 pt-2 pb-1 text-xs text-muted-foreground">
                  {t.tokens[g.group]}
                </p>
                {g.group === "files" && filesLoading && !g.items.length && (
                  <p className="satgas-shimmer px-2 pb-1.5 text-sm text-muted-foreground">{t.tokens.loading}</p>
                )}
                {g.items.map((item) => {
                  n += 1;
                  const at = n;
                  return (
                    <div
                      key={`${item.group}:${item.name}`}
                      id={optionId(at)}
                      role="option"
                      tabIndex={-1}
                      aria-selected={at === active}
                      title={item.desc ? `${item.label} · ${item.desc}` : item.label}
                      // The textarea keeps focus, so typing carries on after a click.
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => setActive(at)}
                      onClick={() => pick(item)}
                      onKeyDown={(e) => e.key === "Enter" && pick(item)}
                      className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm aria-selected:bg-accent [&_svg]:size-4"
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{item.icon}</span>
                      <span className={cn("max-w-[65%] shrink-0 truncate", item.group === "files" && "max-w-full font-mono text-[13px]")}>
                        {item.label}
                      </span>
                      {item.desc && (
                        <span className="min-w-0 flex-1 truncate ps-2 text-end text-xs text-muted-foreground">{item.desc}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t px-3 text-[11px] text-muted-foreground">
            <span className="truncate">{t.tokens.hint}</span>
            {open.kind === "/" && (
              <Link
                to="/integrations"
                search={{ tab: "skills" }}
                onMouseDown={(e) => e.preventDefault()}
                className="shrink-0 rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t.skills.manage}
              </Link>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
