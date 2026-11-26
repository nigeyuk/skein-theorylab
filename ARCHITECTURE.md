# Architecture

## Module ownership

| Directory | Responsibility |
| --- | --- |
| `src/app/` | React shell, route registry, navigation store, dashboard and reusable interface components |
| `src/music-theory/` | Pure pitch, interval, scale, chord, harmony and explanation operations, with an entry point intended for eventual reuse by SKEIN Score |
| `src/reference/` | Reference presentation and discovery using the validated content catalogue |
| `src/exercise/` | Interprets validated exercise definitions using built-in question types, grading and feedback |
| `src/learning/` | Learning records, mastery and progression rules |
| `src/visualisation/` | Shared virtual keyboard and future notation and theory views |
| `src/content/` | Content schemas, library operations, pack validation and repository contracts |
| `src/content-manager/` | Library workspace, import previews, metadata forms and safe document viewers |
| `src/storage/` | Browser persistence adapters, including IndexedDB for content |
| `src/audio/` | Shared browser audio, voice scheduling and lifecycle |
| `src/midi/` | Web MIDI permission, input discovery, connection lifecycle and message translation |

Module READMEs define the boundaries of reserved and implemented subsystems. Add public entry points when working code needs them.

## Dependency direction

The shell composes modules through their public interfaces. Reference, exercise, learning and visualisation can use the theory core. Browser I/O stays in storage, audio and MIDI adapters, with the shell responsible for wiring them into features. The shared note-input manager coordinates live and programmatic sources and exposes subscriptions to workspace consumers. Domain logic should receive data or explicit interfaces from its caller. The theory core has a separate TypeScript check using only the ECMAScript standard library and no ambient package types. Keep its imports internal to the core.

## Platform choices

- Vite builds a static single-page application. Fragment routes support reloads, direct links and browser history on static hosts. Unrecognised fragments show the dashboard.
- Zustand exposes the current workspace to React. The URL fragment is the source of truth and supplies the initial route.
- Tailwind handles shared theme tokens and responsive grid utilities. Component CSS defines the desktop shell, card treatment and mobile menu. Lucide supplies a consistent icon set.
- A single workspace registry supplies navigation, dashboard cards and placeholder content. The shell updates the page title and moves focus to the workspace heading when navigation changes.
- Phase 00 uses no persistent application data. The progress workspace describes the planned capability without rendering scores or completed activities.
- TypeScript runs in strict mode. ESLint checks TypeScript and React hook usage. Vitest covers the route registry, resolver and public theory API.

## Shared virtual keyboard and audio

The shell creates one reusable Web Audio engine per application instance. The first playback gesture initialises or resumes its audio context. The engine accepts pitch-based note events, MIDI note numbers and frequencies in hertz. It schedules simultaneous or sequential frames on the audio clock. The instrument manager loads registered instrument definitions and owns selection, readiness and fallback. The sampled grand piano and triangle-wave synthesiser share attack and release envelopes, a bounded voice pool, master volume, mute, compression and peak limiting.

- Each pointer, computer-key, physical MIDI or programmatic press has a source and press ID. The engine keeps independent voices for overlapping inputs, even when they share a pitch. It cancels pending starts and scheduled notes on source release or all-notes-off and disconnects ended voices. The shell stops playback when leaving a workspace or losing window focus.
- The dock starts with three octaves and accepts octave bounds, note labels and external pitch annotations. An annotation can carry a written spelling, scale degree or chord tone role. Active piano input uses the application accent, while chord tone roles use separate educational colours.
- Keyboard shortcuts are scoped to focused piano keys. Releasing keys, leaving the piano, losing pointer capture, collapsing the dock or hiding the page releases held voices. Keyboard availability is set by each workspace, with independent available, disabled and hidden states.
- Intervals and Chords own their selection state and derive results and explanations from the theory core. The keyboard emits selected notes and accepts highlights keyed by sounding pitch, so spelling stays with the workspace even when enharmonic notes share a piano key.
- The application sidebar renders its version from a static import of package metadata. Development phase names are tracked in the roadmap.

### Instrument loading and playback

The app selects the acoustic grand on first use and persists later choices. The versioned local manifest defines sample roots, velocity layers, release time and polyphony. The sample implementation uses `AudioBufferSourceNode` and retains decoded buffers while the app audio context is open. The synth remains available during loading and after failures. Held voices are released through their owning instrument, and explicit instrument changes cancel pending playback. Pedal semantics stay in the input path so sample playback, synth playback and future instruments share the same handling.

The registration interface can host additional instrument implementations without changes to learning workspaces. SoundFont playback, user-imported instrument packs and the SKEIN Score host remain future work. See [audio architecture and sample provenance](src/audio/README.md).

### Unified input and Web MIDI

The note-input manager tracks active presses by source and press ID and publishes note-on and note-off events with sounding pitch and velocity. MIDI events include the device and one-based channel. Pointer, computer-key and MIDI sources use the same live event path. Programmatic auditions go through the manager, which delegates precise scheduling to the audio clock and publishes corresponding UI events on the browser timer. Releasing one source preserves matching pitches from other sources.

The MIDI adapter requests native input only when enabled by the user and never requests System Exclusive access. It keeps pedal and press state per channel and resets that state on disconnect, filter changes, disabling MIDI or panic. The storage adapter remembers an explicitly selected device ID. The dock displays port and permission status, supports a channel filter and can optionally follow the octaves of active MIDI notes.

Learning workspaces subscribe to the manager independently of the keyboard view. Workspace or exercise policies can disable MIDI input or suppress MIDI-driven visual feedback while retaining note events for assessment. This interface also supports later interval, chord, scale and ear-training exercises, worksheet answers and notation entry. See the [manual MIDI acceptance test](src/midi/README.md).

