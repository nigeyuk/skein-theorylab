import type { Pitch } from '../../music-theory'
import type { NoteEventSink } from '../../note-input'

/** Translate physical presses into source-scoped events. Repeated presses are ignored until released. */
export function createKeyboardInput(sourceId: string, emit: NoteEventSink) {
  const held = new Set<string>()

  function release(pressId: string) {
    if (held.delete(pressId)) emit({ type: 'note-off', sourceId, pressId })
  }

  return {
    press(pressId: string, pitch: Pitch, kind?: 'pointer' | 'computer') {
      if (held.has(pressId)) return false
      held.add(pressId)
      emit({ type: 'note-on', sourceId, pressId, pitch, velocity: 0.85, ...(kind ? { origin: { kind } } : {}) })
      return true
    },
    release,
    releaseAll() {
      for (const pressId of held) release(pressId)
    },
  }
}
