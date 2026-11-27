import {
  defaultOctaveRange, keyboardRange, maxKeyboardOctave, minKeyboardOctave,
} from '../visualisation/keyboard/piano-keys'
import { isInstrumentGainDb } from '../audio/gain'

const storageKey = 'skein-theorylab:keyboard-preferences'
const version = 1

export interface KeyboardPreferenceValues {
  readonly firstOctave: number
  readonly octaveCount: number
  readonly showNoteLabels: boolean
  /** Null follows the workspace's initial dock state until the user changes it. */
  readonly expanded: boolean | null
  readonly volume: number
  readonly muted: boolean
  readonly instrumentId: string | null
  readonly instrumentGainsDb: Readonly<Record<string, number>>
  readonly midiDeviceId: string | null
  readonly midiChannel: number | null
}

const defaults: KeyboardPreferenceValues = {
  firstOctave: defaultOctaveRange.first,
  octaveCount: defaultOctaveRange.last - defaultOctaveRange.first + 1,
  showNoteLabels: true,
  expanded: null,
  volume: 0.65,
  muted: false,
  instrumentId: null,
  instrumentGainsDb: {},
  midiDeviceId: null,
  midiChannel: null,
}

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage } catch { return undefined }
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isInstrumentId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value)
}

function validInstrumentGains(value: unknown): KeyboardPreferenceValues['instrumentGainsDb'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults.instrumentGainsDb
  return Object.fromEntries(Object.entries(value).filter(([id, gain]) => isInstrumentId(id) && isInstrumentGainDb(gain)))
}

function validated(record: Record<string, unknown>, instrumentGainsDb = validInstrumentGains(record.instrumentGainsDb)): KeyboardPreferenceValues {
  const count = isIntegerIn(record.octaveCount, 1, maxKeyboardOctave - minKeyboardOctave + 1)
    ? record.octaveCount : defaults.octaveCount
  const first = isIntegerIn(record.firstOctave, minKeyboardOctave, maxKeyboardOctave)
    ? record.firstOctave : defaults.firstOctave
  const range = keyboardRange(first, count)
  return {
    firstOctave: range.first,
    octaveCount: count,
    showNoteLabels: typeof record.showNoteLabels === 'boolean' ? record.showNoteLabels : defaults.showNoteLabels,
    expanded: typeof record.expanded === 'boolean' ? record.expanded : null,
    volume: typeof record.volume === 'number' && record.volume >= 0 && record.volume <= 1 ? record.volume : defaults.volume,
    muted: typeof record.muted === 'boolean' ? record.muted : defaults.muted,
    instrumentId: isInstrumentId(record.instrumentId) ? record.instrumentId : null,
    instrumentGainsDb,
    midiDeviceId: typeof record.midiDeviceId === 'string' && record.midiDeviceId.trim() && record.midiDeviceId.length <= 512
      ? record.midiDeviceId : null,
    midiChannel: isIntegerIn(record.midiChannel, 1, 16) ? record.midiChannel : null,
  }
}

export function createKeyboardPreferences(storage: PreferenceStorage | undefined = browserStorage()) {
  function read(key: string) {
    try { return storage?.getItem(key) ?? null } catch { return null }
  }

  function restore() {
    const serialized = read(storageKey)
    if (serialized !== null) {
      try {
        const value: unknown = JSON.parse(serialized)
        if (typeof value === 'object' && value !== null && 'version' in value && value.version === version) {
          return validated(value)
        }
      } catch { /* Fall back to the safe starting configuration. */ }
    }

    return validated({
      midiDeviceId: read('skein-theorylab:midi-input'),
      instrumentId: read('skein-theorylab:instrument'),
    })
  }

  let state = restore()
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    update(changes: Partial<KeyboardPreferenceValues>) {
      const next = validated({ ...state, ...changes }, changes.instrumentGainsDb === undefined ? state.instrumentGainsDb : undefined)
      if ((Object.keys(next) as (keyof KeyboardPreferenceValues)[]).every((key) => next[key] === state[key])) return
      state = next
      try { storage?.setItem(storageKey, JSON.stringify({ version, ...state })) } catch { /* Keep the session preferences. */ }
      for (const listener of listeners) listener()
    },
  }
}

export type KeyboardPreferences = ReturnType<typeof createKeyboardPreferences>
