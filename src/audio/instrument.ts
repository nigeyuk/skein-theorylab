export interface InstrumentNote {
  readonly sourceId: string
  readonly hertz: number
  readonly velocity: number
  readonly start: number
  readonly duration?: number
}

export interface InstrumentVoice {
  release(): void
}

export interface AudioInstrument {
  load(signal: AbortSignal, progress: (loaded: number, total: number) => void): Promise<void>
  noteOn(note: InstrumentNote): InstrumentVoice | undefined
  /** Release after the originating input has resolved any sustain-pedal hold. */
  noteOff(voice: InstrumentVoice): void
  releaseSource(sourceId: string): void
  allNotesOff(): void
  dispose(): void
}

export interface InstrumentDefinition {
  readonly id: string
  readonly label: string
  readonly creditsUrl?: string
  create(context: AudioContext, output: AudioNode): AudioInstrument
}

export interface InstrumentPreferences {
  load(): string | null
  save(id: string): void
}

export interface InstrumentState {
  readonly selectedId: string
  readonly activeId: string
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly loaded: number
  readonly total: number
}

export interface InstrumentControls {
  readonly options: readonly Pick<InstrumentDefinition, 'id' | 'label' | 'creditsUrl'>[]
  getState(): InstrumentState
  subscribe(listener: () => void): () => void
  select(id: string): Promise<void>
}
