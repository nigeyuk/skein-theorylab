# Roadmap

- **Phase 00 · Foundation.** Application shell, dashboard, navigation, module boundaries, shared keyboard preview and development checks.
- **Phase 01 · Music theory core.** Implement pitch and spelling, intervals, scales and key signatures, chords, introductory harmony and structured explanations. Verify the core independently.
- **Phase 02 · Virtual keyboard, audio and interactive theory.** Deliver the shared playable keyboard, Web Audio engine, basic physical MIDI input, application version display, and interactive Intervals and Chords workspaces.
- **Phase 02A · Sample-based instruments.** Add the acoustic grand, instrument selection and loading, velocity layers, safe polyphony, and synth fallback.
- **Phase 03 · Content Engine and Content Manager.** Define and validate the versioned `.skeinpack` contract, implement the local catalogue and management workspace, and verify safe import, export, updates, backup and restoration with progress preserved.
- **Phase 04 · Interactive reference library.** Build the full interactive reference experience on the validated content catalogue, using bundled and user-imported resources, including Musical Fundamentals.
- **Phase 05 · SKEIN Score integration.** Audit both repositories before implementation. Compare shared dependencies and public interfaces, identify duplicate functionality and integration blockers, then embed the existing editor with Learning and Studio configurations while preserving standalone operation. Extend the content schemas for validated score resources and exercises.
- **Later phases.** Build advanced counterpoint and composition on the integrated score editor. Expand visualisations, exercises and progress based on recorded activity. Add more instrument sounds, playback examples, advanced MIDI mapping and deeper hardware integration.
