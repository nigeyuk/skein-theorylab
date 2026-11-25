# SKEIN TheoryLab

SKEIN TheoryLab is a browser-native workspace for learning music theory. Phase 00 provides the dashboard, navigation and module boundaries. Open the Virtual keyboard dock from a compatible workspace to see the Phase 00 preview.

## Get started

Install Node.js 22 or newer and pnpm 12. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. All workspaces support direct links and browser history. On narrow screens, open the Workspaces menu to navigate.

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run the Vitest suite once |
| `pnpm build` | Check the standalone theory core and strict application types, then build to `dist/` |
| `pnpm preview` | Serve the production build locally |

See the [music theory API](src/music-theory/README.md) for Phase 01. See [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership and [ROADMAP.md](ROADMAP.md) for future phases.
