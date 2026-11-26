# Repository guidance

- Use pnpm and preserve the lockfile when changing dependencies.
- Keep TypeScript strict. Use `pnpm lint`, `pnpm test` and `pnpm build` before reporting a change complete.
- Preserve stable workspace IDs and browser history behaviour. Use the shared registry for dashboard and navigation changes.
- Keep the theory core independent of React, browser APIs and application state. Keep browser I/O in the appropriate adapter.
- Keep progress views grounded in recorded activity. Use an honest empty state before there is activity to show.
- Follow [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership and [ROADMAP.md](ROADMAP.md) for phase scope.
- Keep supported learning resources declarative and load them through the Content Engine. Keep catalogue rules in the engine, management interactions in the Content Manager, and persistence behind storage adapters.
- Preserve resource and question IDs across compatible content updates. Version schemas separately from content revisions, retain historical progress, and distinguish bundled resources from user imports.
- Validate untrusted content and archive paths before storage or rendering. Treat pack assets as data and prohibit imported JavaScript or executable exercise logic. Use built-in behaviours for declarative exercises.
- Implement the Content Engine and Content Manager after Phase 02 and use their validated catalogue for the interactive reference library.
- Before implementing SKEIN Score integration, audit both repositories for shared dependencies, compatible interfaces, duplicated functionality and blockers. Document the findings and preserve the standalone editor and independent Notation, Harmony and Composition Assistant engines.
- Embed SKEIN Score through documented public interfaces. Reuse shared theory, audio, MIDI and keyboard services where compatible and keep TheoryLab routing, persistence and learning state in the host.
- Enforce Learning-mode editing restrictions at the editor command and document boundaries. Keep Studio editing unrestricted and make analysis optional. Validate score resources, protected regions and assessment parameters through the Content Engine.
