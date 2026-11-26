import type { Pitch } from '../music-theory'
import type { NoteOff, NoteOn } from '../note-input'
import type { InstrumentControls } from './instrument'

export { createAudioEngine } from './web-audio'
export type { AudioEngineOptions } from './web-audio'
export { sampleInstrument } from './sampler'
export type { AudioInstrument, InstrumentControls, InstrumentDefinition, InstrumentPreferences, InstrumentNote, InstrumentState, InstrumentVoice } from './instrument'

/** Sound frequency in cycles per second. */
export interface AudioFrequency {
  readonly hertz: number
}

export interface AudioSettings {
  readonly volume: number
  readonly muted: boolean
}

export interface PlaybackFrame {
  readonly pitches: readonly Pitch[]
  readonly offset: number
  readonly duration: number
}

type VoiceAddress = Pick<NoteOn, 'sourceId' | 'pressId' | 'velocity'>

export interface AudioEngine {
  readonly instruments: InstrumentControls
  resume(): Promise<void>
  noteOn(note: NoteOn): Promise<void>
  noteOnMidi(note: VoiceAddress, midi: number): Promise<void>
  noteOnFrequency(note: VoiceAddress, frequency: AudioFrequency): Promise<void>
  noteOff(note: NoteOff): void
  /** Schedule overlapping or sequential frames. Replaces previous playback from this source. */
  play(sourceId: string, frames: readonly PlaybackFrame[]): Promise<void>
  releaseSource(sourceId: string): void
  allNotesOff(): void
  getSettings(): AudioSettings
  setSettings(settings: Partial<AudioSettings>): void
  subscribe(listener: () => void): () => void
  /** Release audio resources. A later user gesture may create a fresh context. */
  dispose(): Promise<void>
}
