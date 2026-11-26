# SKEIN TheoryLab

SKEIN TheoryLab is a browser-native workspace for learning music theory. Open **Intervals** or **Chords** to compare spelled notes, inspect the theory steps and hear the result. The shared virtual keyboard is also available in compatible workspaces.

## Get started

Install Node.js 22 or newer and pnpm 12. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. All workspaces support direct links and browser history. On narrow screens, open the Workspaces menu to navigate.

## Play and explore

- In Intervals, choose the written letter, accidental and octave for each note. Use **Swap notes** to reverse the direction. Select **Use keyboard** for the note you want to replace from the dock.
- In Chords, choose a root, quality and inversion. Piano input sets the root, and the keyboard highlights the voiced chord tones. The note controls support both enharmonic spellings.
- Open the keyboard dock, then play with pointer input or focus a piano key to use the Z–M and Q–U rows with their adjacent black-key shortcuts. Arrow keys move focus and Enter or Space plays the focused key. Shift or resize the displayed octave range with the dock controls.
- The first playback gesture starts the browser audio context. The volume and mute controls apply to the piano and both workspaces for the current application session.

- To use a USB MIDI controller, click **Enable MIDI** in a compatible workspace and allow the browser permission. Use the device and channel controls to choose an input, or **All notes off** to release held notes. See the [MIDI acceptance test](src/midi/README.md).

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run the Vitest suite once |
| `pnpm build` | Check the standalone theory core and strict application types, then build to `dist/` |
| `pnpm preview` | Serve the production build locally |

See the [music theory API](src/music-theory/README.md) for Phase 01. See [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership and [ROADMAP.md](ROADMAP.md) for future phases.
