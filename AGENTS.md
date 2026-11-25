# Repository guidance

- Use pnpm and preserve the lockfile when changing dependencies.
- Keep TypeScript strict. Use `pnpm lint`, `pnpm test` and `pnpm build` before reporting a change complete.
- Preserve stable workspace IDs and browser history behaviour. Use the shared registry for dashboard and navigation changes.
- Keep the theory core independent of React, browser APIs and application state. Keep browser I/O in the appropriate adapter.
- Keep progress views grounded in recorded activity. Use an honest empty state before there is activity to show.
- Follow [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership and [ROADMAP.md](ROADMAP.md) for phase scope.
