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
- **Components:** shadcn/ui (`components/ui`).

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
- **Composers** (Home and every board chat, `features/missions/composer.tsx`, `chat-panel.tsx`): the unsent text and
  files survive a reload and stay the same in every open tab (`lib/drafts.ts`: text in localStorage, files in
  IndexedDB, synced by the `storage` event and a BroadcastChannel; key `home` or `board:<id>`). Files come in by drop,
  paste or + → Add files, with no separate upload step, and show as Claude-style tiles above the text (120px on Home,
  96px in the chat): an image thumbnail, or name, line count and a type badge; × on hover (always on touch). While
  files are dragged over, a dashed signal outline says "Drop files to attach". Ten files, 25 MB each; a refusal is one
  toast. Sending uploads them to `/api/uploads`, the run claims them into `<workspace>/attachments/`, the planner and
  every agent get their paths, and the sent message shows them as chips (thumbnail or file name) under the bubble.
- **Images for models that cannot see** (`server/vision.ts`): each gateway model is shown a four-colour probe image once
  (kept in `<dataDir>/vision.json`; Claude and Codex sign-ins always see). Only when an agent's model cannot see does
  the strongest connected frontier model (Claude Opus first, then GPT, then Qwen-VL or GLM-V once proven by the probe;
  never local or small models) describe each attached image into `<image>.md` before planning, cached per image
  content. Blind agents are pointed at the description, the planner gets its text, and every agent is told never to
  guess what it did not open. The composer says so in one quiet line under the tiles ("qwen-max can't see images, so
  Claude Opus reads them first", or that no strong vision model is connected), and the sent message says "Read by …".
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
    task's details), the report (folding, Open report) and "Made on the board" with a mono count: one 28px row per card
    (kind icon in one column, the label truncating on one line, click to center the card; frames, stickies and text
    read their own words, other cards their title), the first four shown and "n more" for the rest. Tables in chat
    markdown keep a column at least one word wide (headers never wrap) and scroll sideways when they must. A task's details
    open with just its title and status; its code, role and agent already show on its node. Its composer is the one
    door: + menu, model picker, send or Stop. A task's or the mission's details take the chat's place until closed.
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
- **The canvas holds outputs, the chat holds talk.** The planner answers a greeting or a question it can answer itself in
  `reply` with no tasks (stored in `run.answers`, shown in the chat, nothing added to the board). There is no automatic
  report card; a round's report stays in the chat.
- **Native cards first.** Agents write ` ```satgas:table|doc|note|code <title> ` blocks in their reply
  (`shared/board-blocks.ts`); the server turns them into real table, doc, note and code cards, and the chat shows the
  reply without them (linked under "Made on the board"). HTML or files are only for requests that want files, a site
  or an app. A ` ```satgas:board ` block is JSON for a whole Miro-style layout (flow, mindmap, grid, kanban or free)
  of stickies, text, shapes, docs, tables, code and images with links between them, framed under its title. Flows that
  never merge and mind maps are tidy trees (each parent centred on its own children); a mind map grows both ways
  from its centre, its branches split in order where the two sides come out closest in height. A flow that merges or
  loops falls back to columns by depth. The frame stands for its contents on the origin thread and in the chat chips.
- **Connectors** float, Miro-style (`floating-edge.tsx`, pure math in `floating.ts`): a card link or origin thread
  leaves and lands on the sides that face each other (side by side joins sideways, stacked joins top to bottom) and
  follows both ends live while they move, so a thread never doubles back over a card. The planner's task route keeps
  its fixed left-to-right sides.
- **Agents** put cards on the board without being asked: images, HTML pages, CSV/TSV sheets and markdown they write
  get their own card, other files a file list, and the final report sits at the end of the route. Agent cards shelve
  under their round's graph (`placeOnShelf`): each takes the highest, then leftmost, free spot on a 2400px-wide shelf,
  so cards of different sizes pack into rows beside each other and never cover tasks, frames (a frame stands for what
  it holds) or other cards. They hang off their task with a faint dashed thread.
- **Cards fit their content:** stickies grow with their text (and widen to 280 before getting tall), tables are as wide
  as their columns (64–240px each, up to 1200) and as tall as their wrapped rows, so nothing is cut. A markdown table's
  rule takes any run of dashes (`:-:`, `:--:`), and pipe rows without a rule are still a table, never CSV. A table's
  sticky header lays the translucent dark muted over the card so scrolled rows never show through. Agents keep what
  they assumed or want to ask in their reply, never on a card, and add no card that only lists what others made.
  - A sticky too long to show even at 280 wide becomes a doc card. Text items are as wide as their words (48px up).
  - Free layouts start where the drawing starts (agents draw at x 1600…) and are spread evenly until no two shapes
    touch, at most 4×; short labels ("YA", "TIDAK") follow the shapes instead of spacing them out, and anything still
    colliding moves down below what it hits.
  - A mind map's centre is the root with the biggest tree; loose notes left unlinked sit underneath.
  - A flow longer than six steps wraps into rows below, like text, instead of one strip thousands of pixels wide.
    Board coordinates are whole pixels, so text never draws blurred at 100%.
  - A pasted test run or command output in a doc/code block stays in the chat as plain code, never a card; tasks feeding
    later tasks keep their findings in their report; a file a second task rewrites keeps its one card (a page reloads).
  - Frames carry hidden, unconnectable handles, so an agent's frame still hangs off its task by the origin thread.
  - The planner adds a final integrate-and-verify task only when parts must run or read as a whole (code, one
    document); independent board pieces are done when they land.
  - Prompts carry the person's browser language (`lang`, BCP 47): short prompts that read as several languages
    ("Test di proyek ini…" is not Italian) are planned and answered in that language.
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

### Sidebar (modelled on VS Code)

Every tab of the left sidebar is built from `workspace/tree-row.tsx`: 22px rows edge to edge in 13px type, 8px a level,
foldable sections, indent guides on hover, row actions on hover, arrow-key navigation. Tabs are plain words with a line
under the chosen one, in a 36px header. New sidebar content uses these, never cards or boxes.

Files open in editor tabs over the canvas (`file-view.tsx`): one tab per file with a breadcrumb under them, kept when going
back to the canvas, gone when leaving the board. The code fills the view and scrolls past its last line.

**Undoing files always asks.** Every revert goes through `useRevert` (`workspace/revert-dialog.tsx`): one confirmation, and a
second if later edits would be lost. Never call `revertFiles` elsewhere.

**Configurations** is a submenu in the sidebar (Settings, Usage, About), a menu when the sidebar is folded to icons, and in ⌘K. Settings has the tabs General and Security; Usage has Cost, Tokens, Limits and Storage; the tab lives in the URL. Connectors, providers, models, skills and tools stay in Integrations, so each thing has one home. Theme and language moved here from the sidebar footer and stay in ⌘K. Usage follows the person's reference: Cost, Tokens and Limits. Cost is labelled API estimate and comes from Claude Code's own `costUSD`; Codex and gateway models read Unpriced, never $0. Limits come from Claude Code's `rate_limit_event` with when they were last seen. A task that reported no tokens is named as unknown, never counted as zero. Storage only cleans what can be made again (`node_modules`, `.next`, `.venv` and the like, never `dist`) in a board's own finished workspace, never a folder the person picked.

**Channels** (Integrations → Channels): chat apps are another door to the same boards. A stranger gets no reply, private chats only, a secret is never asked for in a chat, risky actions keep their OK, and one status message is edited instead of many being sent. WhatsApp always credits zaileys with a link to its repo. Channels and paired people use the same equal-height card grid as Connectors and Agents; the token form, QR and pairing code all open in dialogs, so the grid never changes shape.

**Nothing an agent does is hidden.** A running task opens by itself and shows one row per action, newest last: what it read
(file name first, because a long path would cut off the part that says what it is), viewed, ran, searched, opened, called, and
thought. Each row opens to its whole text. What the lead or a task was handed without a tool call (canvas, cards, files, other
tasks' results, memory, secrets) is logged as rows too, worded as what it is ("Has the file", not "Read"), because a task is
not always going to open what it was given. A finished task folds to a count; the lead's reading folds to one line.

**Secrets stay out of chat.** An agent's `request_secret` shows `SecretCard`: the label, why, the field with the agent's hint
and Save securely on one line, then the 24-hour promise and a quiet Decline. Once answered it becomes one line
(`✓ label · Saved securely and kept private`). The value only ever lands in a 0600 file; agents get the path.

### Drawing tools (modelled on Excalidraw)

- **Making things:** a click drops a kind's default size; a drag draws it. Shift keeps a box square and locks a line to
  15° steps; Alt draws from the centre. The outline shows while dragging (`CreateLayer`). After making something the tool
  returns to Select, unless the tool is kept with Q.
- **Keys:** V select, H hand, N note, T text, R/D/O rectangle, diamond, ellipse (S the shape tool), A arrow, L line,
  P/X pen, E eraser, F frame, Q keep tool. A new shape does not open its label, so the next tool key stays a tool key.
- **Lines:** both ends on cards make a connector that follows them (`Connector.arrow` for the head); anywhere else a
  `drawing` card with `line`, so eraser, layers and menus work unchanged.
- **Snapping:** dragging lines cards up with the edges and centres of what is in view (`snapBox`, 8px over zoom), with
  one-pixel accent guides. ⌘ lets a card go anywhere; grid snap, when on, replaces it.
- **Look:** the selection toolbar's Style panel (`style-panel.tsx`) shows only what the picked cards can wear (`wears` in
  `edit.ts`): color, fill, stroke width, dash, line feel, arrowhead, opacity. Sketchy lines come from Rough.js, seeded by
  the card's id so they never jitter, loaded on demand (`use-rough.ts`).
- **Pen:** coalesced pointer events, real stylus pressure, smoothed quadratic outlines (`stroke.ts`).
- **Threads:** only the lead's reporting lines always show. A card names its maker on its label; the thread back to them
  appears when the card or person is selected. "Waiting for X" on a task replaces hand-off lines.

## Status

Told by icon shape first, color second (`components/status.tsx`): dashed ring = waiting, spinner = running, check =
done, alert = failed, slashed ring = skipped, stop = cancelled. Running uses `signal-ink`, done emerald, failed
`destructive`. Waiting nodes are dashed; skipped and cancelled are dashed and faded; a failed node shows its reason.
Text for work still in progress wears `satgas-shimmer` (a slow light sweep, off under reduced motion): the planning
line, a running task's title in the chat and on its node, the running status label, and the newest activity summary
of a running task. Only live text shimmers; nothing finished or decorative does.

## Performance

Every change ships optimized (SOP: memory `satgas-perf-sop`). The board must stay light at hundreds of cards:

- **Loaded on demand:** the board route carries the chat only (30 kB gzip). The canvas (React Flow), widgets, right-click
  menu (fetched when idle), details panel, card export and sketch library are their own chunks. Chat Only without cards
  never loads React Flow. A jump into a canvas that has not loaded goes through `landOnCard`, never a fixed delay.
- **Threads cost nothing when hidden:** the behind-card masks only exist while a thread is showing. A person's ink has no
  handles. Long lists page or fold: the Outline by 40, a plan's task rows after 8, with urgent tasks always out.
- **Ink stays DOM for now (measured 2026-11-05, dev, main thread per step):** 500 strokes 7 ms pan, 2,000 strokes 14 ms pan
  and 19 ms zoom, load under a second. A canvas layer for ink is only worth building well past 2,000 strokes on screen.

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
- Floating connectors read their two nodes through `useInternalNode` (one shallow-compared store slice each), so only
  the threads of a moving card redraw. Drag work per step, production: 1.7 ms average, 3.1 ms worst on the bench
  board (272 nodes and 69 threads on screen); release 6–8 ms, the same with one thread or five.

## Patterns

- **One door:** anything an agent can do is asked for in the prompt bar. A follow-up prompt plans a new round to the
  right of the board, threaded onto the last one, with earlier reports and people's sticky notes as context.
- **Scaling actions:** actions that are not prompts go into the right-click menu, the title pill's ⋯ menu, the board
  tool pill or the command menu (⌘K), never into new chrome; every board action has a shortcut that works. Shared mission behavior lives in `src/web/lib/actions.ts`.
- **Sign-in:** any API answer that asks for sign-in swaps the app for one quiet screen (wordmark, `brand-title` h1,
  password field, one button, help with the token sources as inline code). Sign out lives in ⌘K. Satgas may be on a
  VPS, so never treat a route or screen as "local only".
- **Links out:** every link that leaves Satgas is `OutboundLink` or `openExternal`
  (`src/web/components/outbound-link.tsx`): a new tab, no opener, and `ref=` + `REF` (`src/web/lib/links.ts`) on the address while the visible text
  stays as written. Bare URLs in plain text render through `LinkedText`. Never write `target="_blank"` or `window.open`
  by hand; `tests/web/outbound-links.test.ts` fails on it.
- **Disabled actions explain themselves** inline (a note under the menu item), never only in a tooltip.
- **Panel tabs:** Mission: Overview · Report · Planner. Task: Activity · Report · Brief. Failures sit above the tabs.
- **States:** every async surface has a loading shape that matches the result, an empty state and an error with a
  retry. Destructive actions go through `ConfirmDialog`, which stays open and shows the error if the action fails.
- **Copy** lives in `src/web/i18n.ts`, English and Bahasa Indonesia, sentence case, no exclamation marks. Commands, flags,
  paths, env vars, model ids and endpoints are wrapped in backticks and rendered as inline code by `RichText`, including in
  server error messages; never leave them as plain text. The
  container is a "board"; the prompt is the "mission".
