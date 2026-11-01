# Satgas interface system

Source of truth for UI decisions. Satgas is canvas first: every mission lives on a board that agents fill and
people can rearrange. The chrome stays quiet so the board carries the color. Tokens live in
`src/web/styles/theme.css`, canvas styles in `src/web/styles/index.css`.

## Direction

- **Product:** one prompt becomes a board: agents plan the work, run it, and put what they produce on the canvas.
- **Character:** calm, exact, quietly alive.
- **World:** a whiteboard on a night-shift mission desk, a route map with signal lights.
- **Moment:** the board filling up: tasks lighting along the route, then pages, tables and images appearing.
- **Signature:** the live route. The edge feeding a running task animates in the signal color and the running node
  carries a slow signal sweep around its edge. Nothing else uses the signal color except the Launch button.

## SOP

Every screen meets four words: **compact, minimalist, elegant, modern**. Dense like Claude.ai or Linear, quiet
graphite chrome, one amber accent, no decoration. Build on the existing shadcn/ui primitives and fix gaps in the
primitive itself. Menus only list things that work. Check every change rendered, in dark and light, before it ships.

**Compact scale** (built into `components/ui`, so screens inherit it):

| Thing                                                  | Size                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Toolbar controls: search, tabs, segmented, filter, Add | 28px (`h-7`, Button `sm` / `icon-sm`)                                           |
| Form fields, settings rows, default buttons            | 32px (`h-8`)                                                                    |
| Leading action                                         | 36px (`lg`), rare                                                               |
| Text / meta                                            | 14px / 12px muted, counts mono `tabular-nums`                                   |
| Icons                                                  | 16px                                                                            |
| Radius                                                 | controls 8, menu items 6, cards and menus 12, dialogs 16                        |
| Menus                                                  | `p-1`, 28px rows, counts right, selected = check on the right, inset separators |
| Cards                                                  | `p-4`, 48px logo tile, `gap-4`; grids `gap-3`                                   |

**Brand font (Sora 600, -0.03em, the `brand-title` utility) is used only for:** the wordmark, the home headline and the
one `h1` title of every page (Integrations, a connector or agent detail, and any page added later). Section headings,
labels, buttons, menus, cards and body text stay Inter. The page header is sticky and turns
solid with a hairline only once the page scrolls.

## Base

- **Color:** one neutral graphite ramp in light and dark. `--signal` (amber) is the only accent; `--signal-ink` is its
  readable shade for icons and edges on light surfaces. Semantic green and red only mean done and failed. Sticky
  notes are the one paper-tinted surface, because they are content.
- **Type:** Inter Variable, weights 400 and 500 (600 only inside markdown). Mono for codes, paths, logs and timers;
  changing numbers use `tabular-nums`.
- **Components:** shadcn/ui (`components/ui`) and React Flow UI's `BaseNode`/`BaseHandle` (`components/flow`).

## Screens

- **Home** (`features/home`), in the sidebar shell: a centered hero on the boards' line grid (fading out under the
  prompt): the title, one line, the composer (radius 20, soft neutral shadow, pill Launch) and starter pills. Below,
  recent boards as a card grid; each card draws its board in miniature from the summary's `preview` (tasks, route,
  cards) so a board is recognizable by its shape. Six shown, "Show all" for the rest.
- **Integrations** (`features/integrations`), in the sidebar shell: one `max-w-5xl` column under the page title, then a
  28px toolbar: plain-word tabs (Connectors · Agents); on Connectors also the Yours/Discover segmented control (Yours
  carries a mono count), search, a filter icon (categories and setup needs with counts, a check on the chosen row,
  a signal dot and "Filter, n active" while filtering) and an Add menu.
  - Cards sit in a two-column grid (`gap-3`): `bg-muted/50`, `p-4`, a 48px `LogoTile` with the real colored mark,
    name, one-line description and the action on the right. Section headings carry a plain mono count.
  - Discover lists the catalog (+ to add, a check once added; a connector that needs a key opens the key dialog).
    Yours lists what is added: switch and ⋯ Edit/Remove; custom servers show their command in mono. A server counts as
    a catalog entry only through its `catalogId` (older ones: same name and command). An empty Yours is a card with
    Discover connectors and Add a custom connector.
  - Agents shows agent cards (provider · model · effort, the detected CLI version, the task switch), then the
    providers grid with Check again; a failed check shows an inline error with Retry.
  - A connector or agent opens its own page: back link, 64px tile, the page title, the action (Add/Connect, or Added
    with switch and Remove), a hairline, then the story and its sections beside a 15rem facts column. Agent settings are
    rows with the label left and a 224px (`w-56`) control right; risky choices show a warning under their row.
  - Saved keys and env/header values never reach the page: the API sends `••••`, and a mask sent back keeps the
    stored value. Fields show the mask and only send a value someone types.
