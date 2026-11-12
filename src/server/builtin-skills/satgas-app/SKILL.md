---
name: satgas-app
description: Satgas's own method for building apps and websites the person watches come alive on the canvas, one browser frame per page. Use for any app, website, landing page, store, dashboard, tool, portal or browser game, new or changed.
---

# Building an app on Satgas

The person sees the work as a design file: every page of the app is its own live browser frame on the canvas, and your
pointer moves over the section you are working on. Nothing else goes on the canvas. Build it the way a strong product
team ships a first version: real screens, real copy, real-looking data, working flows.

## The project

- **New app:** `node <this skill>/scripts/scaffold.mjs [dir] --name "<App name>" --home "<first page's name in the person's language>"`, adding `--api` when it must keep data
  (bookings, orders, accounts). It sets up Vite + React + TypeScript + Tailwind CSS v4 + React Router, an API on Bun with
  SQLite when asked, and the tags the canvas needs. Then `bun install`.
- **Existing project:** build on it in its own stack. Never scaffold over it.
- Start it right after the scaffold, before building screens: `app_start` with name `web` and command `bun run dev`
  (plus `dir` when it is not the board's folder). Leave it running. Every save shows on the canvas at once through hot
  reload, so never restart it for a code change, only after changing `vite.config.ts` or installing a package.

## Pages are frames

- Every page is a route in `src/App.tsx`, its file in `src/pages/`, and listed in `.satgas/screens.json` as
  `[{ "route": "/", "name": "Beranda" }, { "route": "/booking", "name": "Booking" }]`, with names in the person's language.
  Satgas gives each listed page its own frame, plus one at phone width. Add a page to the list the moment its route works.
- Give every page the picture it is cloned from as `"target"`: its Dribbble shot or the part of it
  (`"target": "design/refs/ref-26/part-1.jpg"`), or its hub screen (`design/hubs/<kind>.png`) for a derived page.
  Satgas shows each finished page to a reviewer who never saw you build it, beside that picture.
- A phone app (scaffold it with `--phone`) lists its pages as `{ "device": "phone", "screens": [ ... ] }`, so every page
  is a phone frame and none is stretched to desktop width.
- Pages that need data show believable sample data from the API or from `src/data/`, never an empty state as the main view.
- Each section of a page is its own component, in `src/components/<page>/` (`Hero.tsx`, `ServiceList.tsx`), with shared
  pieces in `src/components/ui/`. Build one section to finished before starting the next.
- Write and change source files with your file tools (Write, Edit, apply_patch), not with shell heredocs, `sed` or
  scripts. The canvas follows those edits to show the person the exact part you are working on.

## Nothing else on the canvas

No notes, docs, tables, previews, screenshots or board blocks in your reply. A spec, a direction or a plan, when the work
needs one, is a file in `docs/` or `design/`. Screenshots you take to check your work stay in `design/shots/`.

## The look

1. Load `satgas-design` and follow it. The person picks one of three directions first. Then `DESIGN.md` and its tokens,
   one hub screen per kind of page cloned from a Dribbble target, and every other page derived from its hub.
2. Build every page from `src/kit` (layout, type, buttons, cards, data, chart, motion, shells). It reads its look from
   the tokens in `src/index.css`. When a page needs something the kit lacks, add it to the kit, not to the page.
3. Write the real copy in the person's language. Names, prices, places and dates look like the person's world.
4. Every page works at 390, 768 and 1280 wide. A phone app uses `MobileShell`, is designed at 390 only, and its tab bar
   and title bar stay fixed to the screen.

## Done means checked

- `bunx tsc --noEmit` and `bun run check:ui` pass, and `bun run build` passes when you change config or dependencies.
- Open every listed page at the address `app_start` gave you for yourself, with `agent-browser`, at 1280 and at 390.
  Read the console. Click through the main flow (book, order, sign in, filter), and fix what breaks.
- Check that `.satgas/screens.json` lists every route and nothing that 404s.
- Report in two or three short lines which pages are live and what works. The frames show the rest.
