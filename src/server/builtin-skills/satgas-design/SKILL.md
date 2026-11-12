---
name: satgas-design
description: How Satgas designs anything people look at so it matches the best work on Dribbble. Three directions for the person to choose from, one design system and kit, one hub screen per kind of page cloned from a featured shot, and every other page derived from its hub, each checked against its reference in one picture. Load it before the first line of any page, app screen, landing page, store, dashboard, game screen or visual, new or redesigned.
---

# Satgas design

A model asked to "design something good" lands on the look everyone now calls AI slop, in one of two waves. The first is
purple gradients, Inter and three icon cards. The second, which you reach when the first is banned, is a cream background
near #F4F1EA, a serif display with one italic word, a terracotta accent, tiny uppercase labels, three stats in a row, a
card floating on a photo, and a fade on every section. Rules alone do not avoid them. What does:

- a written direction, chosen by the person;
- a design system that every page is built from;
- real references for every kind of page;
- one finished hub screen per kind, with the other pages derived from it;
- a picture of the work set next to its reference, every round.

## 1. Direction: three options, the person picks

When the task is the direction:

1. List the kinds of page in the plan: landing, pricing, sign in, dashboard, table or list, detail, cart, settings,
   phone screens.
2. Pull references for each kind: `node <this skill>/scripts/refs.mjs search "<kind and field>" --n 8`, then
   `refs.mjs shot <url>` for the strongest. A shot's own images come whole, and one marked **FULL PAGE** shows every
   section.
3. Write `design/directions.md` with three directions that differ for real: light against dark, quiet against bold,
   editorial against product-led. For each one give:
   - a name;
   - the main target shot (its file in `design/refs/` and its Dribbble link), plus the shot for every other kind of
     page;
   - the palette, as 4 to 6 hex values, each with its role;
   - the type: name the target's own type (wide or condensed, geometric or quirky, serif or sans, how heavy), then a
     display face of that character and a different text face from `fonts.md` in this skill. Each direction gets its
     own display face from a different row, and none is a default or a stock serif. See them set with
     `node <this skill>/scripts/fonts.mjs "<display>" "<text>" --text "<the product's headline>"` before you write
     them down;
   - the hub screen of each kind of page as an ASCII wireframe;
   - the one memorable element.
4. Check each direction against the two waves above. Change anything in it that is a default, not a choice. Then the
   template test: put another product's name on the target. If it would fit just as well, it is a template, not a
   design; pick a shot with a real idea of its own.
5. In your report, present A, B and C in a few lines each with their Dribbble links, say which you recommend, and ask
   the person to pick. Build nothing.

## 2. The design system, before any page

From the chosen direction, write `DESIGN.md` and set its tokens in `src/index.css`:

- colours;
- the type: the chosen faces loaded in `index.html` and set as `--font-display` (headlines and big figures),
  `--font-sans` (text) and `--font-mono` when the target uses one, with the scale (display, h1, h2, h3, body). Headlines
  are set in the display face, big and with confidence; ui-check fails on a default, a stock serif or a missing face;
- the radius family and the shadow recipe.

Pages are built from `src/kit` (`Section`, `Grid`, `Stack`, `Heading`, `Text`, `Button`, `Card`, `Badge`, `Photo`,
`StatCard`, `DataTable`, `Chart`, `EmptyState`, `Skeleton`, `Reveal`, and the shells `SiteHeader`, `AppShell` and
`MobileShell`). Extend the kit when a page needs something new, so every page gets it, instead of styling one page by
hand. `bun run check:ui` must be clean: no raw colours, no one-off sizes, no known tells.

The target outranks the tell list. When the chosen shot itself uses something ui-check flags, such as small tracked
capitals for labels or a serif headline, keep it, because dropping it is how a clone drifts back to the average. Name
those rules in `DESIGN.md` on one line, `ui-check allows: tracked caps label`, and ui-check stops flagging them.

## 3. Hub screens: one per kind of page, cloned from its target

1. Before building, measure the target: `node <this skill>/scripts/measure.mjs design/refs/<target>`. It cuts the shot
   into its screens or windows, their sections and the blocks inside, with each part's size, gaps and exact colours,
   and saves a sharp crop of every screen and section (`design/refs/<target>/part-<id>.jpg`). Open every crop: a whole
   shot shows each part too small to read its type, labels and finish. Then map the target in `design/review.md`, part
   by part, from those numbers and crops, never from the whole shot.
2. Build the hub, matching the target's composition, proportions and empty space. **Add nothing the target does not
   have.** Show the screen in the moment the target shows it: a timer running with its arc part way round, rings partly
   filled, a cart with items in it. Never a zero, empty or "ready" state as the main view. Real photos come from `node <this skill>/scripts/photos.mjs "<what is in the picture>" --orientation <...>
   --name <slot>`.
3. Compare: `node <this skill>/scripts/compare.mjs design/refs/<target> <the address app_start gave you> --width 1440`.
   - For a phone screen, use `--width 390`.
   - For a lower part of a FULL PAGE target, add `--at <0 to 1> --scroll <px>`.

   Build one part at a time and compare each against its own crop (`compare.mjs design/refs/<target>/part-<id>.jpg
   <address>`), so a difference is never lost in the whole. Write every difference part by part, fix them, and compare
   again until the two read as the same design with different content. That usually takes three to five rounds.
4. Save the finished hub: `agent-browser screenshot --full design/hubs/<kind>.png` at its width.

## 4. Every other page derives from its hub

A page is made by copying its hub's structure and kit parts and changing the content. It is never invented from
scratch.

- Compare it with its hub picture: `compare.mjs design/hubs/<kind>.png <page address>`.
- Where its own target shows a section the hub does not have, compare that section with the target.

## 5. Craft

- **Alignment:** every block sits on the 12-column grid, and edges line up across sections.
- **Size and hierarchy:** the same thing is the same size everywhere. Body text is 16 to 18 px, and nothing a person
  reads is under 13 px. Each screen has one lead.
- **Structure:** one job and one layout per section. Repeated items share one component.
- **Pictures:** real photos, the product's own interface built in code, or lucide icons. Never draw illustrations,
  mascots or scenes in SVG or CSS. A photo has to look like the target's photos: the same light, crop and finish. Never
  archive scans, vintage portraits, snapshots or clip art; initials or the product's interface are better than a weak
  photo. Without a Pexels or Unsplash key the choice is small, so say so in your report. Photos from different shoots
  never match on their own: give all of them one treatment the target suggests (a duotone in the palette, black and
  white with the accent, one crop and one corner), so they read as one shoot. When the target floats a product or a
  person on a colour field or over type, cut them out of a photo: `node <this skill>/scripts/cutout.mjs <photo>`.
- **Data:** believable domain data in the person's language, with empty, loading and error states from the kit.
- **Motion:** one orchestrated entrance per page (`Reveal` and `RevealItem`), numbers that count up, and hover and press
  feedback. No fade on every section and nothing that loops.
- **Phones:** a phone app is scaffolded with `--phone`, so every page is a phone frame on the canvas. Design at 390
  only, keep tap targets at 44 px, use `MobileShell`, and keep its title bar and tab bar fixed to the screen.

## 6. Satgas checks your screens too

When you finish a task that built screens, Satgas runs `ui-check`, takes a picture of every page, and hands each one with
its `"target"` from `.satgas/screens.json` to a reviewer who never saw you build. You get its findings for one more
turn: fix every point. Report each page's target or
hub, your compare rounds, and your final scores.
