# Satgas board reference

Everything here matches what Satgas actually parses. A block it cannot read still reaches the board, as a doc showing the raw text, so a broken block is visible but useless; follow the shapes below exactly.

## Simple blocks

| Block | Body | Becomes |
| --- | --- | --- |
| `satgas:table <title>` | a markdown table (first row is the header) or CSV | a table card sized to its content |
| `satgas:doc <title>` | markdown | a doc card |
| `satgas:note` | a few short lines | a sticky; a long note turns into a doc on its own |
| `satgas:code <file name>` | the code | a code card; the file name sets the highlighting |
| `satgas:board <title>` | JSON, described below | a framed layout of cards and connectors |

Text you write inside a table block around the table moves to the chat. A doc or code block that is really a test run or a log goes back to the chat as plain code.

### Tables that read well

- Up to about 8 columns. Split a wide dataset into two tables or move detail to a doc.
- Units in the header (`Revenue (IDR m)`, `Duration (s)`), never repeated in every cell.
- One number format per column, aligned the same way: `1,250` or `1.250`, not both.
- A totals or average row only when it means something, and computed, not guessed.
- Sort by what the person cares about: the biggest, the soonest, the cheapest.

### Docs that read well

- Start with the answer or the summary, then the detail.
- `##` headings, short paragraphs, lists for parallel items, tables for numbers.
- One doc per document. A long piece becomes several docs, or a board block holding several `doc` items.

## Board blocks

```json
{
  "layout": "flow | mindmap | kanban | grid | free",
  "columns": 3,
  "items": [{ "id": "a", "kind": "note", "text": "…" }],
  "links": [["a", "b"]]
}
```

- Strict JSON: double quotes, no comments, no trailing commas.
- `layout` defaults to `flow` when there are links and to `grid` when there are none. `columns` only matters for `grid`.
- At most 60 items and 100 links per board block. More than that: split into two boards.
- A link is `["from", "to"]` or `{"from": "a", "to": "b"}`. Both ids must exist; a link to itself is dropped. Links are drawn as connectors.

### Items

| Field | For | Meaning |
| --- | --- | --- |
| `id` | all | your key for links; any short string, unique in the block |
| `kind` | all | `note` (default), `text`, `shape`, `doc`, `table`, `code`, `image` |
| `text` | note, text, shape, doc, code | the content; markdown in `doc` |
| `title` | doc, table, code, image | the card's title; for `code` the file name |
| `color` | note, shape | `yellow`, `orange`, `pink`, `purple`, `blue`, `green`, `gray`, `ink` |
| `shape` | shape | `rect` (default), `ellipse`, `diamond`, `triangle` |
| `rows` | table | an array of rows, first row the header: `[["Name","Score"],["Ana","9"]]` |
| `column` | kanban | the column the item belongs to |
| `src` | image | an `https://` URL, or a path in the working directory such as `charts/q1.png` |
| `x`, `y` | free | position in pixels |

Sizes Satgas gives cards, useful for free layouts: a sticky is 200 wide and grows with its text, a shape 180×96, a diamond 200×120, a doc 340 wide, code 400 wide, an image 320×220. A `text` item is as wide as its words.

### Colour means something

Pick colours for meaning, the same way across a board, and leave most items in their default.

| Colour | Use for |
| --- | --- |
| `green` | start, success, done, recommended |
| `blue` | a normal step or element (the default for shapes) |
| `purple` | a decision, a question, an idea to explore |
| `orange` | a warning, something that needs attention |
| `pink` | a problem, a risk, a failure path |
| `yellow` | a sticky note (the default for notes) |
| `gray` | out of scope, later, inactive |
| `ink` | the one item that must stand out |

### Writing items

- A sticky holds one idea in a few words, three short lines at most. More than that belongs in a `doc` item.
- Shapes carry short labels: "Payment", "Paid?", "Send receipt".
- A `text` item of a word or two ("Yes", "No", "Later") labels a branch.
- Use `doc`, `table` and `code` items when a layout needs real content inside it, like a plan with its budget table next to the steps.

## Layouts

### flow: steps and decisions

Follows the links from left to right. When every item has one way in, the flow becomes a tidy tree with no crossing lines; when paths merge or loop, items line up in columns by step. A flow longer than six steps wraps into rows below, like text, and a branch that merges back across that wrap draws long crossing connectors.

Keep the longest path at six steps or fewer so the flow stays on one row: fold small steps into one shape ("Sign up and verify email"), put alternatives side by side as branches, and merge branches back on the very next step. A process that truly needs more steps becomes two boards (part 1, part 2) rather than one wrapped flow.

```satgas:board Order handling
{"layout": "flow",
 "items": [
  {"id": "in", "kind": "shape", "shape": "ellipse", "text": "Order placed", "color": "green"},
  {"id": "stock", "kind": "shape", "shape": "diamond", "text": "In stock?", "color": "purple"},
  {"id": "ship", "kind": "shape", "text": "Pack and ship"},
  {"id": "wait", "kind": "shape", "text": "Back-order", "color": "orange"},
  {"id": "mail", "kind": "note", "text": "Email the delivery date", "color": "green"}
 ],
 "links": [["in", "stock"], ["stock", "ship"], ["stock", "wait"], ["ship", "mail"], ["wait", "mail"]]}
```

### mindmap: a topic and its parts

The item no link points to is the centre. Its branches spread to both sides, each branch keeps its own children together, and nothing crosses.

