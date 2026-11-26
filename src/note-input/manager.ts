import type { AudioEngine, PlaybackFrame } from '../audio'
import type { NoteEvent, NoteOff, NoteOn } from './index'

export type ManagedNoteEvent = NoteOn | (NoteOff & Pick<NoteOn, 'pitch' | 'velocity'>)

export interface MidiInputPolicy {
  readonly input: boolean
  readonly feedback: boolean
}

const defaultPolicy: MidiInputPolicy = { input: true, feedback: true }

export function createNoteInputManager(audio: AudioEngine) {
  const notes = new Map<string, NoteOn>()
  const listeners = new Set<() => void>()
  const policyListeners = new Set<() => void>()
  const eventListeners = new Set<(event: ManagedNoteEvent) => void>()
  const auditions = new Map<string, Set<ReturnType<typeof setTimeout>>>()
  let snapshot: readonly NoteOn[] = []
  let policy = defaultPolicy

  function publish(event: ManagedNoteEvent) {
    snapshot = [...notes.values()]
    for (const listener of listeners) listener()
    for (const listener of eventListeners) listener(event)
  }

  const keyFor = ({ sourceId, pressId }: NoteEvent) => JSON.stringify([sourceId, pressId])

  function trackOn(note: NoteOn): boolean {
    const key = keyFor(note)
    if (notes.has(key)) return false
    notes.set(key, note)
    publish(note)
    return true
  }

  function trackOff(note: NoteOff) {
    const key = keyFor(note)
    const previous = notes.get(key)
    if (!previous) return
    notes.delete(key)
    publish({ ...previous, type: 'note-off' })
  }

  function releaseSource(source: string) {
    const timers = auditions.get(source)
    auditions.delete(source)
    if (timers) for (const timer of timers) clearTimeout(timer)
    audio.releaseSource(source)
    for (const note of notes.values()) {
      if (note.sourceId === source) trackOff({ ...note, type: 'note-off' })
    }
  }

  return {
    async dispatch(event: NoteEvent) {
      if (event.type === 'note-off') {
        audio.noteOff(event)
        trackOff(event)
        return
      }
      if (event.origin?.kind === 'midi' && !policy.input) return
      if (!trackOn(event) || notes.get(keyFor(event)) !== event) return
      try {
        await audio.noteOn(event)
      } catch (error) {
        if (notes.get(keyFor(event)) === event) trackOff({ ...event, type: 'note-off' })
        throw error
      }
    },
    async play(source: string, frames: readonly PlaybackFrame[]) {
      releaseSource(source)
      const timers = new Set<ReturnType<typeof setTimeout>>()
      auditions.set(source, timers)
      try {
        // Web Audio owns precise timing. Observers follow the same frames on the UI clock.
        await audio.play(source, frames)
      } catch (error) {
        if (auditions.get(source) === timers) releaseSource(source)
        throw error
      }
      if (auditions.get(source) !== timers) return
      function after(seconds: number, action: () => void) {
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (auditions.get(source) !== timers) return
          action()
          if (!timers.size) auditions.delete(source)
        }, seconds * 1000)
        timers.add(timer)
      }
      frames.forEach(({ pitches, offset, duration }, index) => pitches.forEach((pitch, tone) => {
        const press: NoteOn = {
          sourceId: source, pressId: index + ':' + tone, pitch, velocity: 0.8,
          origin: { kind: 'programmatic' }, type: 'note-on',
        }
        after(offset, () => { trackOn(press) })
        after(offset + duration, () => trackOff({ ...press, type: 'note-off' }))
      }))
      if (!timers.size) auditions.delete(source)
    },
    releaseSource,
    panic() {
      for (const source of auditions.keys()) releaseSource(source)
      audio.allNotesOff()
      for (const note of notes.values()) trackOff({ ...note, type: 'note-off' })
    },
    setMidiPolicy(next: MidiInputPolicy) {
      if (policy.input === next.input && policy.feedback === next.feedback) return
      policy = next
      for (const listener of policyListeners) listener()
      if (!policy.input) {
        const sources = new Set([...notes.values()].filter((note) => note.origin?.kind === 'midi').map((note) => note.sourceId))
        for (const source of sources) releaseSource(source)
      }
    },
    getMidiPolicy: () => policy,
    subscribePolicy(listener: () => void) {
      policyListeners.add(listener)
      return () => { policyListeners.delete(listener) }
    },
    getActiveNotes: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    subscribeNotes(listener: (event: ManagedNoteEvent) => void) {
      eventListeners.add(listener)
      return () => { eventListeners.delete(listener) }
    },
  }
}

export type NoteInputManager = ReturnType<typeof createNoteInputManager>
