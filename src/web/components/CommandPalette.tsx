import { useComputed, useSignal } from "@preact/signals";
import { Fragment } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { RunStatus } from "../../shared/types";
import { cancelMission, copyReport, finalReport, isLiveRun, requestDelete, runAgain } from "../actions";
import { fmtAgo, modKey, t } from "../i18n";
import { openRun, run, runs } from "../state";
import { fitRequest, paletteOpen, theme, toggleSidebar, toggleTheme } from "../ui";
import { Icon, type IconName, StatusGlyph } from "./Icon";

interface Command {
  id: string;
  group: "actions" | "missions";
  label: string;
  keywords?: string;
  icon?: IconName;
  status?: RunStatus;
  hint?: string;
  run: () => void;
}

const MAX_MISSIONS = 30;

function buildCommands(): Command[] {
  const r = run.value;
  const actions: Command[] = [
    { id: "new", group: "actions", label: t.newMission, icon: "plus", hint: "N", run: () => openRun(null) },
    {
      id: "theme",
      group: "actions",
      label: theme.value === "night" ? t.themeChart : t.themeNight,
      keywords: "theme dark light night chart tema",
      icon: theme.value === "night" ? "sun" : "moon",
      run: toggleTheme,
    },
    { id: "sidebar", group: "actions", label: t.toggleSidebar, icon: "sidebar", hint: `${modKey} \\`, run: () => toggleSidebar() },
  ];
  if (r?.nodes.length) {
    actions.push({ id: "fit", group: "actions", label: t.fitCanvas, icon: "fit", run: () => (fitRequest.value += 1) });
  }
  if (r && isLiveRun(r))
    actions.push({ id: "cancel", group: "actions", label: t.cancelMission, icon: "stop", run: () => cancelMission(r) });
  if (r && !isLiveRun(r)) {
    actions.push({ id: "rerun", group: "actions", label: t.runAgain, icon: "rerun", run: () => runAgain(r) });
    if (finalReport(r)) actions.push({ id: "copy", group: "actions", label: t.copyReport, icon: "copy", run: () => copyReport(r) });
    actions.push({ id: "delete", group: "actions", label: t.deleteMission, icon: "trash", run: () => requestDelete(r) });
  }
  const missions: Command[] = (runs.value ?? []).slice(0, MAX_MISSIONS).map((m) => ({
    id: `mission-${m.id}`,
    group: "missions",
    label: m.title ?? m.prompt,
    keywords: `${m.prompt} ${m.cwd}`,
    status: m.status,
    hint: fmtAgo(m.createdAt),
    run: () => openRun(m.id),
  }));
  return [...actions, ...missions];
}

function matches(cmd: Command, query: string) {
  const hay = `${cmd.label} ${cmd.keywords ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

// Frequent action: opens and filters instantly, with no animation in the way.
export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const query = useSignal("");
  const active = useSignal(0);
  const results = useComputed(() => (paletteOpen.value ? buildCommands().filter((c) => matches(c, query.value)) : []));

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (paletteOpen.value && !el.open) {
      query.value = "";
      active.value = 0;
      el.showModal();
      input.current?.focus();
    } else if (!paletteOpen.value && el.open) el.close();
  }, [paletteOpen.value]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active.value]);

  const execute = (cmd: Command | undefined) => {
    if (!cmd) return;
    paletteOpen.value = false;
    cmd.run();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const count = results.value.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (count) active.value = (active.peek() + (e.key === "ArrowDown" ? 1 : -1) + count) % count;
    } else if (e.key === "Enter") {
      e.preventDefault();
      execute(results.value[active.peek()]);
    }
  };

  const list = results.value;
  const optionId = (i: number) => `palette-option-${i}`;

  return (
    <dialog
      ref={dialog}
      class="palette"
      aria-label={t.search}
      onClose={() => {
        paletteOpen.value = false;
      }}
      onPointerDown={(e) => {
        // A press on the backdrop lands on the dialog element itself; Escape is the keyboard path.
        if (e.target === dialog.current) paletteOpen.value = false;
      }}
    >
      <div class="palette-search">
        <Icon name="search" />
        <input
          ref={input}
          class="palette-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={list.length ? optionId(active.value) : undefined}
          placeholder={t.searchPlaceholder}
          value={query.value}
          spellcheck={false}
          onInput={(e) => {
            query.value = e.currentTarget.value;
            active.value = 0;
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div id="palette-list" ref={listRef} class="palette-list" role="listbox" aria-label={t.search}>
        {list.length === 0 && (
          <div class="palette-empty" role="presentation">
            {t.paletteEmpty}
          </div>
        )}
        {list.map((cmd, i) => (
          <Fragment key={cmd.id}>
            {(i === 0 || list[i - 1]?.group !== cmd.group) && (
              <div class="palette-group overline" role="presentation">
                {cmd.group === "actions" ? t.paletteActions : t.paletteMissions}
              </div>
            )}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection lives in the combobox input (aria-activedescendant). */}
            <div
              id={optionId(i)}
              class="palette-option"
              role="option"
              tabIndex={-1}
              aria-selected={i === active.value}
              onPointerMove={() => {
                if (active.peek() !== i) active.value = i;
              }}
              onClick={() => execute(cmd)}
            >
              {cmd.status ? <StatusGlyph status={cmd.status} size={16} /> : cmd.icon && <Icon name={cmd.icon} class="palette-icon" />}
              <span class="palette-option-label">{cmd.label}</span>
              {cmd.hint && <span class="palette-option-hint">{cmd.hint}</span>}
            </div>
          </Fragment>
        ))}
      </div>
      <div class="palette-foot" aria-hidden="true">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t.paletteNavigate}
        </span>
        <span>
          <kbd>↵</kbd> {t.paletteRun}
        </span>
        <span>
          <kbd>esc</kbd> {t.paletteClose}
        </span>
      </div>
    </dialog>
  );
}
