import { describe, expect, it, vi } from 'vitest'
import { createKeyboardPreferences } from '../src/storage/keyboard-preferences'

const key = 'skein-theorylab:keyboard-preferences'

function memoryStorage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values))
  return {
    getItem: vi.fn((name: string) => data.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => { data.set(name, value) }),
  }
}

describe('keyboard preferences', () => {
  it('shares the saved octave settings across workspaces and restores them on restart', () => {
    const storage = memoryStorage()
    const preferences = createKeyboardPreferences(storage)
    const chordsUpdated = vi.fn()
    const unsubscribe = preferences.subscribe(chordsUpdated)
    expect(preferences.getState()).toMatchObject({ firstOctave: 3, octaveCount: 3 })
    preferences.update({ firstOctave: 2, octaveCount: 5 })
    expect(chordsUpdated).toHaveBeenCalledOnce()
    expect(preferences.getState()).toMatchObject({ firstOctave: 2, octaveCount: 5 })
    unsubscribe()
    const restarted = createKeyboardPreferences(storage)
    expect(restarted.getState()).toMatchObject({ firstOctave: 2, octaveCount: 5 })
  })

  it('round-trips panel state, labels, instrument, audio settings and MIDI preferences', () => {
    const storage = memoryStorage()
    const preferences = createKeyboardPreferences(storage)
    const picks = {
      showNoteLabels: false, expanded: false, instrumentId: 'acoustic-grand', volume: 0.25,
      muted: true, instrumentGainsDb: { 'acoustic-grand': 12, synth: -12 }, midiDeviceId: 'usb:controller-1', midiChannel: 9,
    }
    preferences.update(picks)
    expect(createKeyboardPreferences(storage).getState()).toMatchObject(picks)
    preferences.update({ expanded: true, midiDeviceId: null, midiChannel: null })
    expect(createKeyboardPreferences(storage).getState()).toMatchObject({
      expanded: true, midiDeviceId: null, midiChannel: null,
    })
  })

  it('validates corrupt, missing and out-of-range values without discarding valid preferences', () => {
    const storage = memoryStorage({
      [key]: JSON.stringify({
        version: 1, firstOctave: 99, octaveCount: -1, showNoteLabels: 'false',
        expanded: false, instrumentId: '../piano', volume: 1.5, midiDeviceId: '', midiChannel: 17,
        instrumentGainsDb: { 'acoustic-grand': 5, synth: '5', organ: 13, '../strings': 2 },
      }),
    })
    expect(createKeyboardPreferences(storage).getState()).toEqual({
      firstOctave: 3, octaveCount: 3, showNoteLabels: true, expanded: false,
      instrumentId: null, instrumentGainsDb: { 'acoustic-grand': 5 }, volume: 0.65, muted: false, midiDeviceId: null, midiChannel: null,
    })
    const preferences = createKeyboardPreferences(memoryStorage({ [key]: '<not json>' }))
    expect(preferences.getState()).toMatchObject({ octaveCount: 3, expanded: null })
    preferences.update({ firstOctave: 8, octaveCount: 5 })
    expect(preferences.getState()).toMatchObject({ firstOctave: 5, octaveCount: 5 })
  })

  it('restores legacy instrument and preferred device without undoing explicit clearing', () => {
    const storage = memoryStorage({
      'skein-theorylab:midi-input': 'saved-usb',
      'skein-theorylab:instrument': 'synth',
    })
    const preferences = createKeyboardPreferences(storage)
    expect(preferences.getState()).toMatchObject({ instrumentId: 'synth', instrumentGainsDb: {}, midiDeviceId: 'saved-usb' })
    preferences.update({ midiDeviceId: null })
    expect(createKeyboardPreferences(storage).getState()).toMatchObject({ instrumentId: 'synth', midiDeviceId: null })
  })

  it('uses session state when storage access fails and never saves transient input state', () => {
    const unavailable = createKeyboardPreferences({
      getItem: () => { throw new Error('Storage blocked') },
      setItem: () => { throw new Error('Quota exhausted') },
    })
    unavailable.update({ octaveCount: 4, volume: 0 })
    expect(unavailable.getState()).toMatchObject({ octaveCount: 4, volume: 0 })

    const storage = memoryStorage()
    const preferences = createKeyboardPreferences(storage)
    preferences.update({ ...{ activeNotes: [60], annotations: [{ pitch: 60 }], blocked: true }, octaveCount: 4 })
    preferences.update({ octaveCount: 4 })
    expect(storage.setItem).toHaveBeenCalledOnce()
    expect(JSON.parse(storage.getItem(key)!)).not.toHaveProperty('activeNotes')
    expect(JSON.parse(storage.getItem(key)!)).not.toHaveProperty('annotations')
    expect(JSON.parse(storage.getItem(key)!)).not.toHaveProperty('blocked')
  })
})
