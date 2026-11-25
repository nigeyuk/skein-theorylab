export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
export const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export type NoteLetter = typeof letters[number]

/** Sounding octave changes at C. Middle C is C4. */
export interface Pitch {
  readonly pitchClass: PitchClass
  readonly octave: number
}

/** Accidentals are signed semitone offsets from the natural letter. */
export interface NoteSpelling {
  readonly letter: NoteLetter
  readonly accidental: number
}

/** Written octave, which can differ from the sounding octave across B/C. */
export interface Note extends NoteSpelling {
  readonly octave?: number
}

const naturalSteps: Record<NoteLetter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function integer(value: number, name: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(name + ' must be a safe integer')
  return value
}

export function naturalHalfSteps(letter: NoteLetter): number {
  if (!letters.includes(letter)) throw new RangeError('Invalid note letter')
  return naturalSteps[letter]
}

export function writtenHalfSteps(note: Note): number {
  return integer(
    naturalHalfSteps(note.letter) + integer(note.accidental, 'Accidental') + 12 * integer(note.octave ?? 0, 'Octave'),
    'Note height',
  )
}

export function withoutOctave(note: NoteSpelling): NoteSpelling {
  return { letter: note.letter, accidental: note.accidental }
}

/** Parse ASCII or Unicode accidentals and an optional signed octave. */
export function parseNote(input: string): Note {
  const match = /^([a-g])((?:[#♯𝄪x]+|[b♭𝄫]+|♮)?)([+-]?\d+)?$/iu.exec(input.trim())
  if (!match) throw new RangeError('Invalid note spelling: ' + input)
  const [, name, marks, octave] = match
  const accidental = [...(marks ?? '')].reduce((sum, mark) => {
    if (mark === '♮') return sum
    if (mark === 'b' || mark === 'B' || mark === '♭') return sum - 1
    if (mark === '𝄫') return sum - 2
    return sum + ('xX𝄪'.includes(mark) ? 2 : 1)
  }, 0)
  const letter = name!.toUpperCase() as NoteLetter
  return octave === undefined ? { letter, accidental } : { letter, accidental, octave: integer(Number(octave), 'Octave') }
}

/** Format using ASCII accidentals by default, or request Unicode symbols. */
export function formatNote(note: Note, style: 'ascii' | 'unicode' = 'ascii'): string {
  writtenHalfSteps(note)
  const mark = note.accidental >= 0 ? (style === 'unicode' ? '♯' : '#') : (style === 'unicode' ? '♭' : 'b')
  return note.letter + mark.repeat(Math.abs(note.accidental)) + (note.octave ?? '')
}

export function pitchClassOf(note: NoteSpelling): PitchClass {
  return mod(writtenHalfSteps(withoutOctave(note)), 12) as PitchClass
}

export function toPitch(note: Note): Pitch {
  if (note.octave === undefined) throw new RangeError('A written octave is required')
  const height = writtenHalfSteps(note)
  return { pitchClass: mod(height, 12) as PitchClass, octave: Math.floor(height / 12) }
}

function pitchHeight(pitch: Pitch): number {
  if (integer(pitch.pitchClass, 'Pitch class') < 0 || pitch.pitchClass > 11) {
    throw new RangeError('Pitch class must be between 0 and 11')
  }
  return integer(12 * integer(pitch.octave, 'Octave') + pitch.pitchClass, 'Pitch height')
}

function midiValue(value: number): number {
  if (integer(value, 'MIDI note') < 0 || value > 127) throw new RangeError('MIDI note must be between 0 and 127')
  return value
}

export function toMidi(pitch: Pitch): number {
  return midiValue(pitchHeight(pitch) + 12)
}

export function fromMidi(midi: number): Pitch {
  const height = midiValue(midi) - 12
  return { pitchClass: mod(height, 12) as PitchClass, octave: Math.floor(height / 12) }
}

/** Twelve-tone equal temperament with a configurable A4 reference in hertz. */
export function frequencyOf(pitch: Pitch, a4 = 440): number {
  if (!Number.isFinite(a4) || a4 <= 0) throw new RangeError('A4 tuning must be finite and positive')
  const frequency = a4 * 2 ** ((pitchHeight(pitch) - 57) / 12)
  if (!Number.isFinite(frequency) || frequency <= 0) throw new RangeError('Frequency is outside the numeric range')
  return frequency
}

/** Compare pitch classes if either note lacks an octave, otherwise compare sounding pitches. */
export function enharmonicallyEquivalent(first: Note, second: Note): boolean {
  if (first.octave === undefined || second.octave === undefined) {
    return pitchClassOf(first) === pitchClassOf(second)
  }
  return writtenHalfSteps(first) === writtenHalfSteps(second)
}
