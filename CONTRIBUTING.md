# Contributing to Satgas

Thanks for helping. Satgas aims to stay small, fast and carefully made; contributions are held to that bar.

## Setup

```sh
bun install
bun run dev      # UI at http://localhost:5317, API at :4317
```

You need Claude Code installed and signed in to run real missions. Tests never call a real agent:
they use a fake CLI (`tests/fixtures/fake-cli.ts`) that replays canned JSONL.

## Before opening a pull request

```sh
bun run check    # typecheck + Biome lint + tests
```

CI runs the same steps plus a binary build.

## Conventions

- **Tests** live in `tests/`, mirroring `src/` (`src/server/store.ts` → `tests/server/store.test.ts`). Never next to source files.
- **No new runtime dependencies** without a strong reason. The UI is the Shadcn Admin template (React, Vite, TanStack Router, shadcn/ui); the server is plain `Bun.serve`.
- **UI work follows [`.interface-design/system.md`](.interface-design/system.md).** Use existing tokens, components and patterns.
  Reach for an existing `src/web/components/ui` component before writing a new one.
  New actions go into `src/web/lib/actions.ts` and surface through the command palette or the mission menu, not new toolbar buttons.
- **Every user-facing string** goes into `src/web/i18n.ts`, in both English and Bahasa Indonesia.
- **Accessibility is part of done:** keyboard path for every action, visible focus, status never conveyed by color alone.
- **Comments** explain why, not what. One line, only where intent is not obvious from the code.
- **Commits** use a short conventional subject, e.g. `fix: keep log order after reconnect`.

## Dev notes

- `bun --hot` keeps server state on `globalThis`, so editing server code does not interrupt a running mission.
- `src/web/components/ui` and `src/web/components/flow` are vendored from shadcn/ui and React Flow UI and skip Biome;
  update them with `bunx shadcn@latest add`, not by hand.
- Keep frontend modules free of import cycles. `lib/actions.ts` gets the router's `navigate` from `main.tsx`
  instead of importing `@/router`, because that import would loop back through the route tree and make Vite load
  two copies of a React context during hot reload.
