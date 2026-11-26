import { parseNote, toPitch } from '../../music-theory'
import type { Note, Pitch } from '../../music-theory'
import type { KeyboardKeyAnnotation, KeyboardViewConfig } from './model'

type OctaveRange = KeyboardViewConfig['octaveRange']

const spellings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const positions = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
const shortcuts = [
  'KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM',
  'KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU',
]

export const minKeyboardOctave = -1
export const maxKeyboardOctave = 9
export const defaultOctaveRange = { first: 3, last: 5 }

export interface PianoKey {
  readonly pitch: Pitch
  readonly note: Note
  readonly position: number
  readonly accidental: boolean
}

export function noteForPitch({ pitchClass, octave }: Pitch): Note {
  return parseNote(spellings[pitchClass]! + octave)
}

export function pianoKeys({ first, last }: OctaveRange): PianoKey[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index).flatMap((octave) =>
    spellings.map((spelling, index) => {
      const note = parseNote(spelling + octave)
      return { pitch: toPitch(note), note, position: positions[index]!, accidental: note.accidental !== 0 }
    }),
  )
}

export function keyboardShortcutIndex(code: string, keyCount: number): number | undefined {
  const index = shortcuts.indexOf(code)
  return index >= 0 && index < keyCount ? index : undefined
}

export function pitchKey(pitch: Pitch): string {
  return pitch.octave + ':' + pitch.pitchClass
}

export function keyAnnotations(key: PianoKey, annotations: readonly KeyboardKeyAnnotation[]) {
  return annotations.filter(({ pitch }) => pitchKey(pitch) === pitchKey(key.pitch))
}

export function keyboardRange(first: number, count: number): OctaveRange {
  const octaves = Math.max(1, Math.min(maxKeyboardOctave - minKeyboardOctave + 1, count))
  const start = Math.max(minKeyboardOctave, Math.min(maxKeyboardOctave + 1 - octaves, first))
  return { first: start, last: start + octaves - 1 }
}

export function fitKeyboardRange(range: OctaveRange, annotations: readonly KeyboardKeyAnnotation[]): OctaveRange {
  if (!annotations.length) return range
  const octaves = annotations.map(({ pitch }) => pitch.octave)
  const lowest = Math.min(...octaves)
  const highest = Math.max(...octaves)
  if (lowest >= range.first && highest <= range.last) return range
  const count = Math.max(range.last - range.first + 1, highest - lowest + 1)
  return keyboardRange(Math.min(lowest, Math.max(range.first, highest - count + 1)), count)
}
