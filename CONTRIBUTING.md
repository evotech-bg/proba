# Contributing to Proba

Thanks for your interest. Proba is a pnpm workspace; everything runs locally against SQLite.

## Setup

```bash
pnpm install
pnpm dev          # dashboard on http://localhost:8080
pnpm test         # full test suite
pnpm typecheck    # all packages
pnpm lint         # biome
```

Requires Node 22+ and pnpm 9+.

## Ground rules

- **Keep it green.** `pnpm test` and `pnpm typecheck` must pass before a PR. Add tests for new
  behaviour — every package already has them.
- **Locators stay stable.** Use `getByRole` → text/label → `data-testid`. Positional CSS/XPath is
  rejected by `@proba/locator` on purpose; do not work around it.
- **One spine.** New capability is a step kind, a layer, or an attribute on the canonical schema in
  `@proba/store` — not a parallel engine. Generate a migration with drizzle-kit when the schema
  changes.
- **Server boundaries (dashboard).** Anything touching `@proba/engine`/`better-sqlite3`/Playwright
  lives in a `.server.ts` module and is excluded from the client bundle (see
  `vite.config.ts` `optimizeDeps.exclude`). Keeping this rule is what keeps hydration working.
- **Neutral outbound.** Comments synced to external trackers must carry no assistant/AI branding —
  the tracker adapter strips it; do not reintroduce it.

## Project layout

See the "Project structure" section in the [README](README.md). Each package owns one concern and
has its own tests under `src/*.test.ts`.

## Pull requests

Keep PRs focused. Describe what changed and why; include a screenshot for UI changes. New features
should update the README if they are user-facing.
