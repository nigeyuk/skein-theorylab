import { integer, letters, mod, naturalHalfSteps, writtenHalfSteps } from './pitch'
import type { Note } from './pitch'

export type IntervalQuality = 'perfect' | 'major' | 'minor' | 'augmented' | 'diminished'
export type Direction = 'ascending' | 'descending'
export type Step = 'W' | 'H'

export const stepHalfSteps: Readonly<Record<Step, number>> = Object.freeze({ W: 2, H: 1 })

export interface IntervalSpec {
  readonly number: number
  readonly quality: IntervalQuality
  /** Multiplicity for augmented or diminished intervals. Defaults to one. */
  readonly alteration?: number
}

export interface Interval extends IntervalSpec {
  readonly direction: Direction
  /** Relative to the written direction. Can be negative in crossed spellings. */
  readonly halfSteps: number
}

const majorSteps = [0, 2, 4, 5, 7, 9, 11]

export function intervalBaseline(number: number): { halfSteps: number; perfectFamily: boolean } {
  if (integer(number, 'Interval number') < 1) throw new RangeError('Interval number must be positive')
  const index = mod(number - 1, 7)
  return {
    halfSteps: integer(majorSteps[index]! + 12 * Math.floor((number - 1) / 7), 'Interval distance'),
    perfectFamily: index === 0 || index === 3 || index === 4,
  }
}

export function intervalFromDistance(number: number, halfSteps: number, direction: Direction = 'ascending'): Interval {
  if (direction !== 'ascending' && direction !== 'descending') throw new RangeError('Invalid interval direction')
  const baseline = intervalBaseline(number)
  const offset = integer(integer(halfSteps, 'Interval distance') - baseline.halfSteps, 'Interval offset')
  if (offset === 0) return { number, halfSteps, direction, quality: baseline.perfectFamily ? 'perfect' : 'major' }
  if (!baseline.perfectFamily && offset === -1) return { number, halfSteps, direction, quality: 'minor' }
  return {
    number, halfSteps, direction,
    quality: offset > 0 ? 'augmented' : 'diminished',
    alteration: offset > 0 ? offset : -offset - (baseline.perfectFamily ? 0 : 1),
  }
}

export function makeInterval(spec: IntervalSpec, direction: Direction = 'ascending'): Interval {
  const { number, quality, alteration } = spec
  const { halfSteps, perfectFamily } = intervalBaseline(number)
  const count = integer(alteration ?? 1, 'Interval alteration')
  if (count < 1 || (alteration !== undefined && quality !== 'augmented' && quality !== 'diminished')) {
    throw new RangeError('Invalid interval alteration')
  }

  let offset: number
  switch (quality) {
    case 'perfect':
      if (!perfectFamily) throw new RangeError('This interval number has major/minor quality')
      offset = 0
      break
    case 'major':
    case 'minor':
      if (perfectFamily) throw new RangeError('This interval number has perfect quality')
      offset = quality === 'minor' ? -1 : 0
      break
    case 'augmented':
      offset = count
      break
    case 'diminished':
      offset = -count - (perfectFamily ? 0 : 1)
      break
    default:
      throw new RangeError('Invalid interval quality')
  }
  return intervalFromDistance(number, integer(halfSteps + offset, 'Interval distance'), direction)
}

/** Move by written letter steps and sounding half steps, retaining the input's octave precision. */
export function spellOffset(root: Note, letterSteps: number, halfSteps: number): Note {
  const rootHeight = writtenHalfSteps(root)
  const position = integer(letters.indexOf(root.letter) + 7 * (root.octave ?? 0) + letterSteps, 'Letter position')
  const octave = Math.floor(position / 7)
  const letter = letters[mod(position, 7)]!
  const accidental = integer(rootHeight + halfSteps - naturalHalfSteps(letter) - 12 * octave, 'Accidental')
  return root.octave === undefined ? { letter, accidental } : { letter, accidental, octave }
}

export function transpose(note: Note, spec: IntervalSpec, direction: Direction = 'ascending'): Note {
  const interval = makeInterval(spec, direction)
  const sign = direction === 'descending' ? -1 : 1
  return spellOffset(note, sign * (interval.number - 1), sign * interval.halfSteps)
}

/** With no octaves, measure the next occurrence in the requested written direction. */
export function measureInterval(from: Note, to: Note, direction?: Direction): Interval {
  if ((from.octave === undefined) !== (to.octave === undefined)) {
    throw new RangeError('Supply both written octaves or neither')
  }
  const fromHeight = writtenHalfSteps(from)
  let height = writtenHalfSteps(to) - fromHeight
  let letterDistance = letters.indexOf(to.letter) - letters.indexOf(from.letter)
  if (from.octave === undefined) {
    const requested = direction ?? 'ascending'
    if (requested === 'ascending' && letterDistance < 0) {
      letterDistance += 7
      height += 12
    } else if (requested === 'descending' && letterDistance > 0) {
      letterDistance -= 7
      height -= 12
    }
    return intervalFromDistance(Math.abs(letterDistance) + 1, requested === 'ascending' ? height : -height, requested)
  }

  letterDistance += 7 * (to.octave! - from.octave)
  const inferred = (letterDistance || height) < 0 ? 'descending' : 'ascending'
  if (direction && direction !== inferred && letterDistance) {
    throw new RangeError('Direction conflicts with the written notes')
  }
  const resolved = direction ?? inferred
  return intervalFromDistance(Math.abs(letterDistance) + 1, resolved === 'ascending' ? height : -height, resolved)
}

/** Reduce compounds by whole octaves and complement the simple interval to an octave. */
export function invertInterval(spec: IntervalSpec, direction: Direction = 'ascending'): Interval {
  const original = makeInterval(spec, direction)
  const octaves = Math.max(0, Math.ceil((original.number - 8) / 7))
  return intervalFromDistance(9 - original.number + 7 * octaves, 12 - original.halfSteps + 12 * octaves, direction)
}
