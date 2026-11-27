import type { AudioInstrument, InstrumentDefinition, InstrumentPreferences, InstrumentState } from './instrument'
import { oscillatorInstrument } from './oscillator'
import { gainFromDb, instrumentGainRange, isInstrumentGainDb } from './gain'

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
  const buses = new Map<string, GainNode>()
  const gains = new Map<string, number>()
  for (const id of registered.keys()) {
    const saved = preferences?.loadGainDb?.(id)
    gains.set(id, isInstrumentGainDb(saved) ? saved : instrumentGainRange.default)
  }
  const listeners = new Set<() => void>()
  let graph: { context: AudioContext; output: AudioNode } | undefined
  let loading: AbortController | undefined
  const fallback = oscillatorInstrument.id
  const preferred = preferences?.load()
  const selected = preferred && registered.has(preferred) ? preferred : registered.has(defaultId) ? defaultId : fallback
  let state: InstrumentState = {
    selectedId: selected, activeId: fallback, status: selected === fallback ? 'ready' : 'idle', loaded: 0, total: 0,
    gainDb: gains.get(selected)!,
  }

  function update(changes: Partial<InstrumentState>) {
    state = { ...state, ...changes }
    for (const listener of listeners) listener()
  }

  function createInstrument(id: string, context: AudioContext, output: AudioNode) {
    let bus = buses.get(id)
    if (!bus) {
      bus = context.createGain()
      bus.gain.value = gainFromDb(gains.get(id)!)
      bus.connect(output)
      buses.set(id, bus)
    }
    return registered.get(id)!.create(context, bus)
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
        instrument = createInstrument(id, graph.context, graph.output)
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
      update({ selectedId: id, activeId: fallback, status: 'idle', loaded: 0, total: 0, gainDb: gains.get(id)! })
      loadSelected()
    },
    setGainDb(gainDb: number) {
      if (!isInstrumentGainDb(gainDb)) throw new RangeError('Instrument gain must be between -12 and +12 dB')
      const id = state.selectedId
      if (gainDb === state.gainDb) return
      gains.set(id, gainDb)
      const bus = buses.get(id)
      if (bus && graph) bus.gain.setTargetAtTime(gainFromDb(gainDb), graph.context.currentTime, 0.015)
      preferences?.saveGainDb?.(id, gainDb)
      update({ gainDb })
    },
    attach(context: AudioContext, output: AudioNode) {
      graph = { context, output }
      loaded.set(fallback, createInstrument(fallback, context, output))
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
      for (const bus of buses.values()) bus.disconnect()
      buses.clear()
      update({ activeId: fallback, status: state.selectedId === fallback ? 'ready' : 'idle', loaded: 0, total: 0 })
    },
  }
}
