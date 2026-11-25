# Architecture

## Module ownership

| Directory | Responsibility |
| --- | --- |
| `src/app/` | React shell, route registry, navigation store, dashboard and reusable interface components |
| `src/music-theory/` | Pure pitch, interval, scale, chord, harmony and explanation operations, with an entry point intended for eventual reuse by SKEIN Score |
| `src/reference/` | Reference content, metadata and future indexing |
| `src/exercise/` | Exercise definitions, grading and feedback |
| `src/learning/` | Learning records, mastery and progression rules |
| `src/visualisation/` | Future notation, keyboard and other theory views |
| `src/storage/` | Future persistence, schema versions and migration adapters |
| `src/audio/` | Future browser audio and playback scheduling |
| `src/midi/` | Future device discovery, permission handling and message translation |

The seven reserved module directories each contain a README defining their boundary. Add public entry points when working code needs them.

## Dependency direction

The shell composes modules through their public interfaces. Reference, exercise, learning and visualisation can use the theory core. Browser I/O stays in storage, audio and MIDI adapters, with the shell responsible for wiring them into features. Domain logic should receive data or explicit interfaces from its caller. The theory core has a separate TypeScript check using only the ECMAScript standard library and no ambient package types. Keep its imports internal to the core.

## Platform choices

- Vite builds a static single-page application. Fragment routes support reloads, direct links and browser history on static hosts. Unrecognised fragments show the dashboard.
- Zustand exposes the current workspace to React. The URL fragment is the source of truth and supplies the initial route.
- Tailwind handles shared theme tokens and responsive grid utilities. Component CSS defines the desktop shell, card treatment and mobile menu. Lucide supplies a consistent icon set.
- A single workspace registry supplies navigation, dashboard cards and placeholder content. The shell updates the page title and moves focus to the workspace heading when navigation changes.
- Phase 00 uses no persistent application data. The progress workspace describes the planned capability without rendering scores or completed activities.
- TypeScript runs in strict mode. ESLint checks TypeScript and React hook usage. Vitest covers the route registry, resolver and public theory API.

## Shared virtual keyboard

The shell mounts the bottom dock from each workspace's keyboard access policy. Reference and Composition workspaces opt into the preview. Practice Room shows the disabled state until an exercise enables it. Dashboard, Learning Progress and Settings omit the dock. Exercise workspaces can supply available, disabled with a reason, or hidden. The shared panel has no dependency on a learning module or the navigation store.

- `src/visualisation/keyboard/model.ts` defines inclusive octave bounds, optional labels and externally supplied pitch annotations for highlights, scale degrees and chord tone roles. Annotations describe the view without emitting note events. The Phase 00 dock renders a static, decorative preview and uses native disclosure for expansion.
- `src/music-theory/index.ts` separates a written letter and accidental from a sounding pitch class and octave. Enharmonic spellings can share a sounding pitch. The audio layer will resolve pitch to frequency in hertz using the chosen tuning.
- `src/note-input/index.ts` defines note-on and note-off events for pointer, computer keyboard, programmatic playback and future Web MIDI adapters. Each source assigns its own ID and maintains a press ID from attack to release. Adapters release outstanding presses when disconnected. The browser MIDI adapter will map device messages into this contract and keep Web MIDI types out of the core.
- `src/audio/index.ts` defines the shared engine boundary. A future Web Audio implementation will own one lazily resumed audio context and allocate a voice per source and press pair, so two inputs can hold and release the same pitch independently. The shell will share that engine across workspaces and release affected voices when a workspace disallows input.

## Music theory core

The public entry point re-exports domain operations and types. Pitch owns written note validation and sounding pitch conversion. Interval owns letter and chromatic offset calculations. Scale and chord construction share that offset logic for consistent spelling. Harmony analyses chord identifications in a selected key. Explanations call the underlying operations and add structured intermediate steps, keeping calculation and presentation in sync.

The isolated core TypeScript config uses the ECMAScript library and no ambient types. Vitest cases live in `tests/` outside that boundary and are type-checked by the application TypeScript config. Equal-temperament frequency is a pure conversion. Audio context, playback and device concerns belong in their respective adapters.

See the [public API and conventions](src/music-theory/README.md).
