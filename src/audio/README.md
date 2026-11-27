# Audio

The shared audio engine opens its Web Audio context on the first playback gesture. It provides polyphonic voices, note-on and note-off by source and press, MIDI-note and frequency entry points, and audio-clock scheduling for chords and arpeggios. The shared envelope and voice bank handle note release, all-notes-off, ended nodes and disposal.

## Output gain and metering

Each instrument sums its velocity-scaled voices into its own gain bus. The piano's base voice multiplier is 0.82 and the synth's is 0.12. The dock stores an independent trim from −12 dB to +12 dB for each instrument and can reset it to 0 dB. Trim moves smoothly and applies to held notes on that instrument. The synth retains its own trim when it plays as a fallback.

The instrument buses feed master volume and mute, a stereo compressor with a −5 dB threshold and a 2 dB knee, and a final soft peak limiter. The master slider uses a power curve with unity gain at maximum. The limiter leaves samples up to 0.80 in magnitude unchanged and caps sample peaks at 0.95 (about −0.45 dBFS). The dock measures the left and right channels after the limiter and displays recent sample peaks. These readings use digital full scale and represent the signal before the operating system or audio device applies its own volume.

Register instrument definitions when creating an engine. Each instrument receives the Web Audio context and its output node, supports abortable loading with progress, and owns its voices. The manager owns readiness, selection, fallback and decoded instrument lifetimes. It keeps the triangle-wave synth ready while a selected sample instrument loads or if loading fails. Existing notes are released by the instrument that started them. Explicit switching cancels held and scheduled notes. The input manager and MIDI adapter resolve CC64 according to the originating device and channel, so both instruments receive a final note-off only after pedal release. Physical device discovery belongs to the MIDI module.

## Bundled acoustic piano

The default app preference is Acoustic grand piano. Its versioned manifest and compressed assets are served locally from `public/instruments/salamander-v1/`. The first playback gesture starts loading. Downloads and decoding are limited to four concurrent samples. Completed buffers stay cached for the life of the app audio context, including when switching instruments, and are released when the context is disposed. The app stores the preferred instrument ID locally. Failed sample loads can be retried in the dock.

The bundle has 32 mono MP3 recordings. It uses 16 roots from A0 to C8 and two real velocity layers. Nearest-root pitch shifting and nearest-layer selection are followed by velocity-dependent gain. Notes decay naturally into the recorded tail. Releases and voice stealing use gain ramps, with 24 configured voices and up to two short overlapping steal fades. Sustained notes can decay before pedal release. The app does not ship pedal noises, string resonance, release samples or long sustain loops.

The MP3 payload is 1,150,848 bytes. All 32 clips are limited to 4.5 seconds. At a 48 kHz context rate they require approximately 26.4 MiB of decoded mono Float32 sample data, plus browser and node overhead. A higher context sample rate increases that estimate proportionally. Only the selected upstream FLAC files were downloaded for conversion.

[Tone Piano](https://github.com/tambien/Piano) informed the use of sampled roots, configurable velocity layers, explicit readiness and pedal behaviour. It layers Tone.js and optional WebMidi on top of Salamander samples. MyTheoryLab implements those behaviours with its existing native audio and MIDI APIs. No Tone Piano source or runtime dependencies are included.

See the [recording attribution](../../public/instruments/salamander-v1/ATTRIBUTION.md) and [licence](../../public/instruments/salamander-v1/LICENSE.txt).
