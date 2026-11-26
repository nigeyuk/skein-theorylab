import type { AudioInstrument, InstrumentDefinition, InstrumentPreferences, InstrumentState } from './instrument'
import { oscillatorInstrument } from './oscillator'

export function createInstrumentManager(
  definitions: readonly InstrumentDefinition[] = [],
  defaultId = oscillatorInstrument.id,
  preferences?: InstrumentPreferences,
) {
  const registered = new Map([[oscillatorInstrument.id, oscillatorInstrument]])
  for (const definition of definitions) {
    if (!definition.id || registered.has(definition.id)) throw new RangeError('Duplicate or empty instrument ID')
    registered.set(definition.id, definition)
  }
  const loaded = new Map<string, AudioInstrument>()
  const listeners = new Set<() => void>()
  let graph: { context: AudioContext; output: AudioNode } | undefined
  let loading: AbortController | undefined
  const fallback = oscillatorInstrument.id
  const preferred = preferences?.load()
  const selected = preferred && registered.has(preferred) ? preferred : registered.has(defaultId) ? defaultId : fallback
  let state: InstrumentState = {
    selectedId: selected, activeId: fallback, status: selected === fallback ? 'ready' : 'idle', loaded: 0, total: 0,
  }

  function update(changes: Partial<InstrumentState>) {
    state = { ...state, ...changes }
    for (const listener of listeners) listener()
  }

  function loadSelected() {
    if (!graph) return
    const id = state.selectedId
    if (loaded.has(id)) {
      update({ activeId: id, status: 'ready', loaded: 0, total: 0 })
      return
    }
    const request = new AbortController()
    loading = request
    update({ activeId: fallback, status: 'loading', loaded: 0, total: 0 })
    void (async () => {
      let instrument: AudioInstrument | undefined
      try {
        if (!graph || request.signal.aborted) return
        instrument = registered.get(id)!.create(graph.context, graph.output)
        await instrument.load(request.signal, (count, total) => {
          if (loading === request) update({ loaded: count, total })
        })
        if (loading !== request) { instrument.dispose(); return }
        loaded.set(id, instrument)
        update({ activeId: id, status: 'ready' })
      } catch {
        instrument?.dispose()
        if (loading === request) {
          request.abort()
          update({ activeId: fallback, status: 'error' })
        }
      } finally {
        if (loading === request) loading = undefined
      }
    })()
  }

  return {
    options: [...registered.values()].map(({ id, label, creditsUrl }) => ({ id, label, creditsUrl })),
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    select(id: string) {
      if (!registered.has(id)) throw new RangeError('Unknown instrument')
      if (id === state.selectedId && (state.status === 'loading' || state.status === 'ready')) return
      preferences?.save(id)
      loading?.abort()
      loading = undefined
      update({ selectedId: id, activeId: fallback, status: 'idle', loaded: 0, total: 0 })
      loadSelected()
    },
    attach(context: AudioContext, output: AudioNode) {
      graph = { context, output }
      loaded.set(fallback, oscillatorInstrument.create(context, output))
      loadSelected()
    },
    active: () => loaded.get(state.activeId),
    releaseSource(sourceId: string) {
      for (const instrument of loaded.values()) instrument.releaseSource(sourceId)
    },
    allNotesOff() {
      for (const instrument of loaded.values()) instrument.allNotesOff()
    },
    dispose() {
      loading?.abort()
      loading = undefined
      graph = undefined
      for (const instrument of loaded.values()) instrument.dispose()
      loaded.clear()
      update({ activeId: fallback, status: state.selectedId === fallback ? 'ready' : 'idle', loaded: 0, total: 0 })
    },
  }
}
