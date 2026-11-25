import { describe, expect, it } from 'vitest'
import {
  buildChord, buildScale, chordFormula, classifyHarmonicFunction, diatonicChords,
  enharmonicallyEquivalent, explainChord, explainDiatonicChord, explainHarmonicFunction,
  explainInterval, explainScale, formatNote, formatRomanNumeral, frequencyOf, fromMidi,
  identifyChords, identifyDiatonicChords, invertInterval, keySignature, makeInterval,
  measureInterval, parseNote, pitchClassOf, stepHalfSteps, toMidi, toPitch, transpose,
} from '../src/music-theory'
import type { ChordQuality, IntervalQuality, Note, ScaleKind } from '../src/music-theory'

const notes = (input: string) => input.split(' ').map(parseNote)
const render = (input: readonly Note[]) => input.map((note) => formatNote(note)).join(' ')

describe('pitch and spelling', () => {
  it.each([
    ['F#', 'F#'], ['Gb', 'Gb'], [' e♭4 ', 'Eb4'], ['C♮4', 'C4'], ['Fx', 'F##'],
    ['F𝄪5', 'F##5'], ['B𝄫-1', 'Bbb-1'], ['Gbb', 'Gbb'], ['c-1', 'C-1'], ['C0', 'C0'],
  ])('parses and round-trips %j', (input, expected) => {
    const note = parseNote(input)
    expect(formatNote(note)).toBe(expected)
    expect(parseNote(formatNote(note, 'unicode'))).toEqual(note)
  })

  it('keeps enharmonic spellings distinct and compares octaves when supplied', () => {
    const sharp = parseNote('F#4')
    const flat = parseNote('Gb4')
    expect(sharp).not.toEqual(flat)
    expect(pitchClassOf(sharp)).toBe(6)
    expect(enharmonicallyEquivalent(sharp, flat)).toBe(true)
    expect(enharmonicallyEquivalent(sharp, parseNote('Gb5'))).toBe(false)
    expect(enharmonicallyEquivalent(sharp, parseNote('Gb'))).toBe(true)
    expect(enharmonicallyEquivalent(sharp, parseNote('F'))).toBe(false)
  })

  it.each([['C-1', 0], ['C4', 60], ['A4', 69], ['B#3', 60], ['Cb4', 59], ['G9', 127]])(
    'converts %s to MIDI %i and back to its sounding pitch', (note, midi) => {
      expect(toMidi(toPitch(parseNote(note)))).toBe(midi)
      expect(fromMidi(midi)).toEqual(toPitch(parseNote(note)))
    },
  )

  it('round-trips every MIDI value and calculates frequency outside MIDI bounds', () => {
    for (let midi = 0; midi <= 127; midi++) expect(toMidi(fromMidi(midi))).toBe(midi)
    expect(frequencyOf(fromMidi(69))).toBe(440)
    expect(frequencyOf(fromMidi(81), 442)).toBe(884)
    expect(frequencyOf(toPitch(parseNote('C4')))).toBeCloseTo(261.626, 3)
    expect(frequencyOf(toPitch(parseNote('C10')))).toBeGreaterThan(16000)
  })
})

describe('intervals', () => {
  it.each<[string, string, number, IntervalQuality, number]>([
    ['B', 'D', 3, 'minor', 3],
    ['E', 'F', 2, 'minor', 1],
    ['C', 'E', 3, 'major', 4],
    ['C', 'Eb', 3, 'minor', 3],
    ['C', 'E#', 3, 'augmented', 5],
    ['F', 'B', 4, 'augmented', 6],
    ['B', 'F', 5, 'diminished', 6],
    ['C', 'G', 5, 'perfect', 7],
    ['C4', 'D5', 9, 'major', 14],
    ['C4', 'G5', 12, 'perfect', 19],
  ])('measures %s to %s', (from, to, number, quality, halfSteps) => {
    const interval = measureInterval(parseNote(from), parseNote(to))
    expect(interval).toMatchObject({ number, quality, halfSteps, direction: 'ascending' })
    expect(formatNote(transpose(parseNote(from), interval, interval.direction))).toBe(to)
  })

  it('measures descending, altered and crossed written intervals', () => {
    expect(measureInterval(parseNote('C5'), parseNote('Bb3'))).toMatchObject({
      number: 9, halfSteps: 14, quality: 'major', direction: 'descending',
    })
    expect(formatNote(transpose(parseNote('C5'), { number: 9, quality: 'major' }, 'descending'))).toBe('Bb3')
    expect(measureInterval(parseNote('C'), parseNote('F'), 'descending')).toMatchObject({
      number: 5, halfSteps: 7, quality: 'perfect', direction: 'descending',
    })
    const crossed = measureInterval(parseNote('C#4'), parseNote('Dbb4'))
    expect(crossed).toMatchObject({ number: 2, quality: 'diminished', alteration: 2, halfSteps: -1 })
    expect(formatNote(transpose(parseNote('C#4'), crossed))).toBe('Dbb4')
    expect(measureInterval(parseNote('C4'), parseNote('Cb4'))).toMatchObject({
      number: 1, quality: 'augmented', halfSteps: 1, direction: 'descending',
    })
  })

  it.each<[number, IntervalQuality, number, IntervalQuality]>([
    [1, 'perfect', 8, 'perfect'], [8, 'perfect', 1, 'perfect'],
    [3, 'major', 6, 'minor'], [3, 'minor', 6, 'major'],
    [4, 'augmented', 5, 'diminished'], [5, 'diminished', 4, 'augmented'],
    [9, 'major', 7, 'minor'], [15, 'perfect', 1, 'perfect'],
  ])('inverts %i %s', (number, quality, inverse, inverseQuality) => {
    expect(invertInterval({ number, quality })).toMatchObject({ number: inverse, quality: inverseQuality })
    expect(stepHalfSteps).toEqual({ W: 2, H: 1 })
  })
})