- **Board** (`features/missions/mission-page.tsx`, `features/board`), full screen with no sidebar:
  - top left: the title pill: logo back to Home, status, the board's emoji icon (frimousse picker, data served
    locally from `/api/emojibase`), name, Export (PDF via print, PNG via `html-to-image`, tables as CSV, JSON backup)
    and ⋯ (Details, Copy report, Run again on a new board, Delete board)
  - top right: the presence pill (agents with their real marks, ringed in the signal while working), Search and the
    chat toggle
  - left: the tool column (Select V, Pan H, Sticky N, Text T, Shape S, Pen P, Frame F, Insert +) plus undo/redo; the
    active tool opens a second column with its options (note colors; shape kinds and colors; pen, highlighter, eraser
    and ink colors)
  - right: the chat panel, open by default, Miro-style: each round shows the prompt (folding after five lines), its
    tasks with status and agent (each opens inline to the agent's own words, with runs of tool calls folded into one
    summary row such as "Changed 3 files and ran 2 commands" that expands to each command, file or lookup; ↗ opens the
    task's details), the report (folding, Open report) and chips for cards the agents made (click to
    center the card). Its composer is the one door: + menu, model picker, send or Stop. A task's or the mission's
    details take the chat's place until closed.
  - bottom right: the zoom pill (fit, −, percent, +)

## The board

- **Cards** (`shared/board.ts`): note, doc (markdown), table, image, preview (a live page in a sandboxed iframe), code,
  files, drawing, text, shape (rect, ellipse, diamond, triangle) and frame. Colors are named (`COLORS`) and drawn per
  theme in `features/board/palette.ts`. Frames sit under everything and keep their layer when selected. Person-made
  notes, text, shapes, frames, docs, tables (one row per line, cells split by commas; a quoted cell keeps its commas)
  and code edit in place on double-click or Enter; an edit cut short by scrolling away or zooming out is saved, one on
  a card deleted elsewhere is reported. Agent-made docs mirror files and open to read. The expanded view follows the
  live card and closes when it is deleted. A card's title sits above it; a lone selected
  card adds quick open actions (expand, open in a tab) and resize handles; a multi-selection shows rings only. There is no
  inline delete: card actions live in the right-click menu. A locked card shows a lock glyph by its title. Connector dots
  show on hover.
