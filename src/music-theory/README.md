# Music theory core

Import from the `src/music-theory` entry point. The core uses ECMAScript only and can be type-checked separately with `pnpm exec tsc -p tsconfig.theory.json`. Operations are deterministic and return plain data. Invalid ranges or incompatible inputs throw `RangeError`. Identification returns an empty list when valid notes yield no match.

| Area | Public API |
| --- | --- |
| Pitch | `parseNote`, `formatNote`, `pitchClassOf`, `toPitch`, `toMidi`, `fromMidi`, `frequencyOf`, `enharmonicallyEquivalent` |
| Intervals | `stepHalfSteps`, `makeInterval`, `measureInterval`, `transpose`, `invertInterval` |
| Scales | `buildScale`, `keySignature` |
| Chords | `chordFormula`, `buildChord`, `identifyChords`, `diatonicChords`, `identifyDiatonicChords`, `formatRomanNumeral` |
| Harmony | `classifyHarmonicFunction` |
| Explanations | `explainInterval`, `explainScale`, `explainChord`, `explainDiatonicChord`, `explainHarmonicFunction` |

The entry point also exports the types used by these functions, including `Note`, `NoteSpelling`, `Pitch`, `IntervalSpec`, `ScaleKind`, `ChordQuality` and `HarmonicReading`.

## Pitch and intervals

`Note` pairs a written letter and signed accidental with an optional written octave. `Pitch` stores a sounding pitch class and octave, so written B♯3 converts to sounding C4. Parse either ASCII or Unicode accidentals. Formatting defaults to ASCII and supports Unicode with `formatNote(note, 'unicode')`. MIDI conversion requires a sounding pitch and uses the range 0–127. Frequency in hertz uses twelve-tone equal temperament and defaults to A4 = 440 Hz. Enharmonic comparison uses pitch classes when either octave is absent.

W is two H. With both octaves supplied, `measureInterval` infers direction from the written register and letter, then uses chromatic movement to resolve a same-letter interval. An explicit direction can select the spelling convention for a same-letter interval. Without octaves, it measures to the next written letter in the requested direction, ascending by default, and keeps same-letter pairs within the unison. The signed `halfSteps` field is relative to written direction, so a crossed spelling can have a negative value. For example, C♯4 to D𝄫4 moves up a written letter and down one H. Inversion reduces compounds into an octave before taking the complement and preserves the supplied direction.

## Scales and chords

`buildScale` returns the degrees in traversal order, each with a spelled note and offsets from the tonic. The formula includes the step to the separate closing tonic. W+H represents three H. Melodic minor uses the classical ascending and descending forms. Ascending chromatic spelling uses one consistent raised-degree pattern. Key signatures cover the 15 conventional major and 15 relative minor keys with up to seven sharps or flats.

`buildChord` returns a root-relative formula and a close-position voicing ordered from its bass. Pass a zero-based inversion and supply a written octave to receive octave-aware voicings. `identifyChords` matches complete pitch sets, accepting doublings and open voicings. It uses the lowest sounding note with octaves and the first supplied note without them. The match reports the observed `inputBass` separately from its canonical voicing. Matching uses written names by default. Pass `{ enharmonic: true }` to compare pitch classes and allow multiple interpretations among the supplied root spellings.

`diatonicChords` stacks written thirds and returns complete triads or sevenths. With pentatonic scales it returns only complete stacks, and for descending melodic minor it uses the natural minor collection. The chromatic scale has no unique diatonic spelling and is outside this operation. Roman numerals are key-relative and include case, quality marks and inversion figures. `M` marks the major seventh on minor-major and augmented-major chords.

## Harmony and explanations

Harmony returns a list of introductory readings for major, natural minor or harmonic minor. Chords on degree 1 typically serve as tonic, chords on 2 or 4 commonly prepare the dominant, and V and leading-tone chords typically serve dominant function. Natural minor v and VII are context-dependent in this model. The result keeps scale degree, chord quality and harmonic function separate. Cadences, tonicisation and functional changes across a progression require additional context. [Open Music Theory, Introduction to Harmony](https://pressbooks.nebraska.edu/openmusictheory/chapter/intro-to-harmony/)

Each explanation returns `{ result, steps }`. Each step has a `kind` discriminator, explanatory `text` and relevant data such as a baseline, scale degree, spelled chord tone, observed bass or Roman numeral. Views can use these fields directly for visualisation.