## Music theory core

The public entry point re-exports domain operations and types. Pitch owns written note validation and sounding pitch conversion. Interval owns letter and chromatic offset calculations. Scale and chord construction share that offset logic for consistent spelling. Harmony analyses chord identifications in a selected key. Explanations call the underlying operations and add structured intermediate steps, keeping calculation and presentation in sync.

The isolated core TypeScript config uses the ECMAScript library and no ambient types. Vitest cases live in `tests/` outside that boundary and are type-checked by the application TypeScript config. Equal-temperament frequency is a pure conversion. Audio context, playback and device concerns belong in their respective adapters.

See the [public API and conventions](src/music-theory/README.md).

## Content Engine and Content Manager

Supported resources are added, updated and removed at runtime. The React Content Manager calls the Content Engine for imports, updates, search, filters, favourites and exports. The engine validates records and works against an asynchronous `ContentRepository` contract. The IndexedDB adapter stores records, favourite flags and binary assets and applies changes atomically. Browser profiles and origins have separate libraries. Clearing site data removes the local library, so export packs for recovery.

The version 1 resource schema records stable IDs, type, title, description, subject, category, tags, author, attribution, licence, timestamps, revision, owner ID, visibility, workflow status, file descriptors, related IDs, optional prerequisites and difficulty. PDF documents can be classified as references, worksheets or answer sheets. Markdown, PNG, JPEG and declarative short-answer and multiple-choice exercise definitions are supported. Audio, MIDI, MusicXML and SKEIN Score identifiers are reserved for later renderers. Learning workspaces can consume the same repository contract as they gain content integration.

### .skeinpack version 1

A pack is a ZIP archive with a UTF-8 JSON `manifest.json` and payload entries at `files/<sha256>`. The manifest contains `formatVersion`, `packId`, `packRevision`, `title`, `kind`, `resources` and `files`. File entries record path, media type, byte size and SHA-256 digest. Each resource has its own schema version and content revision. Exports share one resource, a selected collection or the current library. Library exports include favourites. Packs restore by previewing and merging into the current library. Split larger libraries into selected collections when they exceed the single-pack limits. Related resources outside a selected export must be exported separately or included in the collection.

Stable resource and asset IDs survive compatible edits and file replacement. Import previews classify new resources, duplicates, newer revisions and conflicts. Applying a newer revision is opt-in. Older and divergent revisions are skipped. Local favourite state survives updates. Provenance distinguishes imported and bundled resources and protects bundled entries from import replacement. Phase 03A ships with an empty imported library. Future learning records should store the resource ID and revision and preserve question IDs across compatible updates. Library packs do not carry learning history or retain previous resource revisions.

### Untrusted content

The engine validates metadata, media signatures, strict exercise definitions, ZIP structure, CRC and payload digests before committing imports. It rejects unsafe paths, symlinks, duplicate entries, encryption, unsupported compression, and undeclared files. Limits include 48 MiB compressed and 64 MiB expanded, 128 resource files, 20 MiB per file, 1 MiB per text payload or manifest, and a 250× ZIP expansion ratio. SHA-256 verifies payload integrity. Publisher identity requires a separate trust mechanism.

Markdown uses an allowlist of rendered elements with raw HTML and remote resources disabled. Imported images use locally created Blob URLs and bounded dimensions. PDFs are rendered to canvas through PDF.js with interactive annotations and XFA disabled. The print window receives raster pages generated by the application. The viewer supports PDFs up to 200 pages and prints up to 40 pages in one job. Packs and exercise definitions remain declarative with no imported script, plug-ins or custom grading code.

### Structured curricula (planned)

The Content Engine will validate versioned curriculum definitions for pathways, courses or volumes, modules and lessons. Lessons reference reusable resources, exercises and assessments by stable IDs. Definitions carry ordering, recommended sequences, prerequisites, objectives, completion requirements, and academic and licensing metadata. A future versioned pack contract will transport these definitions and their dependencies. The existing Phase 03A resource-pack contract continues to serve the local library.

The Learning Engine will evaluate progression and preserve revisioned evidence independently of curriculum content. React workspaces render the curriculum supplied by the engine. Notation activities use the planned SKEIN Score Learning-mode interface. Account ownership and access remain subject to the future server policies below. See [CURRICULUM.md](CURRICULUM.md) for the proposed model, authoring standards and benchmarks.

### Phase 03B multi-user architecture

Owner ID, visibility and workflow status are local catalogue metadata. A future server must authenticate the caller and enforce role, ownership and publication permissions on every query, mutation and asset request.

| Role | Intended permissions |
| --- | --- |
| Administrator | Manage accounts and roles, moderate content and administer publication. |
| Content author | Manage owned drafts, submit revisions for review and access authorised collections. |
| Student | Read published resources, manage a private library and sync personal learning progress. |
| Guest | Read resources explicitly published for public access. |

The remote platform contract exposes the current profile, a repository adapter, a cursor-based progress synchronisation interface, and account export and deletion operations. The learning engine will define the progress records and merge rules. Authentication must establish a server-verified identity. A future service should pair content metadata with private object storage, enforce access on assets and downloads, synchronise progress by user and stable resource ID, and define account export, retention and deletion across database and storage. Phase 03A requires no backend or sign-in.

- **PostgreSQL** provides relational constraints, transactions and row-level security for ownership and permissions. A self-managed deployment also needs identity, a service API, object storage and operating procedures. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- **Supabase** provides hosted PostgreSQL, Auth and Storage. A Phase 03B evaluation should test database and bucket policies together, keep service credentials on the server, and compare operations, migration, regional hosting and account deletion needs. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control)

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
