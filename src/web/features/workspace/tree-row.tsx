import { ChevronRight } from "lucide-react";
import { type KeyboardEvent, memo, type ReactNode, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// One row grammar for the whole sidebar: 22px rows edge to edge, 12px a level, a 16px chevron column and a 16px icon, so
// names at one depth start on one line whether they are folders or files. Actions show on hover.
const INDENT = 12;
const EDGE = 4;
export const indentOf = (depth: number) => EDGE + depth * INDENT;

export const ROW =
  "relative flex h-[22px] w-full min-w-0 scroll-my-9 items-center pe-2 text-start text-[13px] leading-[22px] hover:bg-muted focus-visible:bg-muted focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring";

// One thin line per level, under each ancestor's chevron, so how deep a row sits reads without counting pixels.
export const Guides = memo(function Guides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: levels have no identity beyond their position.
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/10"
          style={{ insetInlineStart: indentOf(i) + 7 }}
        />
      ))}
    </>
  );
});

export const TreeChevron = ({ open }: { open: boolean }) => (
  <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
    <ChevronRight className={cn("size-3.5", open && "rotate-90")} strokeWidth={1.75} />
  </span>
);

// Arrow keys walk the rows as in any tree: up and down move, right opens or steps in, left closes or steps out.
export function useTreeKeys() {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const rows = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[data-row]") ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const row = rows[at];
    const go = (el?: HTMLButtonElement) => {
      e.preventDefault();
      el?.focus();
    };
    if (e.key === "ArrowDown") return go(rows[at + 1]);
    if (!row) return;
    const expanded = row.getAttribute("aria-expanded");
    if (e.key === "ArrowUp") go(rows[at - 1]);
    else if (e.key === "Home") go(rows[0]);
    else if (e.key === "End") go(rows.at(-1));
    else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (expanded === "false") row.click();
      else if (expanded === "true") rows[at + 1]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (expanded === "true") row.click();
      else
        rows
          .slice(0, at)
          .reverse()
          .find((r) => Number(r.dataset.row) < Number(row.dataset.row))
          ?.focus();
    }
  };
  return { ref, onKeyDown };
}

// A row's actions, on top of its end on hover or keyboard focus, over the hover colour so they cover what sits there.
export const RowActions = ({ children }: { children: ReactNode }) => (
  <span className="absolute inset-y-0 end-0 flex items-center bg-muted pe-1 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100">
    {children}
  </span>
);

interface SectionProps {
  title: string;
  hint?: string;
  icon?: ReactNode;
  // Quiet count at the row's end.
  count?: number;
  actions?: ReactNode;
  depth?: number;
  // A divider over what sits inside rather than a row of the tree: quiet text under a hairline.
  heading?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

// A foldable heading with what belongs under it, like the panes of VS Code's sidebar.
export function TreeSection({ title, hint, icon, count, actions, depth = 0, heading, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn(heading && "mt-1 border-t")}>
      <div className="group/row relative">
        <button
          type="button"
          // A heading is drawn level with what it holds, but the arrow keys still step out to it.
          data-row={heading ? -1 : depth}
          aria-expanded={open}
          title={hint ? `${title} · ${hint}` : title}
          onClick={() => setOpen((v) => !v)}
          className={ROW}
          style={{ paddingInlineStart: indentOf(depth) }}
        >
          <Guides depth={depth} />
          <TreeChevron open={open} />
          {icon}
          <span
            className={cn(
              "shrink-0 truncate",
              heading ? "text-xs text-muted-foreground" : "font-medium",
              icon && "ms-1.5",
              hint && "max-w-[70%]",
            )}
          >
            {title}
          </span>
          {hint && (
            <span className="ms-1.5 min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {heading && <span aria-hidden="true">· </span>}
              {hint}
            </span>
          )}
          {count !== undefined && <span className="ms-auto ps-2 text-[11px] text-muted-foreground tabular-nums">{count}</span>}
        </button>
        {actions && <RowActions>{actions}</RowActions>}
      </div>
      {open && children}
    </section>
  );
}

interface RowProps {
  depth: number;
  icon: ReactNode;
  label: string;
  // Quieter text right after the name, such as a folder.
  trail?: string;
  // At the row's end: a change letter, a time, a count.
  end?: ReactNode;
  title?: string;
  active?: boolean;
  struck?: boolean;
  // Files in a folder tree line up with sibling folders' names, past the chevron column.
  inset?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
}

// A leaf: a pressable row when it opens something, a plain one when it only tells.
export function TreeRow({ depth, icon, label, trail, end, title, active, struck, inset = true, onClick, actions }: RowProps) {
  const body = (
    <>
      <Guides depth={depth} />
      {icon}
      <span className={cn("ms-1.5 min-w-0 truncate", struck && "text-muted-foreground line-through")}>{label}</span>
      {trail && <span className="ms-1.5 min-w-0 flex-1 truncate text-xs text-muted-foreground">{trail}</span>}
      {end && <span className="ms-auto shrink-0 ps-2 text-xs">{end}</span>}
    </>
  );
  const style = { paddingInlineStart: indentOf(depth) + (inset ? 16 : 0) };
  return (
    <li className="group/row relative">
      {onClick ? (
        <button
          type="button"
          data-row={depth}
          aria-current={active ? "true" : undefined}
          title={title}
          onClick={onClick}
          className={cn(ROW, active && "bg-accent")}
          style={style}
        >
          {body}
        </button>
      ) : (
        <div title={title} className={ROW} style={style}>
          {body}
        </div>
      )}
      {actions && <RowActions>{actions}</RowActions>}
    </li>
  );
}

// The tile a row's icon sits in, so names start on one line whatever the icon is.
export const RowIcon = ({ children }: { children: ReactNode }) => (
  <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
    {children}
  </span>
);

export const TreeNote = ({ children, tone }: { children: ReactNode; tone?: string }) => (
  <p className={cn("px-3 py-6 text-center text-xs text-muted-foreground", tone)}>{children}</p>
);

export const TreeLoading = () => (
  <div aria-hidden="true" className="flex flex-col gap-2 px-3 py-2">
    {[60, 45, 70, 50, 65].map((w) => (
      <Skeleton key={w} className="h-3.5" style={{ width: `${w}%` }} />
    ))}
  </div>
);
