# Roadmap

- **Phase 00 · Foundation.** Application shell, dashboard, navigation, module boundaries, shared keyboard preview and development checks.
- **Phase 01 · Music theory core.** Implement pitch and spelling, intervals, scales and key signatures, chords, introductory harmony and structured explanations. Verify the core independently.
- **Phase 02 · First reference module.** Use the tested core APIs in a small Musical Fundamentals reference and establish the presentation conventions for later content.
- **Phase 03 · Content Engine and Content Manager.** Define and validate the versioned `.skeinpack` contract, implement the local catalogue and management workspace, and verify safe import, export, updates, backup and restoration with progress preserved.
- **Phase 04 · Interactive reference library.** Build the full interactive reference experience on the validated content catalogue, using bundled and user-imported resources.
- **Dedicated keyboard and audio phase.** Add pointer and computer keyboard input, polyphonic Web Audio, labels and annotation rendering. Build out free play, scale, chord, arpeggio and interval playback, instrument sounds and physical MIDI input as follow-on features.
- **Phase 05 · SKEIN Score integration.** Audit both repositories before implementation. Compare shared dependencies and public interfaces, identify duplicate functionality and integration blockers, then embed the existing editor with Learning and Studio configurations while preserving standalone operation. Extend the content schemas for validated score resources and exercises.
- **Later phases.** Build advanced counterpoint and composition on the integrated score editor. Expand visualisations, exercises and progress based on recorded activity.