- **Right-click menu** (`features/board/board-menu.tsx`, actions in `board-actions.ts`, pure edits in `edit.ts`): one
  menu per target, built on the compact dropdown primitives, groups split by inset hairlines, shortcuts right-aligned.
  - Cards: Edit/Expand/Open · Cut/Copy/Paste/Duplicate · Copy as PNG/Copy style/Paste style · Color ▸, Group/Ungroup,
    Wrap in frame, Select contents (frames), Align ▸ (align, distribute, tidy up), Arrange ▸ · Flip (ink), Lock,
    Zoom to selection · Delete.
  - Tasks: Open details, Copy report, Zoom to selection. Empty board: Paste, Add ▸ (at the click point), Select all,
    Fit, 100%, Show grid, Snap to grid, Copy as PNG, Export ▸. A connector a person drew: Delete.
  - Text fields and highlighted text keep the browser's own menu. Every item has a working shortcut (`shortcuts.ts`,
    read from `event.code`): ⌘D duplicate, ⌘G/⇧⌘G group, ⌘]/⌘[ and ⌥⌘]/⌥⌘[ arrange, ⇧⌘L lock, ⌥A/H/D/W/V/S align,
    ⌥⇧H/V distribute, ⌥⌘C/⌥⌘V style, ⌥⇧C copy as PNG, ⇧H/⇧V flip, ⇧1 fit, ⇧2 selection, ⇧0 100%, ⌘' grid, ⇧⌘' snap.
- **Groups and frames:** cards sharing `group` select and move as one (a dashed outline marks a selected group) and
  line up as one box in Align. Dragging a frame carries every unlocked card and task wholly inside it. Copied cards
  travel as tagged JSON text (`satgas/cards`) and are sanitized like server input; any other pasted text becomes a note,
  or a doc when long.
- **Agents** put cards on the board without being asked: images, HTML pages, CSV/TSV sheets and markdown they write
  get their own card, other files a file list, and the final report sits at the end of the route. Agent cards shelve
  under the graph and hang off their task with a faint dashed thread.
- **People** can move, resize, connect and delete anything, add notes, draw, and drop or paste images. Every change
  is an op (`put`, `patch`, `delete`, `link`, `move`) applied optimistically, saved by the server and broadcast to
  other tabs; undo replays the inverse ops. A patch removes a field by setting it to undefined; over the wire it travels
  as `null` (`toWire`), because JSON drops undefined and the removal would otherwise never reach the server.
- **Keyboard:** arrows pan, `+`/`-` zoom, `0` fits, Enter opens the focused task or card, Delete removes the selection.
  With a note, text, shape or frame tool picked, Enter on the board places one in the middle of the view; a click places
  it anywhere, on top of a card or frame too. Board keys, undo and the clipboard act only while focus is on the board,
  its toolbar or nowhere, never from the chat or a panel; a closing panel hands focus back to the board.
- **Drawing layers** (pen, highlighter, eraser) sit above React Flow's zoom pane, so they pan and pinch-zoom the board
  themselves with the same math as `panOnScroll`. Switching tools mid-stroke drops the stroke and restores what the
  eraser had marked.
- **Images** show an "Adding…" toast that turns into the result; a drop, paste or pick with no image says only images
  can be added.

## Status

Told by icon shape first, color second (`components/status.tsx`): dashed ring = waiting, spinner = running, check =
done, alert = failed, slashed ring = skipped, stop = cancelled. Running uses `signal-ink`, done emerald, failed
`destructive`. Waiting nodes are dashed; skipped and cancelled are dashed and faded; a failed node shows its reason.
Text for work still in progress wears `satgas-shimmer` (a slow light sweep, off under reduced motion): the planning
line, a running task's title in the chat and on its node, the running status label, and the newest activity summary
of a running task. Only live text shimmers; nothing finished or decorative does.

## Performance

Every change ships optimized (SOP: memory `satgas-perf-sop`). The board must stay light at hundreds of cards:

- Nodes are `memo`'d, node objects are reused from a keyed cache, and per-card state (editing, solo) rides on node
  data, so the board context never changes and never re-renders every card.
- `onlyRenderVisibleElements` keeps only what is on screen in the DOM; an export flips it off for two frames.
- Below `DETAIL_ZOOM` (40%) heavy cards (doc, table, code, preview, files) draw as one-element placeholders; the switch
  is `useDeferredValue` with a placeholder first, so detail fills in without blocking a pan or zoom.
- Iframes and images load lazily; markdown parses are memoized per text; saved stroke outlines are cached per points
  array; the live stroke appends in place inside its own layer; the zoom pill subscribes to a rounded percentage.
- Rarely used heavy code loads on demand: `html-to-image` on first export, the emoji picker when the board icon opens.
- **Bench:** `bun scripts/bench-board.ts` writes a 36-task, 470-card board to `/tmp/satgas-bench`; run
  `SATGAS_DATA_DIR=/tmp/satgas-bench SATGAS_PORT=4318 SATGAS_WEB_PORT=5318 bun run dev`, open `/boards/bench0001`
  (production build: `bunx vite build`, then port 4318) and drive 120 wheel-pan and 120 ctrl-wheel frames from the
  page, recording fps, p95, worst frame, long frames (>50 ms), DOM size, node and iframe counts. Compare before and after,
  warm run, same mode. Reference (dev, fit view): before 48 fps pan, 9,505 elements, 8 iframes; after 60 fps pan
  (p95 17 ms), ~3,500 elements, 0 iframes. Board chunk ~300 kB (93 kB gzip).

## Patterns

- **One door:** anything an agent can do is asked for in the prompt bar. A follow-up prompt plans a new round to the
  right of the board, threaded onto the last one, with earlier reports and people's sticky notes as context.
- **Scaling actions:** actions that are not prompts go into the right-click menu, the title pill's ⋯ menu, the board
  tool pill or the command menu (⌘K), never into new chrome; every board action has a shortcut that works. Shared mission behavior lives in `src/web/lib/actions.ts`.
- **Sign-in:** any API answer that asks for sign-in swaps the app for one quiet screen (wordmark, `brand-title` h1,
  password field, one button, help with the token sources as inline code). Sign out lives in ⌘K. Satgas may be on a
  VPS, so never treat a route or screen as "local only".
- **Disabled actions explain themselves** inline (a note under the menu item), never only in a tooltip.
- **Panel tabs:** Mission: Overview · Report · Planner. Task: Activity · Report · Brief. Failures sit above the tabs.
- **States:** every async surface has a loading shape that matches the result, an empty state and an error with a
  retry. Destructive actions go through `ConfirmDialog`, which stays open and shows the error if the action fails.
- **Copy** lives in `src/web/i18n.ts`, English and Bahasa Indonesia, sentence case, no exclamation marks. Commands, flags,
  paths, env vars, model ids and endpoints are wrapped in backticks and rendered as inline code by `RichText`, including in
  server error messages; never leave them as plain text. The
  container is a "board"; the prompt is the "mission".
