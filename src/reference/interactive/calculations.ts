import { explainChord, explainInterval, toPitch } from '../../music-theory'
import type { ChordQuality, Interval, Note } from '../../music-theory'
import type { PlaybackFrame } from '../../audio'
import type { KeyboardKeyAnnotation } from '../../visualisation/keyboard/model'

const intervalNames = ['unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave']
const toneRoles = ['Root', 'Third', 'Fifth', 'Seventh']

export function describeInterval({ quality, alteration, number }: Interval): string {
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] ?? 'th')
  const degree = intervalNames[number - 1] ?? number + suffix
  const qualifier = alteration === 2 ? 'doubly ' : alteration === 3 ? 'triply '
    : alteration && alteration > 3 ? alteration + '× ' : ''
  return qualifier + quality + ' ' + degree
}

export function stepDistance(halfSteps: number): string {
  const magnitude = Math.abs(halfSteps)
  const wholeSteps = Math.floor(magnitude / 2)
  const steps = [wholeSteps > 0 ? (wholeSteps > 1 ? wholeSteps + 'W' : 'W') : '', magnitude % 2 ? 'H' : ''].filter(Boolean)
  return (halfSteps < 0 ? '−' : '') + (steps.join(' + ') || '0H')
}

function annotate(note: Note): KeyboardKeyAnnotation {
  return { pitch: toPitch(note), spelling: note, highlighted: true }
}

function audition(notes: readonly Note[]): { simultaneous: PlaybackFrame[]; sequential: PlaybackFrame[] } {
  const pitches = notes.map(toPitch)
  // Simultaneous enharmonic unisons share a synthesiser voice.
  const unique = new Map(pitches.map((pitch) => [pitch.octave + ':' + pitch.pitchClass, pitch]))
  return {
    simultaneous: [{ pitches: [...unique.values()], offset: 0, duration: 0.68 }],
    sequential: pitches.map((pitch, index) => ({ pitches: [pitch], offset: index * 0.36, duration: 0.30 })),
  }
}

export function intervalStudy(first: Note, second: Note) {
  const notes = [first, second]
  return { ...explainInterval(first, second), annotations: notes.map(annotate), playback: audition(notes) }
}

export function chordStudy(root: Note, quality: ChordQuality, inversion: number) {
  const explanation = explainChord(root, quality, inversion)
  const annotations = explanation.steps.map(({ voicedTone }, index) => ({
    ...annotate(voicedTone),
    chordToneRole: toneRoles[index]!,
  }))
  return { ...explanation, annotations, playback: audition(explanation.result.tones) }
}
