import { buildChord, formatRomanNumeral, identifyDiatonicChords } from './chord'
import { classifyHarmonicFunction } from './harmony'
import { intervalBaseline, measureInterval, spellOffset } from './interval'
import { formatNote } from './pitch'
import { buildScale } from './scale'
import type { ChordQuality } from './chord'
import type { HarmonyKeyKind } from './harmony'
import type { Direction } from './interval'
import type { Note } from './pitch'
import type { ScaleKind } from './scale'

export function explainInterval(from: Note, to: Note, direction?: Direction) {
  const result = measureInterval(from, to, direction)
  const baseline = intervalBaseline(result.number)
  return {
    result,
    steps: [
      {
        kind: 'letter-count' as const,
        text: 'Count both written note names to find the interval number.',
        from, to, direction: result.direction, number: result.number,
      },
      {
        kind: 'chromatic-distance' as const,
        text: 'Measure in H and compare with the perfect or major baseline.',
        halfSteps: result.halfSteps, baseline: baseline.halfSteps,
        difference: result.halfSteps - baseline.halfSteps,
        quality: result.quality, alteration: result.alteration,
      },
    ],
  }
}

export function explainScale(tonic: Note, kind: ScaleKind) {
  const result = buildScale(tonic, kind)
  return {
    result,
    steps: result.degrees.map((degree, index) => ({
      kind: 'scale-step' as const,
      text: 'Apply the next W/H distance using the formula’s written letter.',
      from: degree.note,
      to: result.degrees[index + 1]?.note ?? result.closingTonic,
      step: result.stepFormula[index]!,
      degree,
    })),
  }
}

export function explainChord(root: Note, quality: ChordQuality, inversion = 0) {
  const result = buildChord(root, quality, inversion)
  return {
    result,
    steps: result.formula.map((interval, index) => ({
      kind: 'chord-tone' as const,
      text: 'Spell each chord tone using its letter distance and distance in H from the root.',
      root, interval,
      tone: spellOffset(root, interval.number - 1, interval.halfSteps),
      voicedTone: result.tones[(index - inversion + result.tones.length) % result.tones.length]!,
    })),
  }
}

export function explainDiatonicChord(tonic: Note, kind: ScaleKind, notes: readonly Note[]) {
  const result = identifyDiatonicChords(tonic, kind, notes)
  return {
    result,
    steps: [
      { kind: 'identify-in-scale' as const, text: 'Compare the written notes with thirds stacked in the scale.', tonic, scale: kind, notes },
      ...result.map((chord) => ({
        kind: 'scale-chord' as const,
        text: 'Use the chord root’s scale degree, quality and bass to form the Roman numeral.',
        degree: chord.degree, scaleDegrees: chord.scaleDegrees, bass: chord.inputBass, roman: formatRomanNumeral(chord),
      })),
    ],
  }
}

export function explainHarmonicFunction(tonic: Note, kind: HarmonyKeyKind, notes: readonly Note[]) {
  const result = classifyHarmonicFunction(tonic, kind, notes)
  return {
    result,
    steps: [
      { kind: 'key-context' as const, text: 'Locate the chord in the key of ' + formatNote(tonic) + '.', tonic, scale: kind, notes },
      ...result.map((reading) => ({
        kind: 'function-reading' as const, text: reading.reason, function: reading.function,
        degree: reading.chord?.degree, chordQuality: reading.chord?.quality,
        roman: reading.chord ? formatRomanNumeral(reading.chord) : null,
      })),
    ],
  }
}
