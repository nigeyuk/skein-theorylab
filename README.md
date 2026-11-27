# MyTheoryLab

**Learn. Explore. Compose.**

Learn by doing. Discover by experimenting.

MyTheoryLab is a browser-native workspace for learning music theory. Open **Intervals** or **Chords** to compare spelled notes, inspect the theory steps and hear the result. The shared virtual keyboard is also available in compatible workspaces.

Official site: [mytheorylab.com](https://mytheorylab.com).

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
- The first playback gesture starts audio and loads the default acoustic grand. The synth plays during loading or if samples are unavailable. Choose an instrument in the keyboard dock. Volume and mute apply to keyboard, MIDI and both workspaces. See the [sample credits](public/instruments/salamander-v1/ATTRIBUTION.md).

- To use a USB MIDI controller, click **Enable MIDI** in a compatible workspace and allow the browser permission. Use the device and channel controls to choose an input, or **All notes off** to release held notes. See the [MIDI acceptance test](src/midi/README.md).

## Browser data and hosting

Export a library backup as a `.mytheorypack` from Content Manager before moving to a different site address. Import it at the destination to restore resources and favourites. Browser storage is scoped to the scheme, host and port. Preferences carry forward on the same origin and can be set again when moving to a new origin.

To publish at the official domain, serve the Vite `dist/` output at the site root, configure the host and DNS for `mytheorylab.com`, and enable HTTPS for browser audio and MIDI access. The canonical site URL is already set in `index.html`.

## Development commands

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run the Vitest suite once |
| `pnpm build` | Check the standalone theory core and strict application types, then build to `dist/` |
| `pnpm preview` | Serve the production build locally |

See the [music theory API](src/music-theory/README.md) for Phase 01. See [ARCHITECTURE.md](ARCHITECTURE.md) for module ownership and [ROADMAP.md](ROADMAP.md) for future phases.
