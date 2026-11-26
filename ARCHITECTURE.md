# Architecture

## Module ownership

| Directory | Responsibility |
| --- | --- |
| `src/app/` | React shell, route registry, navigation store, dashboard and reusable interface components |
| `src/music-theory/` | Pure pitch, interval, scale, chord, harmony and explanation operations, with an entry point intended for eventual reuse by SKEIN Score |
| `src/reference/` | Reference presentation and discovery using the future content catalogue |
| `src/exercise/` | Interprets validated exercise definitions using built-in question types, grading and feedback |
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

## Content Engine and Content Manager (planned)

Supported content can be added, updated or removed at runtime without source edits or recompilation. Adding a new renderer or exercise behaviour requires an application release. The library supports PDF references, worksheets and answer sheets, Markdown lessons, structured question banks, interactive exercise definitions, images and diagrams, audio and MIDI examples, and bundled content packs. Worksheets may link to answer sheets, and lessons or exercises may reference shared assets by resource ID.

- **Content Engine** owns schemas, migrations, resource identity and provenance, catalogue queries, import and export, validation, duplicate detection and update rules. It exposes validated records and asset references through a public interface. Storage adapters provide durable local metadata and binary storage behind that interface, with IndexedDB as the proposed browser backend. The theory core remains independent of content, persistence and UI.
- **Content Manager** is the application workspace for browsing and filtering the library, previewing imports, resolving conflicts, updating or removing resources, exporting packs, and backing up or restoring the library. It calls the engine for these operations. Reference and exercise workspaces consume the same validated catalogue. The learning module owns progress and associates it with persistent resource and question IDs.

### Proposed .skeinpack format

A `.skeinpack` is a ZIP archive with a UTF-8 JSON manifest at `manifest.json` and relative entries for documents, structured data and assets. The initial format proposal is version 1.

| Manifest field | Purpose |
| --- | --- |
| `formatVersion` | Archive and manifest contract version |
| `packId`, `packRevision` | Persistent pack identity and ordered release revision |
| `title`, `description`, `categories`, `tags` | Pack metadata used for display, browsing and filtering |
| `resources[]` | Entries with a persistent resource ID, content type, resource schema version, revision, title, categories, tags and references to related resources and files |
| `files[]` | Archive paths, allowed media types, byte sizes and SHA-256 digests for payload integrity and duplicate detection |

Pack format, resource schema and content revision evolve independently. The engine validates supported versions and migrates recognised older schemas before committing an import. Unsupported versions produce an actionable error. Digests detect matching bytes and integrity errors. Trust and provenance are assigned by the application, independently of manifest metadata.

### Identity, updates and recovery

Resource and question identifiers are opaque, globally unique and preserved across edits, path changes, exports and restores. An intentional replacement with a different learning objective receives a new ID. Stable IDs with known provenance and a newer revision are update candidates. An identical ID, revision and payload is a repeat import. Identical payloads under different IDs can be flagged or stored once while retaining distinct resource identities. Conflicting revisions or provenance require explicit resolution. Users preview validation issues and changes before an atomic import or update is committed.

Bundled resources occupy an application-managed, read-only catalogue. Imported resources occupy a separate writable catalogue with explicit provenance. Imports cannot overwrite or silently shadow bundled resources. The application may update its bundled catalogue through its own trusted distribution path.

Progress is stored separately from content and linked by persistent IDs. Recorded attempts retain the revision used. Compatible updates preserve progress. When questions are removed or their meaning changes, retain historical records and require an explicit mapping or a new ID for future activity. Removing content keeps its progress history so reimporting the same resource can restore the association.

Pack export shares selected declarative resources and their dependencies. A separate versioned library backup includes user resources, assets, metadata, provenance and linked progress, plus references to bundled resources. Restore stages and validates the backup, checks for missing references and ID conflicts, and applies accepted changes atomically. Failed imports or restores leave the prior library intact.

### Untrusted content

Treat all imported manifests and payloads as untrusted. Bound file counts, uncompressed sizes and expansion ratios. Reject unsafe or duplicate archive paths, traversal, symlinks, unsupported file types and malformed or mismatched payloads before persistence. Validate schemas, resource references and payload digests. Use safe or isolated media renderers, sanitise Markdown and diagram output, and keep embedded scripts, active document content and automatic remote requests disabled. Handle audio and MIDI examples through approved media and parsing adapters.

Packs are declarative. They cannot execute imported JavaScript, register custom code or supply executable grading logic. Interactive exercises select built-in behaviours from validated identifiers and provide only data and parameters.

## SKEIN Score integration (planned)

TheoryLab will host the existing SKEIN Score editor in a workspace through a documented embedding interface. SKEIN Score will keep its standalone entry point and existing implementation. The host will provide workspace lifecycle, content catalogue access and learning records. SKEIN Score will own score documents, notation rendering, editing and editor commands. The existing Notation, Harmony and Composition Assistant engines will retain independent responsibilities and public interfaces.

Reuse the shared music theory core for common musical calculations. Preserve Score's Harmony engine for score-specific analysis and its Composition Assistant for composition workflows. Reuse the existing Notation engine for score editing and display. Use the shared audio and MIDI engines and virtual keyboard where their interfaces suit both applications. Route playback and note input through one set of services in the embedded workspace. The standalone entry point can provide its own service instances through the same contracts.

The embedding interface should document editor mounting and disposal, score loading and saving, commands and document-change events, editing policy, and the host-provided services. Keep TheoryLab routing, content persistence and learning state outside the editor. Embedding should preserve existing standalone behaviour, and both hosts should use the same editor and musical implementations. Select the integration mechanism after auditing both repositories.

### Editor modes

| Mode | Behaviour |
| --- | --- |
| Learning | Guided exercises open from validated score content. A configurable editing policy can lock notes, voices or regions and limit available operations. The editor enforces restrictions on commands and document mutations, including paste and undo or redo. The learning workspace supplies hints, runs supported automated assessment rules and records outcomes. |
| Studio | Unrestricted score editing with optional analysis tools exposed through the existing engines. Learning restrictions and assessment are opt-in through an exercise configuration. |

### Score content in .skeinpack

Extend the versioned resource schemas to describe editable scores, MusicXML resources, score-based exercise definitions, reference melodies and cantus firmus examples, protected score regions, model answers, declarative assessment rules and optional playback resources. Use persistent resource IDs and revisions to connect exercise prompts, starter scores, model answers and playback assets. Protected regions should use validated score anchors that resolve to notes, voices or ranges in the referenced score revision.

Select a versioned editable score representation after the audit. Treat MusicXML as an interchange resource and validate it with external entity resolution and network access disabled. Keep editable learner copies separate from pack source scores and retain the source resource ID and revision for assessment history. Exercise rules select built-in assessors using validated identifiers and parameters. Pack content cannot supply executable scripts, custom editor code or arbitrary grading logic.

### Audit before implementation

Review both repositories before choosing the integration mechanism or changing either application. Inventory dependencies and versions, editor entry points, build and runtime boundaries, score and interchange models, public APIs, and audio, MIDI and keyboard contracts. Identify compatible interfaces, duplicated calculations and notation paths, and potential blockers such as incompatible data formats, dependency conflicts or standalone regressions. Record ownership decisions, required adapters and compatibility checks for both embedded and standalone operation before implementation.
