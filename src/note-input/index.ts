import type { Pitch } from '../music-theory'

// Each adapter instance owns its source ID. A press ID is unique among
// currently held presses from that source and is reused for its release.
interface NotePress {
  readonly sourceId: string
  readonly pressId: string
}

export interface NoteOn extends NotePress {
  readonly type: 'note-on'
  readonly pitch: Pitch
  /** Normalised attack velocity from 0 to 1. */
  readonly velocity: number
}

export interface NoteOff extends NotePress {
  readonly type: 'note-off'
}

export type NoteEvent = NoteOn | NoteOff
export type NoteEventSink = (event: NoteEvent) => void

export interface NoteInputSource {
  readonly id: string
  /** On disconnect, release all outstanding presses before removing listeners. */
  connect(emit: NoteEventSink): () => void
}
