# Audio

The shared audio engine opens its Web Audio context on the first playback gesture. It provides polyphonic synthesised voices, note-on and note-off events by source and press, MIDI-note and frequency entry points, and audio-clock scheduling for chords and arpeggios. Master volume and mute apply to every source.

Use a distinct source ID per input or audition. Release the source when its owner unmounts or loses use of the input. Use all-notes-off for application-wide cancellation and dispose when the application is torn down. A press released during context initialisation is cancelled before it can sound.

Phase 02 uses a triangle-wave instrument and a 24-voice budget shared by live and scheduled notes. The MIDI entry point accepts note numbers. The Web MIDI adapter in the MIDI module owns physical device discovery. Sampled instruments remain future work.
