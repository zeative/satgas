# Satgas interface system

Source of truth for UI decisions. Tokens live in `src/web/styles.css`; this file records the why and the measurements.

## Direction

An operations chart, not a dashboard. Paper and ink carry structure. Magenta is the **active route**
(aviation's "magenta line") and only marks what is live right now: running tasks, the leg feeding them,
busy agent slots, focus. Everything else is ink on paper.

- Two themes, same hierarchy: **Chart** (warm daylight paper) and **Night** (instrument panel after dark).
  Default follows the OS; the topbar toggle stores an explicit choice in `localStorage["satgas.theme"]`.
- Status is told by glyph shape first, color second (dashed ring = waiting, spinning arc = running,
  filled check = done, filled alert = failed, slashed ring = skipped, ring + square = cancelled).

## Tokens (named for the world)

| Group     | Tokens                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| Surfaces  | `--paper`, `--paper-raised` (objects on the chart), `--paper-overlay` (menus, dialogs), `--paper-sunk` (inputs, tracks) |
| Text      | `--ink` (primary), `--ink-2` (body), `--ink-3` (meta), `--ink-4` (disabled, timestamps)                                 |
| Structure | `--rule-soft`, `--rule`, `--rule-strong` (low-alpha, never solid hex)                                                   |
| Meaning   | `--route` (live), `--terrain` (connected), `--hazard` (failure, destructive)                                            |
| Canvas    | `--graticule`, `--graticule-major` (28px minor grid, major every 4th line)                                              |

Never introduce a raw hex in a component; add or reuse a token.

## Depth

Hairline rules for structure; a soft `--lift` (1px ring + two faint shadows) for objects that sit on the
chart (nodes, the brief card, active list item). Night collapses lift to a ring. Overlays use `--lift-overlay`.
Do not mix in heavy shadows or gradients.

## Type

IBM Plex Sans (variable) + IBM Plex Mono, self-hosted via `@fontsource`. Scale ~1.2 from a 13px tool body:
`11 micro · 12 meta · 13 body · 14 read · 16 title · 20 heading · 30 display`.
Hierarchy comes from weight + ink level before size. Headings get negative tracking (−0.01 to −0.025em).
Mono is for data: task codes (`T-01`), timestamps, paths, the status bar, logs. Numbers that change use
`.num` (tabular figures).

## Space and size

4px rhythm (`--sp-1` 4 … `--sp-12` 48). Radius scale `4 / 6 / 10 / 14` (kbd · controls · nodes/cards · dialogs/brief).

| Element                      | Measurements                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Topbar / status bar          | 48px / 28px                                                                          |
| Sidebar / inspector          | 248px / 384px (340px under 1180px)                                                   |
| Button                       | 32px h · 12px pad (16px primary) · 6px radius · 13px/500                             |
| Compact button / icon button | 28px                                                                                 |
| Node                         | 232 × 88 · 14px side pad · 10px radius · code + state row, title 13.5/600, meta 11px |
| Inspector                    | 20px pad; tabs are a sunk segmented control, 26px tabs                               |

## Weight

- **W1** (one per screen): ink-filled `.btn-primary` (Launch). Magenta is never used to make a button stand out.
- Secondary: `.btn-secondary` (raised + lift). Tertiary: `.btn-ghost`. Destructive: `.btn-danger` only inside the confirm dialog.

## Patterns

- **Scaling actions:** new features go into the command palette (⌘K) and the mission `⋯` menu, not new chrome buttons.
  Shared behavior lives in `src/web/actions.ts` so palette, menu and shortcuts stay identical.
- **Disabled actions explain themselves** inline (menu item note), never only in a tooltip.
- **Inspector** = tabs. Mission: Overview · Report · Planner. Task: Activity · Report · Brief. The tab follows the
  natural focus (planner → overview → report) until the user picks one. Failures sit above the tabs, never inside.
- **Logs** are a comms log: mono 11.5px, 60px timestamp column, tool lines in `--ink-3`, errors in `--hazard`.
- **Overlays** use native `<dialog>` (focus trap, Escape, inert background). Menus implement the full menu keyboard contract.
- **Motion:** `--ease-out` cubic-bezier(0.23, 1, 0.32, 1); 120ms press, 180ms micro, 240ms panel. The palette has no
  animation (frequent action). Reduced motion zeroes durations and freezes the route animation into a solid magenta line.
