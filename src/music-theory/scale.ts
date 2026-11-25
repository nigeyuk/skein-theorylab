import { spellOffset } from './interval'
import { writtenHalfSteps } from './pitch'
import type { Direction } from './interval'
import type { Note, NoteLetter, NoteSpelling } from './pitch'

const modes = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'] as const
type Mode = typeof modes[number]

export type ScaleKind = Mode | 'major' | 'natural-minor' | 'harmonic-minor'
  | 'melodic-minor-ascending' | 'melodic-minor-descending'
  | 'chromatic' | 'major-pentatonic' | 'minor-pentatonic'

const diatonic = [0, 1, 2, 3, 4, 5, 6]
const majorSteps = [2, 2, 1, 2, 2, 2, 1]

export interface ScaleDegree {
  readonly degree: number
  readonly letterSteps: number
  readonly halfSteps: number
  readonly note: Note
}

export interface Scale {
  readonly tonic: Note
  readonly kind: ScaleKind
  readonly direction: Direction
  readonly degrees: readonly ScaleDegree[]
  readonly closingTonic: Note
  /** Successive distances, including the final step to the repeated tonic. */
  readonly stepFormula: readonly string[]
}

function scaleOffsets(kind: ScaleKind): { letters: readonly number[]; heights: readonly number[] } {
  const mode = kind === 'major' ? 'ionian' : kind === 'natural-minor' ? 'aeolian' : kind
  const rotation = modes.indexOf(mode as Mode)
  if (rotation >= 0) {
    const heights = [0]
    for (let index = 0; index < 6; index++) {
      heights.push(heights[index]! + majorSteps[(index + rotation) % 7]!)
    }
    return { letters: diatonic, heights }
  }
  switch (kind) {
    case 'harmonic-minor':
      return { letters: diatonic, heights: [0, 2, 3, 5, 7, 8, 11] }
    case 'melodic-minor-ascending':
      return { letters: diatonic, heights: [0, 2, 3, 5, 7, 9, 11] }
    case 'melodic-minor-descending':
      return { letters: [0, -1, -2, -3, -4, -5, -6], heights: [0, -2, -4, -5, -7, -9, -10] }
    case 'major-pentatonic':
      return { letters: [0, 1, 2, 4, 5], heights: [0, 2, 4, 7, 9] }
    case 'minor-pentatonic':
      return { letters: [0, 2, 3, 4, 6], heights: [0, 3, 5, 7, 10] }
    case 'chromatic':
      return { letters: [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6], heights: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
    default:
      throw new RangeError('Unknown scale kind')
  }
}

export function buildScale(tonic: Note, kind: ScaleKind): Scale {
  const offsets = scaleOffsets(kind)
  const sign = kind === 'melodic-minor-descending' ? -1 : 1
  const degrees = offsets.heights.map((halfSteps, index) => {
    const letterSteps = offsets.letters[index]!
    return {
      degree: kind === 'chromatic' ? index + 1 : (letterSteps + 7) % 7 + 1,
      letterSteps, halfSteps,
      note: spellOffset(tonic, letterSteps, halfSteps),
    }
  })
  const stepFormula = offsets.heights.map((height, index) => {
    const distance = Math.abs((offsets.heights[index + 1] ?? sign * 12) - height)
    return Array.from({ length: Math.floor(distance / 2) }, () => 'W')
      .concat(distance % 2 ? ['H'] : []).join('+')
  })
  return {
    tonic: degrees[0]!.note, kind, degrees, stepFormula,
    direction: sign < 0 ? 'descending' : 'ascending',
    closingTonic: spellOffset(tonic, sign * 7, sign * 12),
  }
}

export interface KeySignature {
  /** Positive values count sharps. Negative values count flats. */
  readonly fifths: number
  readonly accidentals: readonly NoteSpelling[]
}

const sharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const
const flats = ['B', 'E', 'A', 'D', 'G', 'C', 'F'] as const
const fifthIndex: Record<NoteLetter, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 }

export function keySignature(tonic: NoteSpelling, mode: 'major' | 'minor'): KeySignature {
  writtenHalfSteps(tonic)
  if (mode !== 'major' && mode !== 'minor') throw new RangeError('Key signature mode must be major or minor')
  const fifths = fifthIndex[tonic.letter] + tonic.accidental * 7 - (mode === 'minor' ? 3 : 0)
  if (Math.abs(fifths) > 7) throw new RangeError('Key signature is outside the conventional seven sharps or flats')
  const order = fifths < 0 ? flats : sharps
  return {
    fifths,
    accidentals: order.slice(0, Math.abs(fifths)).map((letter) => ({ letter, accidental: Math.sign(fifths) })),
  }
}
