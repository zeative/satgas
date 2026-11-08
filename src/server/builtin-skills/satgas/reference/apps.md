# Web apps that need a server

A plain HTML page with its CSS and scripts shows on the board by itself. Anything that needs a server to run (a Vite, Next, Astro or SvelteKit project, a game built with a bundler, an API, a backend with a page) goes through **`app_start`** in the satgas_team connector. You run it; the person never has to.

- The person cannot reach your `localhost`: Satgas may run on a server, and even on their laptop a task's own background processes are stopped when it ends. Never answer with "run `npm run dev`" or a localhost address.
- `app_start` runs your command in the board's folder, keeps it running after your task, puts it on the board as a live card and serves it at Satgas's own address. It returns once the app answers, with an address to check it at yourself and the one to give the person.
- The command must stay running, listen on `$PORT` and host `127.0.0.1`, and serve the app under `$SATGAS_APP_BASE` (a path like `/apps/<board>/<key>/web/`; it ends with a slash). Install dependencies first in your task (`bun install`), then start.
- Check it at the address `app_start` gives you for yourself, in your browser, before you report; `app_status` shows its last output when it fails. Fix and run `app_start` again with the same name to restart it.

The base path, per framework (use the dev server unless the person asked for a production build):

| Stack | Command for `app_start` | Also needed |
| --- | --- | --- |
| Vite (React, Vue, Svelte, plain) | `bunx vite --host 127.0.0.1 --port $PORT --strictPort --base "$SATGAS_APP_BASE"` | Asset paths in code start from `import.meta.env.BASE_URL`, never a bare `/` |
| Next.js | `bunx next dev -H 127.0.0.1 -p $PORT` | `basePath: process.env.SATGAS_APP_BASE?.replace(/\/$/, "")` in `next.config` |
| Astro | `bunx astro dev --host 127.0.0.1 --port $PORT` | `base: process.env.SATGAS_APP_BASE` in `astro.config` |
| SvelteKit | `bunx vite dev --host 127.0.0.1 --port $PORT` | `kit.paths.base` set from `SATGAS_APP_BASE` without the last slash |
| Express, Hono, Bun.serve, Flask, FastAPI | your own start command | Read `PORT`, bind `127.0.0.1`, mount every route and static folder under `SATGAS_APP_BASE` |
| A static build | `bunx serve dist -l tcp://127.0.0.1:$PORT` | Build it with the base path above first |

- Links, `fetch` calls and image paths inside the app are relative or start from the base path. An absolute `/api/...` misses it.
- The app's pages run sandboxed, so they cannot read Satgas's cookies. `localStorage` works but is kept in memory and resets on reload; anything the person must keep belongs in the app's own server or files.
- Name it shortly (`web`, `game`, `api`). One app per thing to open; a frontend and its API can be one app when the frontend's server serves both, otherwise two.