describe('scales and key signatures', () => {
  it.each<[string, ScaleKind, string]>([
    ['G', 'major', 'G A B C D E F#'],
    ['C#', 'major', 'C# D# E# F# G# A# B#'],
    ['Gb', 'major', 'Gb Ab Bb Cb Db Eb F'],
    ['A', 'natural-minor', 'A B C D E F G'],
    ['A', 'harmonic-minor', 'A B C D E F G#'],
    ['A', 'melodic-minor-ascending', 'A B C D E F# G#'],
    ['A4', 'melodic-minor-descending', 'A4 G4 F4 E4 D4 C4 B3'],
    ['C', 'ionian', 'C D E F G A B'],
    ['C', 'dorian', 'C D Eb F G A Bb'],
    ['C', 'phrygian', 'C Db Eb F G Ab Bb'],
    ['C', 'lydian', 'C D E F# G A B'],
    ['C', 'mixolydian', 'C D E F G A Bb'],
    ['C', 'aeolian', 'C D Eb F G Ab Bb'],
    ['C', 'locrian', 'C Db Eb F Gb Ab Bb'],
    ['C', 'chromatic', 'C C# D D# E F F# G G# A A# B'],
    ['C', 'major-pentatonic', 'C D E G A'],
    ['A', 'minor-pentatonic', 'A C D E G'],
  ])('spells %s %s', (tonic, kind, expected) => {
    const scale = buildScale(parseNote(tonic), kind)
    expect(render(scale.degrees.map(({ note }) => note))).toBe(expected)
    expect(scale.stepFormula.flatMap((step) => step.split('+'))
      .reduce((sum, step) => sum + (step === 'W' ? 2 : 1), 0)).toBe(12)
  })

  it('reports formulas, scale degrees and closing octaves', () => {
    expect(buildScale(parseNote('G4'), 'major')).toMatchObject({
      direction: 'ascending', stepFormula: ['W', 'W', 'H', 'W', 'W', 'W', 'H'], closingTonic: parseNote('G5'),
    })
    expect(buildScale(parseNote('A4'), 'melodic-minor-descending')).toMatchObject({
      direction: 'descending', closingTonic: parseNote('A3'),
    })
    expect(buildScale(parseNote('C'), 'major-pentatonic').degrees.map(({ degree }) => degree)).toEqual([1, 2, 3, 5, 6])
    expect(buildScale(parseNote('A'), 'harmonic-minor').stepFormula).toContain('W+H')
  })

  const keys = [
    ['Cb', 'Ab', -7], ['Gb', 'Eb', -6], ['Db', 'Bb', -5], ['Ab', 'F', -4], ['Eb', 'C', -3],
    ['Bb', 'G', -2], ['F', 'D', -1], ['C', 'A', 0], ['G', 'E', 1], ['D', 'B', 2],
    ['A', 'F#', 3], ['E', 'C#', 4], ['B', 'G#', 5], ['F#', 'D#', 6], ['C#', 'A#', 7],
  ] as const
  it.each(keys)('calculates the %s major and %s minor signatures', (major, minor, fifths) => {
    const order = fifths < 0 ? 'BEADGCF' : 'FCGDAEB'
    const expected = [...order.slice(0, Math.abs(fifths))].map((letter) => letter + (fifths < 0 ? 'b' : '#')).join(' ')
    for (const [key, mode] of [[major, 'major'], [minor, 'minor']] as const) {
      const signature = keySignature(parseNote(key), mode)
      expect(signature.fifths).toBe(fifths)
      expect(render(signature.accidentals)).toBe(expected)
      const scale = buildScale(parseNote(key), mode === 'major' ? 'major' : 'natural-minor')
      expect(scale.degrees.filter(({ note }) => note.accidental !== 0).map(({ note }) => formatNote(note)).sort())
        .toEqual(signature.accidentals.map((note) => formatNote(note)).sort())
    }
  })
})

