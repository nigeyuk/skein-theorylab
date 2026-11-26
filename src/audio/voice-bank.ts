import type { AudioInstrument, InstrumentNote, InstrumentVoice } from './instrument'

interface VoiceOptions {
  readonly attack: number
  readonly release: number
  readonly voiceGain: number
  readonly maxPolyphony: number
  readonly steal: boolean
  source(note: InstrumentNote): AudioScheduledSourceNode
}

interface Voice extends InstrumentVoice {
  readonly note: InstrumentNote
  readonly source: AudioScheduledSourceNode
  readonly gain: GainNode
  readonly level: number
  end?: { start: number; peak: number; stop: number }
  done: boolean
}

const stealRelease = 0.012
export const maxRetiringVoices = 2

/** Own the node lifecycle and envelope shared by sampled and generated voices. */
export function createVoiceBank(context: AudioContext, output: AudioNode, options: VoiceOptions): Omit<AudioInstrument, 'load'> {
  const voices = new Set<Voice>()
  const retiring = new Set<Voice>()

  function finish(voice: Voice) {
    if (voice.done) return
    voice.done = true
    voice.source.onended = null
    voice.source.disconnect()
    voice.gain.disconnect()
    voices.delete(voice)
    retiring.delete(voice)
  }

  function release(voice: Voice, seconds: number) {
    if (voice.done) return
    const now = context.currentTime
    const envelope = voice.gain.gain
    const stop = now + seconds
    if (voice.end && voice.end.stop <= stop) return
    const attackLevel = voice.level * Math.min(1, Math.max(0, (now - voice.note.start) / options.attack))
    const current = voice.end && now >= voice.end.start
      ? voice.end.peak * Math.max(0, (voice.end.stop - now) / (voice.end.stop - voice.end.start))
      : attackLevel
    envelope.cancelScheduledValues(now)
    envelope.setValueAtTime(current, now)
    envelope.linearRampToValueAtTime(0, stop)
    voice.end = { start: now, peak: current, stop }
    voice.source.stop(stop)
  }

  function stopWhere(predicate: (voice: Voice) => boolean) {
    for (const voice of [...voices, ...retiring]) {
      if (predicate(voice)) release(voice, options.release)
    }
  }

  return {
    noteOn(note) {
      if (voices.size >= options.maxPolyphony) {
        if (!options.steal || retiring.size >= maxRetiringVoices) return undefined
        const candidates = [...voices]
        const victim = candidates.find((voice) => voice.end && voice.end.start <= context.currentTime) ?? candidates[0]
        if (victim) {
          voices.delete(victim)
          retiring.add(victim)
          release(victim, stealRelease)
        }
      }

      const source = options.source(note)
      const gain = context.createGain()
      const level = note.velocity * options.voiceGain
      const voice: Voice = {
        note, source, gain, level, done: false,
        release: () => release(voice, options.release),
      }
      gain.gain.setValueAtTime(0, note.start)
      gain.gain.linearRampToValueAtTime(level, note.start + options.attack)
      if (note.duration !== undefined) {
        const end = note.start + note.duration
        voice.end = { start: end, peak: level, stop: end + options.release }
        gain.gain.setValueAtTime(level, end)
        gain.gain.linearRampToValueAtTime(0, voice.end.stop)
      }
      source.connect(gain)
      gain.connect(output)
      source.onended = () => finish(voice)
      voices.add(voice)
      source.start(note.start)
      if (voice.end) source.stop(voice.end.stop)
      return voice
    },
    noteOff: (voice) => voice.release(),
    releaseSource: (sourceId) => stopWhere((voice) => voice.note.sourceId === sourceId),
    allNotesOff: () => stopWhere(() => true),
    dispose() {
      for (const voice of [...voices, ...retiring]) {
        voice.source.stop()
        finish(voice)
      }
    },
  }
}
