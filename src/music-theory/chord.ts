import { intervalFromDistance, spellOffset } from './interval'
import { integer, mod, pitchClassOf, writtenHalfSteps } from './pitch'
import { buildScale } from './scale'
import type { Interval } from './interval'
import type { Note } from './pitch'
import type { ScaleKind } from './scale'

const formulas = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  'major-seventh': [0, 4, 7, 11],
  'minor-seventh': [0, 3, 7, 10],
  'dominant-seventh': [0, 4, 7, 10],
  'half-diminished-seventh': [0, 3, 6, 10],
  'diminished-seventh': [0, 3, 6, 9],
  'minor-major-seventh': [0, 3, 7, 11],
  'augmented-major-seventh': [0, 4, 8, 11],
} as const

export type ChordQuality = keyof typeof formulas
export type ChordSize = 3 | 4

export interface Chord {
  readonly root: Note
  readonly quality: ChordQuality | null
  /** Root-relative intervals in chord-tone order. */
  readonly formula: readonly Interval[]
  /** Chord tones ordered from the inversion's bass upwards. */
  readonly tones: readonly Note[]
  readonly bass: Note
  readonly inversion: number
}

export const chordQualities: readonly ChordQuality[] = Object.freeze(Object.keys(formulas) as ChordQuality[])

export function chordFormula(quality: ChordQuality): readonly Interval[] {
  if (!Object.hasOwn(formulas, quality)) throw new RangeError('Unknown chord quality')
  return formulas[quality].map((height, index) => intervalFromDistance(2 * index + 1, height))
}

function assembleChord(root: Note, formula: readonly Interval[], quality: ChordQuality | null, inversion: number): Chord {
  if (integer(inversion, 'Inversion') < 0 || inversion >= formula.length) throw new RangeError('Invalid chord inversion')
  const tones = formula.map((_, index) => {
    const position = index + inversion
    const interval = formula[position % formula.length]!
    const wraps = position >= formula.length
    return spellOffset(root, interval.number - 1 + (wraps ? 7 : 0), interval.halfSteps + (wraps ? 12 : 0))
  })
  return { root: spellOffset(root, 0, 0), formula, tones, quality, bass: tones[0]!, inversion }
}

export function buildChord(root: Note, quality: ChordQuality, inversion = 0): Chord {
  return assembleChord(root, chordFormula(quality), quality, inversion)
}

export interface ChordMatch extends Chord {
  /** Original bass note from the input. The other chord fields describe the canonical voicing. */
  readonly inputBass: Note
}

export interface ChordIdentificationOptions {
  /** When true, compare pitch classes and allow enharmonic respellings. */
  readonly enharmonic?: boolean
}

/** Find complete chord matches. Octaves determine bass when present, otherwise use input order. */
export function identifyChords(notes: readonly Note[], options: ChordIdentificationOptions = {}): ChordMatch[] {
  const hasOctaves = notes[0]?.octave !== undefined
  for (const note of notes) {
    writtenHalfSteps(note)
    if ((note.octave !== undefined) !== hasOctaves) throw new RangeError('Supply all written octaves or none')
  }
  const identity = (note: Note) => options.enharmonic ? String(pitchClassOf(note)) : note.letter + ':' + note.accidental
  const byIdentity = new Map(notes.map((note) => [identity(note), note]))
  const bass = hasOctaves
    ? notes.reduce((lowest, note) => writtenHalfSteps(note) < writtenHalfSteps(lowest) ? note : lowest)
    : notes[0]
  if (!bass || (byIdentity.size !== 3 && byIdentity.size !== 4)) return []

  const results: ChordMatch[] = []
  for (const { letter, accidental } of byIdentity.values()) {
    const root = { letter, accidental }
    for (const quality of chordQualities) {
      if (formulas[quality].length !== byIdentity.size) continue
      const chord = buildChord(root, quality)
      if (chord.tones.every((tone) => byIdentity.has(identity(tone)))) {
        const inversion = chord.tones.findIndex((tone) => identity(tone) === identity(bass))
        const result = assembleChord(root, chord.formula, quality, inversion)
        results.push({ ...result, inputBass: bass })
      }
    }
  }
  return results
}

export interface DiatonicChord extends Chord {
  readonly degree: number
  readonly scaleDegrees: readonly number[]
}

/** Stack written thirds where the scale supplies every required tone. */
export function diatonicChords(tonic: Note, kind: ScaleKind, size: ChordSize = 3): DiatonicChord[] {
  if (size !== 3 && size !== 4) throw new RangeError('Diatonic chords must be triads or seventh chords')
  if (kind === 'chromatic') throw new RangeError('A chromatic scale has no unique diatonic degree spelling')
  const { degrees } = buildScale(tonic, kind === 'melodic-minor-descending' ? 'natural-minor' : kind)
  const byLetter = new Map(degrees.map((degree) => [degree.letterSteps, degree]))
  return degrees.flatMap(({ degree, note, halfSteps, letterSteps }) => {
    const scaleDegrees: number[] = []
    const formula: Interval[] = []
    for (let tone = 0; tone < size; tone++) {
      const position = letterSteps + 2 * tone
      const target = byLetter.get(position % 7)
      if (!target) return []
      scaleDegrees.push(target.degree)
      formula.push(intervalFromDistance(2 * tone + 1, target.halfSteps + 12 * Math.floor(position / 7) - halfSteps))
    }
    const quality = chordQualities.find((candidate) => formulas[candidate].length === size
      && formula.every((interval, i) => interval.halfSteps === formulas[candidate][i])) ?? null
    return [{ ...assembleChord(note, formula, quality, 0), degree, scaleDegrees }]
  })
}

export type DiatonicChordMatch = DiatonicChord & ChordMatch

/** Identify chords against the selected scale using written pitch names. */
export function identifyDiatonicChords(tonic: Note, kind: ScaleKind, notes: readonly Note[]): DiatonicChordMatch[] {
  const matches = identifyChords(notes)
  const size: ChordSize = matches[0]?.formula.length === 4 ? 4 : 3
  return diatonicChords(tonic, kind, size).flatMap((chord) =>
    matches.filter((match) => match.quality === chord.quality
      && match.root.letter === chord.root.letter && match.root.accidental === chord.root.accidental)
      .map((match) => ({ ...match, degree: chord.degree, scaleDegrees: chord.scaleDegrees })),
  )
}

const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export function formatRomanNumeral(chord: Pick<DiatonicChord, 'degree' | 'formula' | 'inversion'>): string {
  const numeral = romans[integer(chord.degree, 'Degree') - 1]
  if (!numeral) throw new RangeError('Roman numeral degree must be between 1 and 7')
  const [, third, fifth, seventh] = chord.formula
  if (!third || !fifth || chord.formula.length > 4) throw new RangeError('Roman numerals require a triad or seventh chord')
  const symbol = fifth.quality === 'diminished' ? (seventh?.quality === 'minor' ? 'ø' : '°')
    : fifth.quality === 'augmented' ? '+' : ''
  const figures = seventh ? ['7', '6/5', '4/3', '4/2'] : ['', '6', '6/4']
  const figure = figures[integer(chord.inversion, 'Inversion')]
  if (figure === undefined) throw new RangeError('Invalid chord inversion')
  const majorSeventh = seventh?.quality === 'major' && (third.quality === 'minor' || fifth.quality === 'augmented')
  return (mod(third.halfSteps, 12) === 3 ? numeral.toLowerCase() : numeral) + symbol + (majorSeventh ? 'M' : '') + figure
}
