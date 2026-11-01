import { useSignal } from "@preact/signals";
import { Fragment } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  id: string;
  label: string;
  icon: IconName;
  onSelect: () => void;
  // A disabled item stays visible and says why, instead of vanishing or hiding the reason in a tooltip.
  disabledReason?: string;
  danger?: boolean;
  separatorBefore?: boolean;
}

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const open = useSignal(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabledItems = () => [
    ...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []),
  ];

  const close = (returnFocus: boolean) => {
    open.value = false;
    if (returnFocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open.value) return;
    enabledItems()[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open.value]);

  const onMenuKey = (e: KeyboardEvent) => {
    const all = enabledItems();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (n: number) => all[(n + all.length) % all.length]?.focus();
    const keys: Record<string, () => void> = {
      ArrowDown: () => focus(i + 1),
      ArrowUp: () => focus(i - 1),
      Home: () => focus(0),
      End: () => focus(all.length - 1),
      Escape: () => close(true),
      Tab: () => close(false),
    };
    const action = keys[e.key];
    if (!action) return;
    if (e.key !== "Tab") e.preventDefault();
    // Keep Escape from also closing the inspector behind the menu.
    e.stopPropagation();
    action();
  };

  return (
    <div class="menu-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        class="icon-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open.value}
        aria-controls={open.value ? menuId : undefined}
        onClick={() => {
          open.value = !open.value;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            open.value = true;
          }
        }}
      >
        <Icon name="more" />
      </button>
      {open.value && (
        <div id={menuId} ref={list} class="menu" role="menu" aria-label={label} tabIndex={-1} onKeyDown={onMenuKey}>
          {items.map((item) => (
            <Fragment key={item.id}>
              {item.separatorBefore && <hr class="menu-sep" />}
              <button
                type="button"
                role="menuitem"
                class={`menu-item${item.danger ? " is-danger" : ""}${item.disabledReason ? " has-note" : ""}`}
                aria-disabled={item.disabledReason ? true : undefined}
                onClick={() => {
                  if (item.disabledReason) return;
                  close(true);
                  item.onSelect();
                }}
              >
                <Icon name={item.icon} class="menu-icon" />
                <span class="menu-item-text">
                  <span>{item.label}</span>
                  {item.disabledReason && <span class="menu-item-note">{item.disabledReason}</span>}
                </span>
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