describe('chords and tonal harmony', () => {
  it.each<[string, ChordQuality, string]>([
    ['F#', 'major', 'F# A# C#'], ['Gb', 'major', 'Gb Bb Db'], ['C', 'minor', 'C Eb G'],
    ['C', 'diminished', 'C Eb Gb'], ['C', 'augmented', 'C E G#'], ['C', 'major-seventh', 'C E G B'],
    ['C', 'minor-seventh', 'C Eb G Bb'], ['C', 'dominant-seventh', 'C E G Bb'],
    ['C', 'half-diminished-seventh', 'C Eb Gb Bb'], ['C', 'diminished-seventh', 'C Eb Gb Bbb'],
    ['C', 'minor-major-seventh', 'C Eb G B'], ['C', 'augmented-major-seventh', 'C E G# B'],
  ])('builds and identifies %s %s', (root, quality, expected) => {
    expect(render(buildChord(parseNote(root), quality).tones)).toBe(expected)
    expect(identifyChords(notes(expected))).toContainEqual(expect.objectContaining({ root: parseNote(root), quality }))
  })

  it('voices inversions and identifies from sounding bass with doubled notes', () => {
    expect(render(buildChord(parseNote('C4'), 'major', 1).tones)).toBe('E4 G4 C5')
    expect(render(buildChord(parseNote('C4'), 'dominant-seventh', 3).tones)).toBe('Bb4 C5 E5 G5')
    expect(identifyChords(notes('C5 G4 E4 C6'))).toEqual([
      expect.objectContaining({ quality: 'major', inversion: 1, inputBass: parseNote('E4'), bass: parseNote('E') }),
    ])
    expect(identifyChords(notes('G C E'))[0]?.inversion).toBe(2)
    expect(identifyChords(notes('C D E'))).toEqual([])
  })

  it('keeps multiple enharmonic interpretations when requested', () => {
    const input = notes('C E G#')
    expect(identifyChords(input)).toHaveLength(1)
    expect(identifyChords(input, { enharmonic: true }).map(({ root }) => formatNote(root)))
      .toEqual(['C', 'E', 'G#'])
    expect(identifyChords(notes('C E Ab'), { enharmonic: true })).toHaveLength(3)
  })

  it('stacks scale thirds, including minor-key sevenths, and formats inversions', () => {
    expect(diatonicChords(parseNote('G'), 'major').map(formatRomanNumeral))
      .toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
    expect(diatonicChords(parseNote('A'), 'harmonic-minor', 4).map(({ quality }) => quality))
      .toEqual(['minor-major-seventh', 'half-diminished-seventh', 'augmented-major-seventh',
        'minor-seventh', 'dominant-seventh', 'major-seventh', 'diminished-seventh'])
    expect(diatonicChords(parseNote('A4'), 'melodic-minor-descending'))
      .toEqual(diatonicChords(parseNote('A4'), 'natural-minor'))
    expect(render(diatonicChords(parseNote('G4'), 'major')[6]!.tones)).toBe('F#5 A5 C6')
    const [chord] = identifyDiatonicChords(parseNote('G'), 'major', notes('F#4 A4 C5 D5'))
    expect(chord?.scaleDegrees).toEqual([5, 7, 2, 4])
    expect(formatRomanNumeral(chord!)).toBe('V6/5')
    expect(formatRomanNumeral(diatonicChords(parseNote('A'), 'harmonic-minor', 4)[1]!)).toBe('iiø7')
    const pentatonic = diatonicChords(parseNote('C'), 'major-pentatonic')
    expect(pentatonic.map(({ tones }) => render(tones))).toEqual(['C E G', 'A C E'])
    expect(diatonicChords(parseNote('C'), 'major-pentatonic', 4).map(({ tones }) => render(tones)))
      .toEqual(['A C E G'])
    expect(formatRomanNumeral(diatonicChords(parseNote('A'), 'harmonic-minor', 4)[0]!)).toBe('iM7')
    expect(chordFormula('dominant-seventh').map(({ number, halfSteps }) => [number, halfSteps]))
      .toEqual([[1, 0], [3, 4], [5, 7], [7, 10]])
  })

  it.each<[string, 'major' | 'natural-minor' | 'harmonic-minor', string, string, number | undefined]>([
    ['G', 'major', 'A C E', 'predominant', 2],
    ['G', 'major', 'C E G', 'predominant', 4],
    ['G', 'major', 'D F# A', 'dominant', 5],
    ['G', 'major', 'F# A C', 'dominant', 7],
    ['G', 'major', 'G B D', 'tonic', 1],
    ['G', 'major', 'B D F#', 'context-dependent', 3],
    ['G', 'major', 'C E G Bb', 'unclassified', undefined],
    ['A', 'harmonic-minor', 'E G# B', 'dominant', 5],
    ['A', 'harmonic-minor', 'G# B D F', 'dominant', 7],
    ['A', 'natural-minor', 'E G B', 'context-dependent', 5],
    ['A', 'natural-minor', 'G B D', 'context-dependent', 7],
    ['A', 'natural-minor', 'D F A', 'predominant', 4],
  ])('classifies %s %s with %s', (tonic, kind, tones, expected, degree) => {
    const [reading] = classifyHarmonicFunction(parseNote(tonic), kind, notes(tones))
    expect(reading?.function).toBe(expected)
    expect(reading?.chord?.degree).toBe(degree)
  })
})

