import { frequencyOf, fromMidi } from '../music-theory'
import type { NoteOn } from '../note-input'
import type { AudioEngine, AudioSettings } from './index'
import type { AudioInstrument, InstrumentDefinition, InstrumentPreferences, InstrumentVoice } from './instrument'
import { createInstrumentManager } from './instrument-manager'
import { createOutputLimiter } from './limiter'

const attack = 0.012
const maxMasterGain = 0.8
const scheduleLead = 0.02

export interface AudioEngineOptions {
  readonly instruments?: readonly InstrumentDefinition[]
  readonly defaultInstrumentId?: string
  readonly preferences?: InstrumentPreferences
}

type VoiceAddress = Pick<NoteOn, 'sourceId' | 'pressId' | 'velocity'>

function normalise(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Audio level must be finite')
  return Math.min(1, Math.max(0, value))
}

function pressKey({ sourceId, pressId }: Pick<VoiceAddress, 'sourceId' | 'pressId'>) {
  return JSON.stringify([sourceId, pressId])
}

export function createAudioEngine(
  createContext: () => AudioContext = () => new AudioContext(),
  options: AudioEngineOptions = {},
): AudioEngine {
  const instruments = createInstrumentManager(options.instruments, options.defaultInstrumentId, options.preferences)
  let context: AudioContext | undefined
  let output: GainNode | undefined
  let compressor: DynamicsCompressorNode | undefined
  let limiter: WaveShaperNode | undefined
  let settings: AudioSettings = { volume: 0.65, muted: false }
  const listeners = new Set<() => void>()
  const held = new Map<string, { sourceId: string; instrument: AudioInstrument; voice: InstrumentVoice }>()
  const pending = new Map<string, VoiceAddress>()
  const playback = new Map<string, object>()

  const outputLevel = () => settings.muted ? 0 : settings.volume * maxMasterGain

  async function resume() {
    if (!context) {
      const nextContext = createContext()
      const nextOutput = nextContext.createGain()
      const nextCompressor = nextContext.createDynamicsCompressor()
      nextOutput.gain.value = outputLevel()
      nextCompressor.threshold.value = -12
      nextOutput.connect(nextCompressor)
      const nextLimiter = createOutputLimiter(nextContext)
      nextCompressor.connect(nextLimiter)
      nextLimiter.connect(nextContext.destination)
      limiter = nextLimiter
      context = nextContext
      output = nextOutput
      compressor = nextCompressor
      instruments.attach(nextContext, nextOutput)
    }
    if (context.state !== 'running') await context.resume()
  }

  async function noteOnFrequency(address: VoiceAddress, { hertz }: { hertz: number }) {
    if (!Number.isFinite(hertz) || hertz <= 0) throw new RangeError('Frequency must be finite and positive')
    const velocity = normalise(address.velocity)
    const key = pressKey(address)
    if (held.has(key) || pending.has(key)) return
    const reservation = { ...address }
    pending.set(key, reservation)
    try {
      await resume()
      if (!context || pending.get(key) !== reservation || context.state !== 'running') return
      const instrument = instruments.active()
      if (!instrument) return
      const voice = instrument.noteOn({ sourceId: address.sourceId, hertz, velocity, start: context.currentTime })
      if (voice) held.set(key, { sourceId: address.sourceId, instrument, voice })
    } finally {
      if (pending.get(key) === reservation) pending.delete(key)
    }
  }

  function releaseSource(sourceId: string) {
    playback.delete(sourceId)
    for (const [key, press] of pending) {
      if (press.sourceId === sourceId) pending.delete(key)
    }
    for (const [key, voice] of held) {
      if (voice.sourceId === sourceId) held.delete(key)
    }
    instruments.releaseSource(sourceId)
  }

  function allNotesOff() {
    pending.clear()
    held.clear()
    playback.clear()
    instruments.allNotesOff()
  }

  return {
    instruments: {
      options: instruments.options,
      getState: instruments.getState,
      subscribe: instruments.subscribe,
      async select(id) {
        if (!instruments.options.some((option) => option.id === id)) throw new RangeError('Unknown instrument')
        allNotesOff()
        instruments.select(id)
        await resume()
      },
    },
    resume,
    noteOn: (note) => noteOnFrequency(note, { hertz: frequencyOf(note.pitch) }),
    noteOnMidi: (note, midi) => noteOnFrequency(note, { hertz: frequencyOf(fromMidi(midi)) }),
    noteOnFrequency,
    noteOff(note) {
      const key = pressKey(note)
      pending.delete(key)
      const voice = held.get(key)
      held.delete(key)
      if (voice) voice.instrument.noteOff(voice.voice)
    },
    async play(sourceId, frames) {
      const schedule = frames.map(({ pitches, offset, duration }) => {
        if (!Number.isFinite(offset) || offset < 0 || !Number.isFinite(duration) || duration < attack) {
          throw new RangeError('Invalid playback timing')
        }
        return { frequencies: pitches.map((pitch) => frequencyOf(pitch)), offset, duration }
      })
      releaseSource(sourceId)
      const reservation = {}
      playback.set(sourceId, reservation)
      try {
        await resume()
        if (!context || playback.get(sourceId) !== reservation || context.state !== 'running') return
        const instrument = instruments.active()
        const start = context.currentTime + scheduleLead
        for (const frame of schedule) {
          for (const hertz of frame.frequencies) {
            instrument?.noteOn({ sourceId, hertz, velocity: 0.8, start: start + frame.offset, duration: frame.duration })
          }
        }
      } finally {
        if (playback.get(sourceId) === reservation) playback.delete(sourceId)
      }
    },
    releaseSource,
    allNotesOff,
    getSettings: () => settings,
    setSettings(next) {
      const updated = { volume: normalise(next.volume ?? settings.volume), muted: next.muted ?? settings.muted }
      if (settings.volume === updated.volume && settings.muted === updated.muted) return
      settings = updated
      if (context && output) output.gain.setTargetAtTime(outputLevel(), context.currentTime, 0.015)
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async dispose() {
      allNotesOff()
      const previous = context
      context = undefined
      output?.disconnect()
      compressor?.disconnect()
      limiter?.disconnect()
      limiter = undefined
      output = undefined
      compressor = undefined
      instruments.dispose()
      if (previous && previous.state !== 'closed') await previous.close()
    },
  }
}
