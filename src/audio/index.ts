import type { NoteOff, NoteOn } from '../note-input'

/** Sound frequency in cycles per second, resolved by the audio layer. */
export interface AudioFrequency {
  readonly hertz: number
}

/** Shared playback contract for the future Web Audio API implementation. */
export interface AudioEngine {
  /** Initialise or resume from a user gesture. Repeated calls are safe. */
  resume(): Promise<void>
  /** Allocate a voice for this source and press pair. */
  noteOn(note: NoteOn): void
  /** Release the voice for this source and press pair. */
  noteOff(note: NoteOff): void
  /** Release every held voice from a disconnected or disabled input. */
  releaseSource(sourceId: string): void
}
