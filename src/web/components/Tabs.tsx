import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  idPrefix: string;
  label: string;
  children: ComponentChildren;
}

// WAI-ARIA tabs: arrow keys move and select, only the active tab is in the Tab order.
export function Tabs<T extends string>({ tabs, value, onChange, idPrefix, label, children }: Props<T>) {
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((tab) => tab.id === value);
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const next = tabs[(target + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${next.id}`)?.focus());
  };

  return (
    <>
      <div ref={list} class="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            class="tab"
            aria-selected={tab.id === value}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={tab.id === value ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && <span class="tab-count num">{tab.count}</span>}
          </button>
        ))}
      </div>
      <div
        id={`${idPrefix}-panel`}
        class="inspector-scroll"
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${value}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: APG tabpanel pattern; the panel also scrolls, so it must be keyboard-reachable.
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}
