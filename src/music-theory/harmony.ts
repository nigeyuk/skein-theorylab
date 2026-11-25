import { identifyDiatonicChords } from './chord'
import type { DiatonicChordMatch } from './chord'
import type { Note } from './pitch'

export type HarmonyKeyKind = 'major' | 'natural-minor' | 'harmonic-minor'
export type HarmonicFunction = 'tonic' | 'predominant' | 'dominant' | 'context-dependent' | 'unclassified'

export interface HarmonicReading {
  readonly chord: DiatonicChordMatch | null
  readonly function: HarmonicFunction
  readonly reason: string
}

function classify(chord: DiatonicChordMatch): HarmonicReading {
  const { degree, formula } = chord
  if (degree === 1) {
    return { chord, function: 'tonic', reason: 'The chord is built on the tonic. In a progression, its bass and resolution can change its function.' }
  }
  if (degree === 2 || degree === 4) {
    return { chord, function: 'predominant', reason: 'The chord is built on degree 2 or 4 and commonly prepares the dominant.' }
  }
  if ((degree === 5 && formula[1]?.quality === 'major')
    || (degree === 7 && formula[2]?.quality === 'diminished')) {
    return { chord, function: 'dominant', reason: 'The chord is built on degree 5 or 7 and contains a leading tone that tends to resolve to the tonic.' }
  }
  return { chord, function: 'context-dependent', reason: 'The scale degree can serve different roles depending on the surrounding progression.' }
}

/** Give introductory, key-relative readings for an isolated sonority. */
export function classifyHarmonicFunction(tonic: Note, kind: HarmonyKeyKind, notes: readonly Note[]): HarmonicReading[] {
  if (kind !== 'major' && kind !== 'natural-minor' && kind !== 'harmonic-minor') {
    throw new RangeError('Harmony supports major, natural minor and harmonic minor')
  }
  const matches = identifyDiatonicChords(tonic, kind, notes)
  return matches.length ? matches.map(classify) : [{
    chord: null,
    function: 'unclassified',
    reason: 'The notes do not match a diatonic triad or seventh chord in this key.',
  }]
}