```satgas:board Channel strategy
{"layout": "mindmap",
 "items": [
  {"id": "c", "kind": "shape", "shape": "ellipse", "text": "Just Media", "color": "ink"},
  {"id": "a", "kind": "note", "text": "Audience: high-school students", "color": "blue"},
  {"id": "p", "kind": "note", "text": "Pillars", "color": "purple"},
  {"id": "p1", "kind": "note", "text": "Science explained in 60 s"},
  {"id": "p2", "kind": "note", "text": "Exam tips"},
  {"id": "f", "kind": "note", "text": "Formats", "color": "green"},
  {"id": "f1", "kind": "note", "text": "Reels"},
  {"id": "f2", "kind": "note", "text": "Carousels"}
 ],
 "links": [["c", "a"], ["c", "p"], ["p", "p1"], ["p", "p2"], ["c", "f"], ["f", "f1"], ["f", "f2"]]}
```

### kanban: work by status or by period

Columns appear in the order their names first appear; each item names its `column`. Satgas writes the column headings itself, so never add heading items.

```satgas:board Week 1 content
{"layout": "kanban",
 "items": [
  {"kind": "note", "column": "Idea", "text": "Why the sky is blue"},
  {"kind": "note", "column": "Idea", "text": "3 memory tricks for exams"},
  {"kind": "note", "column": "Script", "text": "Black holes in 60 s", "color": "orange"},
  {"kind": "note", "column": "Published", "text": "Photosynthesis myth", "color": "green"}
 ]}
```

### grid: things side by side

Rows of `columns` items, a near-square grid when it is left out. Best for cards of one kind: personas, options, products, ideas.

```satgas:board Personas
{"layout": "grid", "columns": 3,
 "items": [
  {"kind": "doc", "title": "Rani, 16", "text": "Studies on her phone at night. Wants **short** answers before exams."},
  {"kind": "doc", "title": "Dimas, 17", "text": "Loves experiments. Shares videos with his class group."},
  {"kind": "doc", "title": "Bu Sari, teacher", "text": "Looks for clips to open a lesson."}
 ]}
```

### free: position carries meaning

Give `x` and `y`. Satgas keeps the drawing's shape but spreads it evenly until nothing overlaps, and starts the frame where the drawing starts. Space items at least a card apart (about 260 px across, 160 px down) and keep labels next to what they label.

```satgas:board System overview
{"layout": "free",
 "items": [
  {"id": "web", "kind": "shape", "text": "Web app", "x": 0, "y": 0},
  {"id": "api", "kind": "shape", "text": "API", "x": 280, "y": 0},
  {"id": "db", "kind": "shape", "shape": "ellipse", "text": "Postgres", "color": "green", "x": 560, "y": 0},
  {"id": "queue", "kind": "shape", "text": "Job queue", "color": "orange", "x": 280, "y": 180},
  {"id": "worker", "kind": "shape", "text": "Worker", "x": 560, "y": 180}
 ],
 "links": [["web", "api"], ["api", "db"], ["api", "queue"], ["queue", "worker"], ["worker", "db"]]}
```

## Changing what is already there

You have full control of the canvas. Your prompt lists every card under `<board_now>` by id, kind, title, position and size, frames with their contents indented, and the connectors. To change them, write a `satgas:edit` block with a JSON array of commands. Satgas applies them in order, before it places any new cards from the same reply.

```satgas:edit
[
 {"op": "update", "id": "n-3", "text": "Ship on Friday", "color": "green"},
 {"op": "delete", "ids": ["n-7", "n-8"]},
 {"op": "move", "id": "frame-1", "x": 0, "y": 600},
 {"op": "link", "from": "n-3", "to": "n-4"}
]
```

| op | fields | what it does |
| --- | --- | --- |
| `delete` | `ids`, or `"all": true` | removes cards and their connectors; `all` clears every unlocked card |
| `update` | `id` plus only what changes: `title`, `text`, `color`, `shape`, `rows`, `w`, `h` | edits a card in place |
| `move` | `id`, `x`, `y` | a frame carries what is inside it, a group moves as one; the lead and the team cannot be moved |
| `arrange` | `ids` or `"all": true`, `layout`: `grid`, `row` or `column` | lines cards up without overlaps, starting where they already are |
| `link` / `unlink` | `from`, `to` | adds or removes the connector between two cards |
| `check` | `id`, `item` (0 for the first), `done` (default true) | ticks or unticks one item of a checklist widget |

### Widgets

Some cards are widgets the person placed: `<board_now>` says what each one is.

- **variables**: names and values. Satgas already filled `{{name}}` in the messages you got, and you can use the values directly.
- **checklist**: what done means for the person. Tick each item you met with `check`, and only those. The person sees which items the team ticked.
- **button** and **trigger**: a message the person sends with a click, or one that runs on a schedule or webhook. The cards they are connected to are the context of that message.
- **comment**: the person's note about the card it names. When the round's message came from one, answer it.
- **pull, branch, changes, round, fork, memory**: live views of the board's own data. Leave them alone; they update themselves.


- Update a card when its content changes; never add a second copy next to the old one.
- Locked cards cannot change; say so in your reply if one blocked the request.
- The people on the canvas are the team, not cards. They can be moved, never deleted.
- The person sees one line in the chat for everything changed in the round, with Undo, so a clear-out is safe to do when asked.

## What never goes on the board

- Test runs, command output, logs, stack traces. They belong in your reply, briefly.
- A card that only lists or sums up what other tasks made; the chat already does that.
- Answers, status overviews, account or project summaries, and next steps or recommendations. They go in the reply, which shows in the chat.
- Markdown in a sticky: stickies show plain text. Use a `doc` for formatted text.
- Your assumptions, choices and questions. Say them in your reply.
- An HTML page standing in for a table, a chart of numbers you can give as a table, or a file nobody asked for.
- Placeholder content: "Lorem ipsum", "Item 1", "TBD". Fill it with real content or leave the item out.
