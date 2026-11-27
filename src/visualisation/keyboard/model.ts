import type { Note, Pitch } from '../../music-theory'

export type KeyboardAccess =
  | { readonly mode: 'available' }
  | { readonly mode: 'disabled'; readonly reason: string }
  | { readonly mode: 'hidden' }

export interface KeyboardKeyAnnotation {
  readonly pitch: Pitch
  readonly highlighted?: boolean
  readonly spelling?: Note
  readonly scaleDegree?: string
  readonly chordToneRole?: string
}

export interface KeyboardViewConfig {
  /** Inclusive octave bounds, with each octave beginning at C. */
  readonly octaveRange: { readonly first: number; readonly last: number }
  readonly showNoteLabels: boolean
  readonly highlightMiddleC: boolean
  readonly annotations: readonly KeyboardKeyAnnotation[]
}
