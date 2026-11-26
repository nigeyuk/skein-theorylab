import { frequencyOf, fromMidi } from '../music-theory'
import type { NoteOn } from '../note-input'
import type { AudioEngine, AudioSettings } from './index'

const attack = 0.012
const release = 0.065
const maxVoices = 24
const maxVoiceGain = 0.05
const maxMasterGain = 0.8
const scheduleLead = 0.02

interface Voice {
  readonly sourceId: string
  readonly oscillator: OscillatorNode
  readonly gain: GainNode
  readonly start: number
  readonly level: number
  readonly end?: number
  released: boolean
}

type VoiceAddress = Pick<NoteOn, 'sourceId' | 'pressId' | 'velocity'>

function normalise(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Audio level must be finite')
  return Math.min(1, Math.max(0, value))
}

function pressKey({ sourceId, pressId }: Pick<VoiceAddress, 'sourceId' | 'pressId'>) {
  return JSON.stringify([sourceId, pressId])
}

export function createAudioEngine(createContext: () => AudioContext = () => new AudioContext()): AudioEngine {
  let context: AudioContext | undefined
  let output: GainNode | undefined
  let compressor: DynamicsCompressorNode | undefined
  let settings: AudioSettings = { volume: 0.65, muted: false }
  const listeners = new Set<() => void>()
  const voices = new Set<Voice>()
  const held = new Map<string, Voice>()
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
      nextCompressor.connect(nextContext.destination)
      context = nextContext
      output = nextOutput
      compressor = nextCompressor
    }
    if (context.state !== 'running') await context.resume()
  }

  function startVoice(sourceId: string, hertz: number, velocity: number, start: number, duration?: number): Voice | undefined {
    if (!context || !output || voices.size >= maxVoices) return undefined
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const level = velocity * maxVoiceGain
    const end = duration === undefined ? undefined : start + duration
    const voice: Voice = { sourceId, oscillator, gain, start, level, end, released: false }
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(hertz, start)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(level, start + attack)
    if (end !== undefined) {
      gain.gain.setValueAtTime(level, end)
      gain.gain.linearRampToValueAtTime(0, end + release)
    }
    oscillator.connect(gain)
    gain.connect(output)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
      voices.delete(voice)
    }
    oscillator.start(start)
    if (end !== undefined) oscillator.stop(end + release)
    voices.add(voice)
    return voice
  }

  function releaseVoice(voice: Voice) {
    if (!context || voice.released) return
    voice.released = true
    const now = context.currentTime
    const envelope = voice.gain.gain
    envelope.cancelScheduledValues(now)
    const attackLevel = Math.min(1, Math.max(0, (now - voice.start) / attack))
    const releaseLevel = voice.end === undefined ? 1 : Math.max(0, 1 - Math.max(0, now - voice.end) / release)
    const level = voice.level * Math.min(attackLevel, releaseLevel)
    envelope.setValueAtTime(level, now)
    envelope.linearRampToValueAtTime(0, now + release)
    voice.oscillator.stop(now + release)
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
      const voice = startVoice(address.sourceId, hertz, velocity, context.currentTime)
      if (voice) held.set(key, voice)
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
    for (const voice of voices) {
      if (voice.sourceId === sourceId) releaseVoice(voice)
    }
  }

  function allNotesOff() {
    pending.clear()
    held.clear()
    playback.clear()
    for (const voice of voices) releaseVoice(voice)
  }

  return {
    resume,
    noteOn: (note) => noteOnFrequency(note, { hertz: frequencyOf(note.pitch) }),
    noteOnMidi: (note, midi) => noteOnFrequency(note, { hertz: frequencyOf(fromMidi(midi)) }),
    noteOnFrequency,
    noteOff(note) {
      const key = pressKey(note)
      pending.delete(key)
      const voice = held.get(key)
      held.delete(key)
      if (voice) releaseVoice(voice)
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
        const start = context.currentTime + scheduleLead
        for (const frame of schedule) {
          for (const hertz of frame.frequencies) {
            startVoice(sourceId, hertz, 0.8, start + frame.offset, frame.duration)
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
      output = undefined
      compressor = undefined
      for (const voice of voices) {
        voice.oscillator.onended = null
        voice.oscillator.disconnect()
        voice.gain.disconnect()
      }
      voices.clear()
      if (previous && previous.state !== 'closed') await previous.close()
    },
  }
}
