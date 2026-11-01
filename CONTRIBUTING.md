# Contributing to Satgas

Thanks for helping. Satgas aims to stay small, fast and carefully made; contributions are held to that bar.

## Setup

```sh
bun install
bun run dev      # http://localhost:4317
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
- **No new runtime dependencies** without a strong reason. The UI is Preact + signals, bundled by Bun; the server is plain `Bun.serve`.
- **UI work follows [`.interface-design/system.md`](.interface-design/system.md).** Use existing tokens, components and patterns.
  New actions go into `src/web/actions.ts` and surface through the command palette or the mission menu, not new toolbar buttons.
- **Every user-facing string** goes into `src/web/i18n.ts`, in both English and Bahasa Indonesia.
- **Accessibility is part of done:** keyboard path for every action, visible focus, status never conveyed by color alone.
- **Comments** explain why, not what. One line, only where intent is not obvious from the code.
- **Commits** use a short conventional subject, e.g. `fix: keep log order after reconnect`.

## Dev notes

- `bun --hot` keeps server state on `globalThis`, so editing server code does not interrupt a running mission.
- If the UI looks stale after adding a new export to a frontend module, restart `bun run dev`; Bun's frontend HMR
  can keep the previous module graph in that case.
