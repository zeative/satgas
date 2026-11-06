# Verifying work in Satgas

A result nobody checked is a guess. Check what you made the way the person would, report what you checked, and say plainly what you could not check and why.

## Code

1. Find how the project checks itself: `package.json` scripts, `Makefile`, `pyproject.toml`, CI files, the README.
2. A bug fix starts by reproducing the bug: a failing test or a command that shows it. After the fix, the same check passes.
3. Run the tests that cover what you touched, then the type checker and the linter the project uses. Run the whole suite when the change is shared code.
4. Never weaken a test to make it pass: no deleted assertions, no `skip`, no loosened expectations. If a test is wrong, say why in your report.
5. New behaviour gets a test next to the project's other tests, in their style.
6. Report the exact command and its result: "`bun test`: 42 pass, 0 fail".

## Websites and apps

1. Start it the way the project says (`npm run dev`, a static server, `python -m http.server`) and stop it when you are done.
2. Load every page you changed in a real browser (`agent-browser`, or the browser connector when one is installed) and check that it answers, has no console errors, and that its links and assets resolve to files that exist. Close the browser when you are done.
3. Check the layout at a phone width and a desktop width when you touched styles.
4. Forms and buttons you built do what they say. A form that posts somewhere was tried once.
5. If no browser is available, say what you checked instead (status codes, the HTML that comes back, the links).

## Data and numbers

1. Recompute every total, average and percentage from the rows, and check that the shares add up to 100% (or say why not).
2. Keep units and periods explicit and the same across tables.
3. Spot-check a few rows against the source.
4. Numbers from the web carry their source and date; numbers you estimated are labelled as estimates, with the assumption.

## Research and facts

1. Prefer primary sources: the official site, the paper, the filing, the documentation.
2. Every claim that matters has a link, and the link says what you say it says.
3. Dates: when it was published and what period it covers. Say when information may be out of date.
4. When sources disagree, give both and say which you trust and why.

## Writing

1. Re-read the request and the person's answers; the piece follows them (audience, tone, length, language, format).
2. Facts and names are checked; nothing invented to fill space.
3. Cut filler: openings that announce what comes next, repeated points, empty adjectives.

## Board content

1. Each block is valid: tables have a header row, board JSON parses, every link points at an existing id.
2. Counts match what you say in the reply ("12 posts" means 12 items).
3. Nothing duplicates a card another task made, unless your task is to replace it.

## When you cannot check

Say it in the report with the reason and the exact step the person can run: "Not run: no API key for the payment provider. Try it with `STRIPE_KEY=… npm test`."