describe('structured explanations', () => {
  it('shows interval baselines and the next spelled W/H step', () => {
    const interval = explainInterval(parseNote('F'), parseNote('B'))
    expect(interval.steps[1]).toMatchObject({ kind: 'chromatic-distance', halfSteps: 6, baseline: 5, difference: 1 })
    const scale = explainScale(parseNote('G4'), 'major')
    expect(scale.steps.at(-1)).toMatchObject({ step: 'H', from: parseNote('F#5'), to: parseNote('G5') })
  })

  it('shows original and voiced chord tones, Roman numerals and harmonic readings', () => {
    expect(explainChord(parseNote('G4'), 'major', 1).steps[0])
      .toMatchObject({ tone: parseNote('G4'), voicedTone: parseNote('G5') })
    expect(explainDiatonicChord(parseNote('G'), 'major', notes('F#4 A4 D5')).steps.at(-1))
      .toMatchObject({ kind: 'scale-chord', scaleDegrees: [5, 7, 2], bass: parseNote('F#4'), roman: 'V6' })
    expect(explainHarmonicFunction(parseNote('G'), 'major', notes('F# A C')).steps.at(-1))
      .toMatchObject({ kind: 'function-reading', degree: 7, roman: 'vii°', function: 'dominant', chordQuality: 'diminished' })
    expect(explainHarmonicFunction(parseNote('G'), 'major', notes('C E G Bb')).steps.at(-1))
      .toMatchObject({ kind: 'function-reading', roman: null, function: 'unclassified' })
  })
})

describe('invalid inputs', () => {
  it.each(['', 'H4', 'C#b4', 'D4.5', 'F4 extra', 'C9007199254740992'])('rejects malformed note %j', (input) => {
    expect(() => parseNote(input)).toThrow(RangeError)
  })

  it.each([
    ['fractional accidental', () => formatNote({ letter: 'C', accidental: 0.5 })],
    ['missing octave', () => toPitch(parseNote('C'))],
    ['MIDI underflow', () => fromMidi(-1)],
    ['MIDI overflow', () => toMidi(toPitch(parseNote('G#9')))],
    ['fractional MIDI', () => fromMidi(1.5)],
    ['non-positive A4', () => frequencyOf(fromMidi(69), 0)],
    ['non-finite A4', () => frequencyOf(fromMidi(69), Infinity)],
    ['zero interval', () => makeInterval({ number: 0, quality: 'perfect' })],
    ['invalid quality family', () => makeInterval({ number: 5, quality: 'minor' })],
    ['invalid alteration', () => makeInterval({ number: 5, quality: 'augmented', alteration: 0 })],
    ['mixed interval octaves', () => measureInterval(parseNote('C4'), parseNote('E'))],
    ['conflicting direction', () => measureInterval(parseNote('C4'), parseNote('E4'), 'descending')],
    ['unsupported key signature', () => keySignature(parseNote('G#'), 'major')],
    ['invalid inversion', () => buildChord(parseNote('C'), 'major', 3)],
    ['mixed chord octaves', () => identifyChords(notes('C4 E G4'))],
    ['non-diatonic scale', () => diatonicChords(parseNote('C'), 'chromatic')],
    ['invalid Roman degree', () => formatRomanNumeral({ degree: 0, formula: chordFormula('minor'), inversion: 0 })],
  ] as const)('rejects %s', (_, operation) => {
    expect(operation).toThrow(RangeError)
  })
})
