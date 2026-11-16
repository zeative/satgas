# Satgas 0.1.16

Design on the canvas, the way a design tool works.

## New

- **Design panel.** Pick any element in a live page frame to see its layers and properties: size with hug and fill, padding and margin, text styles from the page, fill, border, radius and effects. Tabs for Properties, Code (the element's HTML and your changes as CSS) and Tweaks (the page's design tokens).
- **Edits land in the source.** Apply writes what it can straight into the app: Tailwind classes on the element's own line, rewritten words, and design tokens defined once. Anything ambiguous, like a component's variant or a token defined for light and dark, goes to the team with your request.
- **Direct manipulation.** Double-click words to edit them on the page, drag a label to scrub a number, hold Alt to measure spacing, walk layers with Enter, Shift+Enter and Tab, and undo with Cmd+Z.
- **Frames like a design canvas.** Pages run edge to edge with their name, route and tools in a label above, and Play opens a page large and live. Labels keep one size at any zoom. Selection is a crisp blue rectangle with handles on its corners.
- **Fitted cards.** The team's docs, tables and code take the height of what they hold.
- **Pinned comments.** Pin a comment to an element of a page; it stays on that element and goes to the team when you send it.
- **Components.** An element drawn from a shared component names it and warns that a change reaches every copy.
- **Variations.** Explore three takes on a page by layout, style or a bolder direction, built beside it as frames.
- **Marketing formats.** Social posts, stories, slides and emails get frames at their real shape, and the visual check photographs them at their own size.
- **Export PNG.** Any frame exports as a picture at full size, from the same browser the team checks its work with.
- **Start from a website.** The composer imports a public site as a picture with a redesign brief.
- **Templates by kind.** Websites, Apps and Marketing, with new templates for social posts, an email newsletter and a pitch deck. Agent cursors name the model at work.

## Faster

- The UI is sent compressed: a board downloads about a third of what it did (2.0 MB to 0.7 MB).
- Team faces are drawn by the server instead of a 370 KB library in every page.
- Zooming out no longer reloads every app on the board: page frames stay live and hold still while the canvas moves.

## Calmer

- A floating workspace panel with pill tabs and an outline grouped by kind; the chat panel names its session in one row.
- A quieter home page and sidebar, a bottom tool bar and a single zoom menu.

## Fixed

- New apps from the starter failed on their first page: Vite had no `@` alias for `@/kit`.
- A page frame showing an error or still loading shrank to a thin strip; it now keeps one screen.
- A pinned Claude model id such as `claude-haiku-5-5` showed as unavailable in the model picker.
